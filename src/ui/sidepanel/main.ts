import { groupByLessonSlot } from "../../participants/duration";
import type { ExtensionRequest, ExtensionResponse, UiEvent } from "../../shared/messages";
import type { Session, Settings } from "../../shared/models";
import { DEFAULT_SETTINGS } from "../../shared/models";
import { memoryKeyFor } from "../../storage/links";
import { copySlackClipboard, copySlackClipboardFromGroups } from "../../templates/clipboard";
import { buildStudentMessage } from "../../templates/render";
import "../common.css";

const statusEl = must("#status");
const participantsEl = must("#participants");
const resultsEl = must("#results");
const resultsSection = must("#results-section");
const createBtn = must<HTMLButtonElement>("#create");
const refreshBtn = must<HTMLButtonElement>("#refresh");
const copyAdminBtn = must<HTMLButtonElement>("#copy-admin");
const manualForm = must<HTMLFormElement>("#manual-form");
const manualName = must<HTMLInputElement>("#manual-name");
const openOptions = must<HTMLAnchorElement>("#open-options");

let session: Session | null = null;
let settings: Settings = DEFAULT_SETTINGS;
let rememberedUrls: Record<string, string> = {};

void boot();

async function boot(): Promise<void> {
  settings = await loadSettingsFromWorker();
  await refreshState(true);

  refreshBtn.addEventListener("click", () => {
    void refreshState(true);
  });

  createBtn.addEventListener("click", () => {
    void createReservations();
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
  });
}

async function refreshState(extract: boolean): Promise<void> {
  statusEl.classList.remove("error");
  if (extract) {
    statusEl.textContent = "Ищу участников на странице урока…";
    const extracted = await send({ type: "EXTRACT", tabId: await currentLessonTabId() });
    applyResponse(extracted);
  } else {
    applyResponse(await send({ type: "GET_STATE" }));
  }
  render();
}

async function createReservations(confirmClose = false): Promise<void> {
  settings = await loadSettingsFromWorker();
  createBtn.disabled = true;
  statusEl.classList.remove("error");
  statusEl.textContent = "Создаю комнаты и открываю вкладки…";
  const response = await send({ type: "CREATE", confirmClose });
  if (response.type === "CONFIRM_CLOSE") {
    const names = response.names.join(", ");
    const ok = window.confirm(
      `Вы сейчас в звонке: ${names}. Закрыть эту вкладку и продолжить?`,
    );
    if (ok) {
      applyResponse(await send({ type: "CREATE", confirmClose: true }));
    } else {
      createBtn.disabled = false;
      statusEl.textContent = "Создание отменено: вкладка звонка не закрыта.";
    }
    render();
    return;
  }
  applyResponse(response);
  render();
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
    if (response.extractError && (!session || session.participants.length === 0)) {
      statusEl.classList.add("error");
      statusEl.textContent = extractErrorText(response.extractError);
    }
  }
}

function render(): void {
  const participants = session?.participants ?? [];
  const selectedCount = participants.filter((item) => item.selected).length;

  participantsEl.replaceChildren();
  if (participants.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Пока никого нет. Откройте страницу урока или добавьте имя вручную.";
    participantsEl.append(empty);
  } else {
    for (const group of groupByLessonSlot(participants)) {
      participantsEl.append(renderGroupHeader(group.items, group.label));
      for (const participant of group.items) {
        participantsEl.append(renderParticipant(participant));
      }
    }
  }

  createBtn.disabled = selectedCount === 0;
  createBtn.textContent =
    selectedCount > 0
      ? `Создать резервные подключения (${selectedCount})`
      : "Создать резервные подключения";

  if (session && participants.length > 0 && !statusEl.classList.contains("error")) {
    statusEl.textContent = `Найдены участники: ${selectedCount} из ${participants.length}`;
  }

  const reservations = session?.reservations ?? [];
  resultsSection.hidden = reservations.length === 0;
  resultsEl.replaceChildren();
  for (const group of groupByLessonSlot(reservations)) {
    resultsEl.append(renderResultsGroup(group.label, group.items));
    for (const reservation of group.items) {
      resultsEl.append(renderReservation(reservation));
    }
  }

  if (reservations.some((item) => item.status === "ready")) {
    statusEl.classList.remove("error");
    const readyCount = reservations.filter((item) => item.status === "ready").length;
    statusEl.textContent = settings.openInNewWindow
      ? `Готово: ${readyCount} комнат в отдельном окне. Ссылки на этот урок запомнены.`
      : `Готово: ${readyCount} комнат в текущем окне. Ссылки на этот урок запомнены.`;
  }
}

function renderGroupHeader(
  items: Session["participants"],
  label: string,
): HTMLElement {
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
  text.textContent = label;

  wrap.append(checkbox, text);
  return wrap;
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
  text.textContent = participant.listName;

  const meta = document.createElement("span");
  meta.className = "skill";
  const room = roomState(participant);
  meta.textContent = [participant.skill || (participant.source === "manual" ? "вручную" : ""), room.label]
    .filter(Boolean)
    .join(" · ");

  const body = document.createElement("span");
  body.append(text, document.createElement("br"), meta);

  label.append(checkbox, body);

  const openBtn = document.createElement("button");
  openBtn.className = "btn ghost";
  openBtn.type = "button";
  openBtn.textContent = room.kind === "open" ? "К звонку" : "Открыть";
  openBtn.title =
    room.kind === "open" ? "Перейти во вкладку этого ученика" : "Открыть вкладку только для этого ученика";
  openBtn.addEventListener("click", (event) => {
    event.preventDefault();
    void openParticipant(participant.localId, openBtn);
  });

  row.append(label, openBtn);
  return row;
}

function roomState(participant: Session["participants"][number]): { kind: "open" | "ready" | "none"; label: string } {
  const reservation = matchReservation(participant);
  if (reservation?.tabId) return { kind: "open", label: "вкладка открыта" };
  const key = memoryKeyFor(participant.userId, participant.localId);
  if (reservation?.joinUrl || rememberedUrls[key]) return { kind: "ready", label: "есть ссылка" };
  return { kind: "none", label: "" };
}

function matchReservation(participant: Session["participants"][number]): Session["reservations"][number] | undefined {
  const reservations = session?.reservations ?? [];
  if (participant.userId) {
    const byUser = reservations.find((item) => item.userId === participant.userId);
    if (byUser) return byUser;
  }
  return reservations.find((item) => item.participantLocalId === participant.localId);
}

async function openParticipant(localId: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  applyResponse(await send({ type: "OPEN_TAB", localId }));
  button.disabled = false;
  render();
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

function renderResultsGroup(
  label: string,
  items: Session["reservations"],
): HTMLElement {
  const head = document.createElement("div");
  head.className = "group-head";

  const title = document.createElement("h3");
  title.className = "group-title";
  title.textContent = label;

  const copyBtn = document.createElement("button");
  copyBtn.className = "btn ghost";
  copyBtn.type = "button";
  copyBtn.textContent = "Slack";
  copyBtn.addEventListener("click", () => {
    void copyGroupSlack(items, label, copyBtn);
  });

  head.append(title, copyBtn);
  return head;
}

function renderReservation(reservation: Session["reservations"][number]): HTMLElement {
  const card = document.createElement("article");
  card.className = "result";

  const head = document.createElement("div");
  head.className = "result-head";

  const name = document.createElement("strong");
  name.textContent = reservation.listName;

  const actions = document.createElement("div");
  actions.className = "result-actions";

  const studentBtn = document.createElement("button");
  studentBtn.className = "btn";
  studentBtn.type = "button";
  studentBtn.textContent = "Для ученика";
  studentBtn.disabled = reservation.status !== "ready";
  studentBtn.addEventListener("click", () => {
    void copyStudent(reservation, studentBtn);
  });

  const slackBtn = document.createElement("button");
  slackBtn.className = "btn";
  slackBtn.type = "button";
  slackBtn.textContent = "Для Slack";
  slackBtn.disabled = reservation.status !== "ready";
  slackBtn.addEventListener("click", () => {
    void copyOneSlack(reservation, slackBtn);
  });

  const openBtn = document.createElement("button");
  openBtn.className = "btn";
  openBtn.type = "button";
  openBtn.textContent = reservation.tabId ? "К звонку" : "Открыть";
  openBtn.disabled = reservation.status !== "ready";
  openBtn.addEventListener("click", () => {
    void openParticipant(reservation.participantLocalId, openBtn);
  });

  actions.append(studentBtn, slackBtn, openBtn);
  head.append(name, actions);

  const url = document.createElement("div");
  url.className = "url";
  url.textContent =
    reservation.status === "ready"
      ? reservation.joinUrl
      : reservation.error ?? "Не удалось создать комнату";

  card.append(head, url);
  return card;
}

async function copyStudent(
  reservation: Session["reservations"][number],
  button: HTMLButtonElement,
): Promise<void> {
  settings = await loadSettingsFromWorker();
  const text = buildStudentMessage(
    settings.studentTemplate,
    reservation.greetingName,
    reservation.joinUrl,
    reservation.profileUrl,
  );
  await copyText(text, button);
}

async function copyOneSlack(
  reservation: Session["reservations"][number],
  button: HTMLButtonElement,
): Promise<void> {
  await copySlackClipboard([
    {
      name: reservation.listName,
      meetingUrl: reservation.joinUrl,
      profileUrl: reservation.profileUrl,
    },
  ]);
  copied(button);
}

async function copyGroupSlack(
  items: Session["reservations"],
  label: string,
  button: HTMLButtonElement,
): Promise<void> {
  const ready = items.filter((item) => item.status === "ready");
  await copySlackClipboardFromGroups([
    {
      label,
      items: ready.map((item) => ({
        name: item.listName,
        meetingUrl: item.joinUrl,
        profileUrl: item.profileUrl,
      })),
    },
  ]);
  copied(button);
}

async function copyAdmin(): Promise<void> {
  settings = await loadSettingsFromWorker();
  const groups = groupByLessonSlot(
    (session?.reservations ?? []).filter((item) => item.status === "ready"),
  ).map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      name: item.listName,
      meetingUrl: item.joinUrl,
      profileUrl: item.profileUrl,
    })),
  }));
  await copySlackClipboardFromGroups(groups, settings.adminHeader);
  copied(copyAdminBtn);
}

async function copyText(text: string, button: HTMLButtonElement): Promise<void> {
  await navigator.clipboard.writeText(text);
  copied(button);
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

async function currentLessonTabId(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const httpActive = tabs.find((tab) => {
    const url = tab.url ?? "";
    return tab.active && (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://"));
  });
  return httpActive?.id ?? tabs.find((tab) => tab.active)?.id;
}

async function send(request: ExtensionRequest): Promise<ExtensionResponse> {
  return chrome.runtime.sendMessage(request) as Promise<ExtensionResponse>;
}

function must<T extends HTMLElement = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Не найден элемент ${selector}`);
  return el;
}
