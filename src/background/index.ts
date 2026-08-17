import { sortByLessonSlot } from "../participants/duration";
import { toParticipant, withDisplayNames } from "../participants/names";
import { resolveProfileUrl } from "../participants/profileUrl";
import { buildJitsiUrl } from "../providers/jitsi";
import type { ExtensionRequest, ExtensionResponse } from "../shared/messages";
import type { Reservation, Session } from "../shared/models";
import { lessonKeyFromUrl, loadLinkMemory, memoryKeyFor, rememberJoinUrls } from "../storage/links";
import { loadExtractError, loadSession, saveExtractError, saveSession } from "../storage/session";
import { loadSettings, saveSettings } from "../storage/settings";
import { buildSlackClipboard } from "../templates/clipboard";
import { buildStudentMessage } from "../templates/render";
import { activeMeetingTabIds, focusTab, openMeetingTabs, orderTabs, syncMeetingTabs, tabStillOpen, tabsThatWillClose } from "./tabs";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message: ExtensionRequest, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then(sendResponse)
    .catch((error: unknown) => {
      const response: ExtensionResponse = {
        type: "ERROR",
        message: error instanceof Error ? error.message : "Неизвестная ошибка",
      };
      sendResponse(response);
    });
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== "complete") return;
  void injectMeetingUi(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void forgetClosedTab(tabId);
});

async function handleMessage(
  message: ExtensionRequest,
  sender: chrome.runtime.MessageSender,
): Promise<ExtensionResponse> {
  switch (message.type) {
    case "GET_STATE":
      return stateResponse();
    case "EXTRACT":
      await extractFromTab(message.tabId);
      return stateResponse();
    case "SET_SELECTED":
      await setSelected(message.localIds);
      return stateResponse();
    case "ADD_MANUAL":
      await addManual(message.name);
      return stateResponse();
    case "CREATE":
      return createReservations(message.confirmClose === true);
    case "OPEN_TAB":
      return openParticipantTab(message.localId, message.userId);
    case "GET_SETTINGS": {
      const settings = await loadSettings();
      return { type: "SETTINGS", settings };
    }
    case "SAVE_SETTINGS":
      await saveSettings(message.settings);
      return { type: "SAVED" };
    case "GET_TAB_OVERLAY":
      return overlayForTab(sender.tab?.id);
    case "SET_OVERLAY_COLLAPSED":
      await setOverlayCollapsed(sender.tab?.id, message.collapsed);
      return overlayForTab(sender.tab?.id);
    case "GET_MENU_STATE":
      return menuState();
    case "OPEN_PANEL":
      return openPanelFromMenu();
    case "SET_OVERLAY_HIDDEN":
      await setOverlayHidden(message.tabId ?? sender.tab?.id, message.hidden);
      return overlayForTab(message.tabId ?? sender.tab?.id);
    default:
      return { type: "ERROR", message: "Неизвестный запрос" };
  }
}

async function stateResponse(): Promise<ExtensionResponse> {
  const session = await reconcileSession(await loadSession());
  const extractError = await loadExtractError();
  const rememberedUrls = session ? (await loadLinkMemory(session.pageUrl)).urls : {};
  return { type: "STATE", session, extractError, rememberedUrls };
}

async function reconcileSession(session: Session | null): Promise<Session | null> {
  if (!session) return null;
  let changed = false;
  const reservations = [];
  for (const item of session.reservations) {
    if (item.tabId == null) {
      reservations.push(item);
      continue;
    }
    const tab = await tabStillOpen(item.tabId);
    if (tab?.id) {
      const windowId = tab.windowId ?? item.windowId;
      if (windowId !== item.windowId) changed = true;
      reservations.push({ ...item, windowId });
    } else {
      changed = true;
      reservations.push({ ...item, tabId: null, windowId: null });
    }
  }
  if (!changed) return session;
  const next = { ...session, reservations };
  await saveSession(next);
  return next;
}

async function activeTabId(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const httpActive = tabs.find((tab) => tab.active && isHttpTab(tab));
  return httpActive?.id ?? tabs.find((tab) => tab.active)?.id;
}

function isHttpTab(tab: chrome.tabs.Tab): boolean {
  const url = tab.url ?? "";
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://");
}

type ExtractResult = {
  found: boolean;
  participants: Array<{
    userId: string;
    firstName: string;
    lastName: string;
    skill: string;
    profileUrl?: string;
    duration?: number | string | null;
  }>;
};

async function injectExtract(tabId: number): Promise<Array<{ result?: ExtractResult }>> {
  const results: Array<{ result?: ExtractResult }> = [];

  const run = async (frameIds?: number[]): Promise<Array<{ result?: ExtractResult }>> => {
    const injected = await chrome.scripting.executeScript({
      target: frameIds ? { tabId, frameIds } : { tabId },
      files: ["extract.js"],
    });
    return injected.map((item) => ({ result: item.result as ExtractResult | undefined }));
  };

  try {
    results.push(...(await run([0])));
  } catch {
    results.push(...(await run()));
  }

  if (results.some((frame) => frame.result?.found)) {
    return results;
  }

  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    for (const frame of frames ?? []) {
      if (frame.frameId === 0) continue;
      const url = frame.url ?? "";
      if (
        url.startsWith("chrome") ||
        url.startsWith("vivaldi:") ||
        url.startsWith("about:") ||
        url.startsWith("chrome-extension:")
      ) {
        continue;
      }
      try {
        results.push(...(await run([frame.frameId])));
      } catch {
        // iframe без доступа — пропускаем
      }
    }
  } catch {
    // webNavigation недоступен
  }

  return results;
}

async function resolveTargetTabId(explicit?: number): Promise<number | undefined> {
  if (explicit !== undefined) return explicit;

  const session = await loadSession();
  if (session?.lessonTabId) {
    const remembered = await chrome.tabs.get(session.lessonTabId).catch(() => undefined);
    if (remembered?.id) return remembered.id;
  }

  return activeTabId();
}

async function extractFromTab(tabId?: number): Promise<void> {
  const targetId = await resolveTargetTabId(tabId);
  const previous = await loadSession();

  if (targetId === undefined) {
    if (!previous?.participants.length) await saveExtractError("no_tab");
    return;
  }

  const tab = await chrome.tabs.get(targetId).catch(() => undefined);
  if (!tab?.id) {
    if (!previous?.participants.length) await saveExtractError("no_tab");
    return;
  }

  try {
    const injection = await injectExtract(tab.id);

    const detected: ReturnType<typeof toParticipant>[] = [];
    const seen = new Set<string>();

    for (const frame of injection) {
      const result = frame.result;
      if (!result?.found) continue;
      for (const raw of result.participants) {
        const key = raw.userId || `${raw.firstName}|${raw.lastName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        detected.push(toParticipant(raw));
      }
    }

    if (detected.length === 0) {
      if (!previous?.participants.length) await saveExtractError("not_lesson");
      return;
    }

    const selectedMap = new Map(
      previous?.participants.map((item) => [item.userId ?? item.localId, item.selected]),
    );

    const previousByUser = new Map(
      (previous?.participants ?? [])
        .filter((item) => item.userId)
        .map((item) => [item.userId as string, item]),
    );

    const settings = await loadSettings();
    const pageUrl = tab.url ?? previous?.pageUrl ?? "";
    const participants = withDisplayNames([
      ...detected.map((item) => {
        const remembered = item.userId ? previousByUser.get(item.userId) : undefined;
        return {
          ...item,
          localId: remembered?.localId ?? item.localId,
          selected: item.userId ? (selectedMap.get(item.userId) ?? true) : true,
        };
      }),
      ...(previous?.participants
        .filter((item) => item.source === "manual")
        .map((item) => ({
          localId: item.localId,
          userId: item.userId,
          firstName: item.firstName,
          lastName: item.lastName,
          skill: item.skill,
          profileUrl: item.profileUrl,
          duration: item.duration,
          source: item.source,
          selected: item.selected,
        })) ?? []),
    ]).map((item) => ({
      ...item,
      profileUrl: resolveProfileUrl({
        userId: item.userId,
        scrapedUrl: item.profileUrl,
        pageUrl,
        template: settings.profileUrlTemplate,
      }),
    }));
    const sorted = sortByLessonSlot(participants);
    const lessonChanged =
      Boolean(previous?.pageUrl) &&
      lessonKeyFromUrl(pageUrl) !== lessonKeyFromUrl(previous?.pageUrl ?? "");

    const staleTabIds =
      lessonChanged && previous?.reservations.length
        ? uniqueNumbers([
            ...(previous.staleTabIds ?? []),
            ...previous.reservations.map((item) => item.tabId),
          ])
        : (previous?.staleTabIds ?? []);

    const reservations = lessonChanged
      ? []
      : (previous?.reservations ?? []).map((reservation) => {
          const match = sorted.find(
            (item) =>
              (reservation.userId && item.userId === reservation.userId) ||
              item.localId === reservation.participantLocalId,
          );
          return match
            ? {
                ...reservation,
                participantLocalId: match.localId,
                listName: match.listName,
                greetingName: match.greetingName,
                userId: match.userId,
              }
            : reservation;
        });

    const session: Session = {
      id: previous?.id ?? crypto.randomUUID(),
      createdAt: previous?.createdAt ?? new Date().toISOString(),
      pageUrl,
      pageTitle: tab.title ?? previous?.pageTitle ?? "",
      lessonTabId: tab.id,
      participants: sorted,
      reservations,
      staleTabIds,
    };

    await saveSession(session);
    await saveExtractError(null);
  } catch (error) {
    if (!previous?.participants.length) {
      const detail = error instanceof Error ? error.message : String(error);
      await saveExtractError(`inject_failed:${detail}`);
    }
  }
}

async function setSelected(localIds: string[]): Promise<void> {
  const session = await loadSession();
  if (!session) return;

  const selected = new Set(localIds);
  await saveSession({
    ...session,
    participants: session.participants.map((item) => ({
      ...item,
      selected: selected.has(item.localId),
    })),
  });
}

async function addManual(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  const session = (await loadSession()) ?? emptySession();
  const [firstName, ...rest] = trimmed.split(/\s+/);
  const lastName = rest.join(" ");

  const added = withDisplayNames([
    ...session.participants,
    {
      localId: crypto.randomUUID(),
      userId: null,
      firstName,
      lastName,
      skill: "",
      profileUrl: "",
      duration: null,
      source: "manual" as const,
      selected: true,
    },
  ]);

  await saveSession({ ...session, participants: added });
  await saveExtractError(null);
}

async function createReservations(confirmClose: boolean): Promise<ExtensionResponse> {
  const session = await loadSession();
  if (!session) return stateResponse();

  const settings = await loadSettings();
  const memory = await loadLinkMemory(session.pageUrl);
  const selected = sortByLessonSlot(session.participants.filter((item) => item.selected));
  const usedUrls = new Set(Object.values(memory.urls));
  const remembered: Record<string, string> = {};

  const pending: Reservation[] = selected.map((participant) => {
    const key = memoryKeyFor(participant.userId, participant.localId);
    const profileUrl = resolveProfileUrl({
      userId: participant.userId,
      scrapedUrl: participant.profileUrl,
      pageUrl: session.pageUrl,
      template: settings.profileUrlTemplate,
    });

    try {
      let joinUrl = memory.urls[key];
      if (!joinUrl) {
        joinUrl = buildJitsiUrl(settings.jitsiBaseUrl, settings.roomNamespace);
        while (usedUrls.has(joinUrl)) {
          joinUrl = buildJitsiUrl(settings.jitsiBaseUrl, settings.roomNamespace);
        }
        usedUrls.add(joinUrl);
      }
      remembered[key] = joinUrl;
      return {
        participantLocalId: participant.localId,
        listName: participant.listName,
        greetingName: participant.greetingName,
        userId: participant.userId,
        joinUrl,
        profileUrl,
        duration: participant.duration,
        tabId: null,
        windowId: null,
        status: "ready" as const,
        error: null,
      };
    } catch (error) {
      return {
        participantLocalId: participant.localId,
        listName: participant.listName,
        greetingName: participant.greetingName,
        userId: participant.userId,
        joinUrl: "",
        profileUrl,
        duration: participant.duration,
        tabId: null,
        windowId: null,
        status: "failed" as const,
        error: error instanceof Error ? error.message : "Не удалось создать ссылку",
      };
    }
  });

  const closeIds = await tabsThatWillClose(pending, session.reservations, session.staleTabIds ?? []);
  const activeIds = await activeMeetingTabIds(closeIds);
  if (activeIds.length > 0 && !confirmClose) {
    const names = session.reservations
      .filter((item) => item.tabId != null && activeIds.includes(item.tabId))
      .map((item) => item.listName);
    return {
      type: "CONFIRM_CLOSE",
      names: names.length > 0 ? names : ["текущий звонок"],
    };
  }

  await rememberJoinUrls(session.pageUrl, remembered);
  const opened = await syncMeetingTabs(
    pending,
    session.reservations,
    settings,
    session.staleTabIds ?? [],
  );
  await saveSession({ ...session, reservations: opened, staleTabIds: [] });
  for (const reservation of opened) {
    if (reservation.tabId) void injectMeetingUi(reservation.tabId);
  }
  return stateResponse();
}

async function openParticipantTab(
  localId: string,
  userId?: string | null,
): Promise<ExtensionResponse> {
  const session = await reconcileSession(await loadSession());
  if (!session) return { type: "ERROR", message: "Сначала откройте страницу урока" };

  const participant =
    session.participants.find((item) => item.localId === localId) ??
    session.participants.find((item) => userId && item.userId === userId) ??
    session.participants.find((item) => {
      const reservation = session.reservations.find((row) => row.participantLocalId === localId);
      return Boolean(reservation?.userId && item.userId === reservation.userId);
    });

  const existing =
    (participant ? matchReservation(session.reservations, participant) : undefined) ??
    session.reservations.find((item) => item.participantLocalId === localId) ??
    session.reservations.find((item) => userId && item.userId === userId);

  if (existing?.tabId) {
    const live = await tabStillOpen(existing.tabId);
    if (live?.id) {
      await focusTab(live.id);
      return stateResponse();
    }
  }

  const settings = await loadSettings();
  const memory = await loadLinkMemory(session.pageUrl);
  const key = memoryKeyFor(
    participant?.userId ?? existing?.userId ?? userId ?? null,
    participant?.localId ?? localId,
  );
  const usedUrls = new Set(Object.values(memory.urls));
  let joinUrl = existing?.joinUrl || memory.urls[key];
  if (!joinUrl) {
    joinUrl = buildJitsiUrl(settings.jitsiBaseUrl, settings.roomNamespace);
    while (usedUrls.has(joinUrl)) {
      joinUrl = buildJitsiUrl(settings.jitsiBaseUrl, settings.roomNamespace);
    }
    await rememberJoinUrls(session.pageUrl, { [key]: joinUrl });
  }

  const pending: Reservation = {
    participantLocalId: participant?.localId ?? existing?.participantLocalId ?? localId,
    listName: participant?.listName ?? existing?.listName ?? "Ученик",
    greetingName: participant?.greetingName ?? existing?.greetingName ?? "Ученик",
    userId: participant?.userId ?? existing?.userId ?? userId ?? null,
    joinUrl,
    profileUrl: resolveProfileUrl({
      userId: participant?.userId ?? existing?.userId ?? userId ?? null,
      scrapedUrl: participant?.profileUrl ?? existing?.profileUrl ?? "",
      pageUrl: session.pageUrl,
      template: settings.profileUrlTemplate,
    }),
    duration: participant?.duration ?? existing?.duration ?? null,
    tabId: null,
    windowId: null,
    status: "ready",
    error: null,
  };

  const targetWindowId = await findLiveMeetingWindow(session.reservations);
  const [opened] = await openMeetingTabs([pending], settings, targetWindowId);
  const nextReservations = mergeReservation(session.reservations, opened);
  await saveSession({ ...session, reservations: nextReservations });
  await orderTabs(nextReservations);
  if (opened.tabId) void injectMeetingUi(opened.tabId);
  return stateResponse();
}

function matchReservation(
  reservations: Reservation[],
  participant: { localId: string; userId: string | null },
): Reservation | undefined {
  if (participant.userId) {
    const byUser = reservations.find((item) => item.userId === participant.userId);
    if (byUser) return byUser;
  }
  return reservations.find((item) => item.participantLocalId === participant.localId);
}

function mergeReservation(reservations: Reservation[], next: Reservation): Reservation[] {
  const key = next.userId ? `user:${next.userId}` : `local:${next.participantLocalId}`;
  const without = reservations.filter((item) => {
    const itemKey = item.userId ? `user:${item.userId}` : `local:${item.participantLocalId}`;
    return itemKey !== key;
  });
  return sortByLessonSlot([...without, next]);
}

async function findLiveMeetingWindow(reservations: Reservation[]): Promise<number | null> {
  for (const item of reservations) {
    if (item.tabId == null) continue;
    const tab = await tabStillOpen(item.tabId);
    if (tab?.windowId != null) return tab.windowId;
  }
  return null;
}

async function forgetClosedTab(tabId: number): Promise<void> {
  const session = await loadSession();
  if (!session?.reservations.some((item) => item.tabId === tabId)) return;
  await saveSession({
    ...session,
    reservations: session.reservations.map((item) =>
      item.tabId === tabId ? { ...item, tabId: null, windowId: null } : item,
    ),
  });
  notifyUi();
}

function notifyUi(): void {
  chrome.runtime.sendMessage({ type: "STATE_CHANGED" }, () => {
    void chrome.runtime.lastError;
  });
}

function uniqueNumbers(values: Array<number | null | undefined>): number[] {
  return [...new Set(values.filter((id): id is number => typeof id === "number"))];
}

async function openPanelFromMenu(): Promise<ExtensionResponse> {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await extractFromTab(active?.id);
  notifyUi();
  return stateResponse();
}

async function menuState(): Promise<ExtensionResponse> {
  const session = await reconcileSession(await loadSession());
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const meeting = session?.reservations.find((item) => item.tabId === active?.id && item.status === "ready");
  const hidden = active?.id != null ? await isOverlayHidden(active.id) : false;
  return {
    type: "MENU_STATE",
    lessonTabId: session?.lessonTabId ?? null,
    activeTabId: active?.id ?? null,
    meeting: meeting?.tabId
      ? { tabId: meeting.tabId, name: meeting.listName, hidden }
      : null,
  };
}

async function overlayForTab(tabId: number | undefined): Promise<ExtensionResponse> {
  if (tabId === undefined) return { type: "ERROR", message: "Нет вкладки" };
  const session = await loadSession();
  const reservation = session?.reservations.find((item) => item.tabId === tabId);
  if (!reservation || reservation.status !== "ready") {
    return { type: "ERROR", message: "Для этой вкладки нет резервной ссылки" };
  }
  const settings = await loadSettings();
  const collapsedKey = overlayCollapsedKey(tabId);
  const hiddenKey = overlayHiddenKey(tabId);
  const stored = await chrome.storage.session.get([collapsedKey, hiddenKey]);
  const slack = buildSlackClipboard([
    {
      name: reservation.listName,
      meetingUrl: reservation.joinUrl,
      profileUrl: reservation.profileUrl,
    },
  ]);
  return {
    type: "OVERLAY",
    tabId,
    tabTitle: reservation.listName,
    collapsed: Boolean(stored[collapsedKey]),
    hidden: Boolean(stored[hiddenKey]),
    studentText: buildStudentMessage(
      settings.studentTemplate,
      reservation.greetingName,
      reservation.joinUrl,
      reservation.profileUrl,
    ),
    slackText: slack.text,
    slackHtml: slack.html,
  };
}

function overlayCollapsedKey(tabId: number): string {
  return `overlayCollapsed:${tabId}`;
}

function overlayHiddenKey(tabId: number): string {
  return `overlayHidden:${tabId}`;
}

async function isOverlayHidden(tabId: number): Promise<boolean> {
  const key = overlayHiddenKey(tabId);
  const stored = await chrome.storage.session.get(key);
  return Boolean(stored[key]);
}

async function setOverlayCollapsed(tabId: number | undefined, collapsed: boolean): Promise<void> {
  if (tabId === undefined) return;
  await chrome.storage.session.set({ [overlayCollapsedKey(tabId)]: collapsed });
}

async function setOverlayHidden(tabId: number | undefined, hidden: boolean): Promise<void> {
  if (tabId === undefined) return;
  await chrome.storage.session.set({
    [overlayHiddenKey(tabId)]: hidden,
    ...(hidden ? {} : { [overlayCollapsedKey(tabId)]: false }),
  });
  await injectMeetingUi(tabId);
  await chrome.tabs.sendMessage(tabId, { type: "OVERLAY_REFRESH" }).catch(() => undefined);
}

async function injectMeetingUi(tabId: number): Promise<void> {
  const session = await loadSession();
  const reservation = session?.reservations.find((item) => item.tabId === tabId);
  if (!reservation) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["overlay.js"],
    });
  } catch {
    // вкладка ещё не готова или это не http-страница
  }
}

function emptySession(): Session {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    pageUrl: "",
    pageTitle: "",
    lessonTabId: null,
    participants: [],
    reservations: [],
    staleTabIds: [],
  };
}
