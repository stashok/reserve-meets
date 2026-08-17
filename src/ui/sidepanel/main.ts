import { playHelpChime } from "../chime";
import { groupByLessonSlot, sortByLessonSlot } from "../../participants/duration";
import { isVivaldi } from "../../shared/browser";
import type { ExtensionRequest, ExtensionResponse, UiEvent } from "../../shared/messages";
import type { LessonSlot, Session, Settings } from "../../shared/models";
import { DEFAULT_SETTINGS } from "../../shared/models";
import { memoryKeyFor } from "../../storage/links";
import { copySlackClipboard } from "../../templates/clipboard";
import { buildStudentMessage } from "../../templates/render";
import "../common.css";

const statusEl = must("#status");
const helpEl = must("#help");
const participantsEl = must("#participants");
const createBtn = must<HTMLButtonElement>("#create");
const createTileBtn = must<HTMLButtonElement>("#create-tile");
const refreshBtn = must<HTMLButtonElement>("#refresh");
const copyAdminBtn = must<HTMLButtonElement>("#copy-admin");
const manualForm = must<HTMLFormElement>("#manual-form");
const manualName = must<HTMLInputElement>("#manual-name");
const openOptions = must<HTMLAnchorElement>("#open-options");

let session: Session | null = null;
let settings: Settings = DEFAULT_SETTINGS;
let rememberedUrls: Record<string, string> = {};
let helpSince: Record<string, number> = {};
let collapsedGroups = new Set<string>();
let busy = false;
let busyTile = false;
let waitTimer: number | null = null;
let tileHint = "";

const COLLAPSED_KEY = "collapsedGroups";
const canTile = isVivaldi();

void boot();

async function boot(): Promise<void> {
  createTileBtn.hidden = !canTile;
  settings = await loadSettingsFromWorker();
  collapsedGroups = await loadCollapsedGroups();
  await refreshState(true);

  refreshBtn.addEventListener("click", () => {
    void refreshState(true);
  });

  createBtn.addEventListener("click", () => {
    void createReservations(false);
  });

  createTileBtn.addEventListener("click", () => {
    void createReservations(false, true);
  });

  copyAdminBtn.addEventListener("click", () => {
    void copyAdmin();
  });

  manualForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void addManual();
  });

  openOptions.addEventListener("click", (event) => {
    event.preventDefault();
    void chrome.runtime.openOptionsPage();
  });

  chrome.runtime.onMessage.addListener((message: UiEvent) => {
    if (message?.type === "STATE_CHANGED") {
      void refreshState(false);
    }
    if (message?.type === "PLAY_HELP_SOUND_UI") {
      void playHelpChime(message.volume);
    }
  });
  startWaitTicker();
}

async function refreshState(extract: boolean): Promise<void> {
  statusEl.classList.remove("error");
  applyResponse(await send({ type: "GET_STATE" }));
  render();
  if (extract) {
    setStatus("Ищу учеников…");
    applyResponse(await send({ type: "EXTRACT" }));
    render();
  }
}

async function createReservations(confirmClose = false, wantTile = false): Promise<void> {
  const tile = wantTile && canTile;
  settings = await loadSettingsFromWorker();
  busy = true;
  busyTile = tile;
  statusEl.classList.remove("error");
  tileHint = "";
  setStatus(tile ? "Создаю и размещаю…" : "Создаю комнаты…");
  render();
  try {
    const response = await send({ type: "CREATE", confirmClose, tile });
    if (response.type === "CONFIRM_CLOSE") {
      const names = response.names.join(", ");
      const ok = window.confirm(
        `Вы сейчас в звонке: ${names}. Закрыть эту вкладку и продолжить?`,
      );
      if (ok) {
        applyResponse(await send({ type: "CREATE", confirmClose: true, tile }));
      } else {
        setStatus("Отменено: вкладка звонка не закрыта.");
      }
      return;
    }
    applyResponse(response);
    if (response.type === "STATE" && response.tileHint) {
      tileHint = response.tileHint;
    }
  } finally {
    busy = false;
    busyTile = false;
    render();
  }
}

async function addManual(): Promise<void> {
  const name = manualName.value.trim();
  if (!name) return;
  applyResponse(await send({ type: "ADD_MANUAL", name }));
  manualName.value = "";
  render();
}

function applyResponse(response: ExtensionResponse): void {
  if (response.type === "ERROR") {
    statusEl.classList.add("error");
    statusEl.textContent = response.message;
    return;
  }
  if (response.type === "STATE") {
    session = response.session;
    rememberedUrls = response.rememberedUrls ?? {};
    helpSince = response.helpSince ?? {};
    if (response.extractError && (!session || session.participants.length === 0)) {
      statusEl.classList.add("error");
      statusEl.textContent = extractErrorText(response.extractError);
    }
  }
}

function render(): void {
  const participants = session?.participants ?? [];
  const selectedCount = participants.filter((item) => item.selected).length;
  const readyCount = participants.filter((item) => joinUrlFor(item)).length;

  renderHelp(participants);

  participantsEl.replaceChildren();
  if (participants.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Откройте страницу урока или добавьте имя.";
    participantsEl.append(empty);
  } else {
    for (const group of groupByLessonSlot(participants)) {
      const key = slotKey(group.slot);
      const collapsed = collapsedGroups.has(key);
      participantsEl.append(renderGroupHeader(group.items, group.label, key, collapsed));
      if (collapsed) continue;
      for (const participant of group.items) {
        participantsEl.append(renderParticipant(participant));
      }
    }
  }

  createBtn.disabled = busy || selectedCount === 0;
  createBtn.textContent = busy && !busyTile
    ? "Создаю…"
    : selectedCount > 0
      ? `Создать комнаты · ${selectedCount}`
      : "Создать комнаты";

  createTileBtn.hidden = !canTile;
  createTileBtn.disabled = !canTile || busy || selectedCount < 2;
  createTileBtn.textContent = busy && busyTile ? "Размещаю…" : "Создать и разместить";

  copyAdminBtn.hidden = readyCount === 0;

  if (!statusEl.classList.contains("error")) {
    if (busy) {
      // текст статуса уже выставлен перед запросом
    } else if (tileHint) setStatus(tileHint);
    else if (participants.length === 0) setStatus("");
    else if (readyCount > 0) setStatus(`${readyCount} ${roomsWord(readyCount)} · ${selectedCount} из ${participants.length}`);
    else setStatus(`${selectedCount} из ${participants.length}`);
  }
}

function renderHelp(participants: Session["participants"]): void {
  const items = participants
    .map((item) => {
      const tabId = matchReservation(item)?.tabId;
      const since = tabId != null ? helpSince[String(tabId)] : undefined;
      return since != null && tabId != null ? { participant: item, tabId, since } : null;
    })
    .filter((item): item is { participant: Session["participants"][number]; tabId: number; since: number } =>
      Boolean(item),
    )
    .sort((a, b) => a.since - b.since);

  helpEl.hidden = items.length === 0;
  helpEl.replaceChildren();
  if (items.length === 0) return;

  const title = document.createElement("h2");
  title.textContent = "Нужна помощь";
  helpEl.append(title);

  for (const item of items) {
    const button = document.createElement("button");
    button.className = "help-item";
    button.type = "button";
    button.addEventListener("click", () => {
      void openParticipant(item.participant.localId, item.participant.userId, button);
    });
    const name = document.createElement("span");
    name.textContent = item.participant.listName;
    button.append(name, waitLabel(item.since));
    helpEl.append(button);
  }
}

function renderGroupHeader(
  items: Session["participants"],
  label: string,
  key: string,
  collapsed: boolean,
): HTMLElement {
  const head = document.createElement("div");
  head.className = "group-head";

  const toggle = document.createElement("button");
  toggle.className = "group-toggle";
  toggle.type = "button";
  toggle.title = collapsed ? "Развернуть" : "Свернуть";
  toggle.textContent = collapsed ? "▸" : "▾";
  toggle.addEventListener("click", () => {
    void toggleCollapsed(key);
  });

  const wrap = document.createElement("label");
  wrap.className = "group-title";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  const selectedCount = items.filter((item) => item.selected).length;
  checkbox.checked = selectedCount === items.length && items.length > 0;
  checkbox.indeterminate = selectedCount > 0 && selectedCount < items.length;
  checkbox.addEventListener("change", () => {
    void toggleGroup(
      items.map((item) => item.localId),
      checkbox.checked,
    );
  });

  const text = document.createElement("span");
  text.textContent = collapsed ? `${label} · ${items.length}` : label;
  wrap.append(checkbox, text);
  head.append(toggle, wrap);

  if (items.some((item) => joinUrlFor(item))) {
    const copyBtn = document.createElement("button");
    copyBtn.className = "btn ghost";
    copyBtn.type = "button";
    copyBtn.textContent = "Slack";
    copyBtn.addEventListener("click", () => {
      void copyGroupSlack(items, copyBtn);
    });
    head.append(copyBtn);
  }

  return head;
}

function renderParticipant(participant: Session["participants"][number]): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.localId = participant.localId;

  const label = document.createElement("label");
  label.className = "row-main";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = participant.selected;
  checkbox.addEventListener("change", () => {
    void toggleSelected();
  });

  const text = document.createElement("span");
  text.className = "name";
  text.textContent = participant.listName;
  label.append(checkbox, text);

  const room = roomState(participant);
  const failed = matchReservation(participant);
  const joinUrl = joinUrlFor(participant);
  if (room.kind === "help") row.classList.add("needs-help");

  const actions = document.createElement("div");
  actions.className = "row-actions";
  const openBtn = document.createElement("button");
  openBtn.className = "btn ghost";
  openBtn.type = "button";
  openBtn.textContent = room.kind === "open" || room.kind === "help" ? "К звонку" : "Открыть";
  openBtn.addEventListener("click", (event) => {
    event.preventDefault();
    void openParticipant(participant.localId, participant.userId, openBtn);
  });
  actions.append(openBtn);

  const meta = document.createElement("div");
  meta.className = "row-meta";
  const statusBits = [
    participant.skill || (participant.source === "manual" ? "вручную" : ""),
    failed?.status === "failed" ? failed.error : room.label,
  ].filter(Boolean);
  if (statusBits.length > 0) {
    const status = document.createElement("span");
    status.className = room.kind === "help" ? "skill help" : "skill";
    status.textContent = statusBits.join(" · ");
    meta.append(status);
  }
  const helpSinceAt = matchReservation(participant)?.tabId;
  const waitingSince = helpSinceAt != null ? helpSince[String(helpSinceAt)] : undefined;
  if (waitingSince != null) {
    if (meta.childNodes.length > 0) meta.append(dot());
    meta.append(waitLabel(waitingSince));
  }
  if (joinUrl) {
    if (statusBits.length > 0) meta.append(dot());
    meta.append(
      metaAction("Ученику", (button) => copyStudentFor(participant, button)),
      dot(),
      metaAction("Slack", (button) => copyOneSlack(participant, button)),
    );
  }

  row.append(label, actions);
  if (meta.childNodes.length > 0) row.append(meta);
  return row;
}

function metaAction(label: string, onClick: (button: HTMLButtonElement) => Promise<void>): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "linkish";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void onClick(button);
  });
  return button;
}

function dot(): HTMLElement {
  const el = document.createElement("span");
  el.className = "dot";
  el.textContent = "·";
  return el;
}

function roomState(
  participant: Session["participants"][number],
): { kind: "help" | "open" | "ready" | "none"; label: string } {
  const reservation = matchReservation(participant);
  if (reservation?.tabId && helpSince[String(reservation.tabId)] != null) {
    return { kind: "help", label: "поднял руку" };
  }
  if (reservation?.tabId) return { kind: "open", label: "в звонке" };
  if (joinUrlFor(participant)) return { kind: "ready", label: "есть ссылка" };
  return { kind: "none", label: "нет ссылки" };
}

function joinUrlFor(participant: Session["participants"][number]): string {
  const reservation = matchReservation(participant);
  if (reservation?.joinUrl) return reservation.joinUrl;
  return rememberedUrls[memoryKeyFor(participant.userId, participant.localId)] ?? "";
}

function matchReservation(participant: Session["participants"][number]): Session["reservations"][number] | undefined {
  const reservations = session?.reservations ?? [];
  if (participant.userId) {
    const byUser = reservations.find((item) => item.userId === participant.userId);
    if (byUser) return byUser;
  }
  return reservations.find((item) => item.participantLocalId === participant.localId);
}

async function openParticipant(
  localId: string,
  userId: string | null,
  button: HTMLButtonElement,
): Promise<void> {
  button.disabled = true;
  try {
    applyResponse(await send({ type: "OPEN_TAB", localId, userId }));
  } finally {
    button.disabled = false;
    render();
  }
}

async function toggleGroup(localIds: string[], selected: boolean): Promise<void> {
  const current = new Set(
    (session?.participants ?? []).filter((item) => item.selected).map((item) => item.localId),
  );
  for (const id of localIds) {
    if (selected) current.add(id);
    else current.delete(id);
  }
  applyResponse(await send({ type: "SET_SELECTED", localIds: [...current] }));
  render();
}

async function toggleSelected(): Promise<void> {
  const localIds = Array.from(participantsEl.querySelectorAll(".row[data-local-id] input[type=checkbox]"))
    .filter((input) => input instanceof HTMLInputElement && input.checked)
    .map((input) => input.closest("[data-local-id]")?.getAttribute("data-local-id"))
    .filter((id): id is string => Boolean(id));

  applyResponse(await send({ type: "SET_SELECTED", localIds }));
  render();
}

async function copyStudentFor(
  participant: Session["participants"][number],
  button: HTMLButtonElement,
): Promise<void> {
  const joinUrl = joinUrlFor(participant);
  if (!joinUrl) return;
  settings = await loadSettingsFromWorker();
  const reservation = matchReservation(participant);
  const text = buildStudentMessage(
    settings.studentTemplate,
    participant.greetingName,
    joinUrl,
    reservation?.profileUrl || participant.profileUrl,
  );
  await copyText(text, button);
}

async function copyOneSlack(
  participant: Session["participants"][number],
  button: HTMLButtonElement,
): Promise<void> {
  const joinUrl = joinUrlFor(participant);
  if (!joinUrl) return;
  const reservation = matchReservation(participant);
  await copySlackClipboard([
    {
      name: participant.listName,
      meetingUrl: joinUrl,
      profileUrl: reservation?.profileUrl || participant.profileUrl,
    },
  ]);
  copied(button);
}

async function copyGroupSlack(
  items: Session["participants"],
  button: HTMLButtonElement,
): Promise<void> {
  const ready = items.flatMap((item) => {
    const joinUrl = joinUrlFor(item);
    if (!joinUrl) return [];
    const reservation = matchReservation(item);
    return [
      {
        name: item.listName,
        meetingUrl: joinUrl,
        profileUrl: reservation?.profileUrl || item.profileUrl,
      },
    ];
  });
  await copySlackClipboard(ready);
  copied(button);
}

async function copyAdmin(): Promise<void> {
  settings = await loadSettingsFromWorker();
  const items = sortByLessonSlot(session?.participants ?? []).flatMap((item) => {
    const joinUrl = joinUrlFor(item);
    if (!joinUrl) return [];
    const reservation = matchReservation(item);
    return [
      {
        name: item.listName,
        meetingUrl: joinUrl,
        profileUrl: reservation?.profileUrl || item.profileUrl,
      },
    ];
  });
  await copySlackClipboard(items, settings.adminHeader);
  copied(copyAdminBtn);
}

async function copyText(text: string, button: HTMLButtonElement): Promise<void> {
  await navigator.clipboard.writeText(text);
  copied(button);
}

function slotKey(slot: LessonSlot | null): string {
  return slot == null ? "none" : String(slot);
}

async function toggleCollapsed(key: string): Promise<void> {
  if (collapsedGroups.has(key)) collapsedGroups.delete(key);
  else collapsedGroups.add(key);
  await chrome.storage.session.set({ [COLLAPSED_KEY]: [...collapsedGroups] });
  render();
}

async function loadCollapsedGroups(): Promise<Set<string>> {
  const stored = await chrome.storage.session.get(COLLAPSED_KEY);
  const keys = stored[COLLAPSED_KEY];
  return new Set(Array.isArray(keys) ? keys.filter((key) => typeof key === "string") : []);
}

function copied(button: HTMLButtonElement): void {
  const previous = button.textContent;
  button.classList.add("copied");
  button.textContent = "Скопировано";
  window.setTimeout(() => {
    button.classList.remove("copied");
    button.textContent = previous;
  }, 1500);
}

function waitLabel(since: number): HTMLElement {
  const el = document.createElement("span");
  el.className = "wait";
  el.dataset.waitSince = String(since);
  el.textContent = formatWait(since);
  return el;
}

function formatWait(since: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function startWaitTicker(): void {
  if (waitTimer != null) return;
  waitTimer = window.setInterval(() => {
    for (const el of document.querySelectorAll<HTMLElement>("[data-wait-since]")) {
      const since = Number(el.dataset.waitSince);
      if (Number.isFinite(since)) el.textContent = formatWait(since);
    }
  }, 1000);
}

function setStatus(text: string): void {
  statusEl.classList.remove("error");
  statusEl.textContent = text;
}

function roomsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "комната";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "комнаты";
  return "комнат";
}

async function loadSettingsFromWorker(): Promise<Settings> {
  const response = await send({ type: "GET_SETTINGS" });
  return response.type === "SETTINGS" ? response.settings : DEFAULT_SETTINGS;
}

function extractErrorText(reason: string): string {
  if (reason === "no_tab") {
    return "Нет активной вкладки. Откройте страницу урока и нажмите «Обновить».";
  }
  if (reason === "not_lesson") {
    return "Не нашёл список учеников. Откройте урок или добавьте имена вручную.";
  }
  if (reason.startsWith("inject_failed")) {
    const detail = reason.slice("inject_failed:".length).replace(/^:/, "");
    return detail
      ? `Не удалось прочитать страницу: ${detail}`
      : "Не удалось прочитать страницу. Перезагрузите расширение на vivaldi://extensions и снова откройте его на вкладке урока.";
  }
  return reason;
}

async function send(request: ExtensionRequest): Promise<ExtensionResponse> {
  try {
    return (await chrome.runtime.sendMessage(request)) as ExtensionResponse;
  } catch {
    return (await chrome.runtime.sendMessage(request)) as ExtensionResponse;
  }
}

function must<T extends HTMLElement = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Не найден элемент ${selector}`);
  return el;
}
