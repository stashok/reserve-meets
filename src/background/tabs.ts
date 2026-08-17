import type { Reservation, Settings } from "../shared/models";
import { teacherLaunchUrl } from "../providers/jitsi";

export async function closeMeetingTabs(tabIds: Array<number | null | undefined>): Promise<void> {
  const ids = [...new Set(tabIds.filter((id): id is number => typeof id === "number"))];
  if (ids.length === 0) return;
  await chrome.tabs.remove(ids).catch(() => undefined);
}

export async function tabStillOpen(tabId: number): Promise<chrome.tabs.Tab | undefined> {
  return chrome.tabs.get(tabId).catch(() => undefined);
}

export function findPrevious(previous: Reservation[], item: Reservation): Reservation | undefined {
  if (item.userId) {
    const byUser = previous.find((candidate) => candidate.userId === item.userId);
    if (byUser) return byUser;
  }
  return previous.find((candidate) => candidate.participantLocalId === item.participantLocalId);
}

export function reservationKey(item: Pick<Reservation, "userId" | "participantLocalId">): string {
  return item.userId ? `user:${item.userId}` : `local:${item.participantLocalId}`;
}

export async function tabsThatWillClose(
  next: Reservation[],
  previous: Reservation[],
  extraTabIds: number[] = [],
): Promise<number[]> {
  const keep = new Set<number>();
  for (const item of next) {
    if (item.status !== "ready" || !item.joinUrl) continue;
    const prev = findPrevious(previous, item);
    const existing = prev?.tabId != null ? await tabStillOpen(prev.tabId) : undefined;
    if (existing?.id && shouldReuseTab(existing, item.joinUrl)) {
      keep.add(existing.id);
    }
  }

  const fromPrevious = previous
    .map((item) => item.tabId)
    .filter((id): id is number => typeof id === "number" && !keep.has(id));
  return [...new Set([...fromPrevious, ...extraTabIds.filter((id) => !keep.has(id))])];
}

export async function activeMeetingTabIds(tabIds: number[]): Promise<number[]> {
  const active: number[] = [];
  for (const id of tabIds) {
    const tab = await tabStillOpen(id);
    if (tab?.active && tab.id != null) active.push(tab.id);
  }
  return active;
}

export async function focusTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.windowId != null) {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
  }
  await chrome.tabs.update(tabId, { active: true });
}

export async function syncMeetingTabs(
  reservations: Reservation[],
  previous: Reservation[],
  settings: Settings,
  extraCloseTabIds: number[] = [],
): Promise<Reservation[]> {
  const keepTabIds = new Set<number>();
  const reused: Reservation[] = [];
  const toCreate: Reservation[] = [];
  const skipped: Reservation[] = [];

  for (const item of reservations) {
    if (item.status !== "ready" || !item.joinUrl) {
      skipped.push(item);
      continue;
    }

    const prev = findPrevious(previous, item);
    const existing = prev?.tabId != null ? await tabStillOpen(prev.tabId) : undefined;
    if (existing?.id && shouldReuseTab(existing, item.joinUrl)) {
      keepTabIds.add(existing.id);
      reused.push({
        ...item,
        tabId: existing.id,
        windowId: existing.windowId ?? prev?.windowId ?? null,
      });
      continue;
    }

    toCreate.push(item);
  }

  const targetWindowId = reused.find((item) => item.windowId != null)?.windowId ?? null;
  const opened =
    toCreate.length > 0 ? await openMeetingTabs(toCreate, settings, targetWindowId) : [];
  for (const item of opened) {
    if (item.tabId) keepTabIds.add(item.tabId);
  }

  await closeMeetingTabs([
    ...previous.map((item) => item.tabId),
    ...extraCloseTabIds,
  ].filter((id): id is number => typeof id === "number" && !keepTabIds.has(id)));

  const byKey = new Map<string, Reservation>();
  for (const item of [...reused, ...opened, ...skipped]) {
    byKey.set(reservationKey(item), item);
  }

  const ordered = reservations.map((item) => byKey.get(reservationKey(item)) ?? item);
  await orderTabs(ordered);
  return ordered;
}

export async function openMeetingTabs(
  reservations: Reservation[],
  settings: Settings,
  targetWindowId?: number | null,
): Promise<Reservation[]> {
  const ready = reservations.filter((item) => item.status === "ready" && item.joinUrl);
  if (ready.length === 0) return reservations;

  try {
    const created = await createTabsInOrder(
      ready.map((item) => teacherLaunchUrl(item.joinUrl, settings)),
      settings.openInNewWindow,
      targetWindowId,
    );

    return reservations.map((item) => {
      if (item.status !== "ready") return item;
      const index = ready.indexOf(item);
      const tab = created[index];
      return {
        ...item,
        tabId: tab?.id ?? null,
        windowId: tab?.windowId ?? null,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось открыть вкладки";
    return reservations.map((item) =>
      item.status === "ready"
        ? { ...item, status: "failed" as const, error: message }
        : item,
    );
  }
}

async function createTabsInOrder(
  urls: string[],
  openInNewWindow: boolean,
  targetWindowId?: number | null,
): Promise<chrome.tabs.Tab[]> {
  if (urls.length === 0) return [];

  let windowId = targetWindowId ?? null;
  let startIndex = 0;

  if (windowId != null) {
    const existing = await chrome.tabs.query({ windowId });
    startIndex = existing.length;
  } else if (openInNewWindow) {
    const createdWindow = await chrome.windows.create({
      url: urls[0],
      focused: false,
      type: "normal",
    });
    windowId = createdWindow?.id ?? null;
    const firstTab = createdWindow?.tabs?.[0];
    const rest = await createAt(urls.slice(1), windowId, 1);
    return [firstTab, ...rest].filter((tab): tab is chrome.tabs.Tab => Boolean(tab));
  } else {
    const current = await chrome.tabs.query({ lastFocusedWindow: true });
    startIndex = current.length;
    windowId = current[0]?.windowId ?? null;
  }

  return createAt(urls, windowId, startIndex);
}

async function createAt(
  urls: string[],
  windowId: number | null,
  startIndex: number,
): Promise<chrome.tabs.Tab[]> {
  const created: chrome.tabs.Tab[] = [];
  for (const [offset, url] of urls.entries()) {
    const tab = await chrome.tabs.create({
      url,
      active: false,
      index: startIndex + offset,
      ...(windowId != null ? { windowId } : {}),
    });
    created.push(tab);
  }
  return created;
}

export async function orderTabs(reservations: Reservation[]): Promise<void> {
  const located: Array<{ id: number; windowId: number }> = [];
  for (const item of reservations) {
    if (item.tabId == null) continue;
    const tab = await tabStillOpen(item.tabId);
    if (tab?.id != null && tab.windowId != null) {
      located.push({ id: tab.id, windowId: tab.windowId });
    }
  }

  const byWindow = new Map<number, number[]>();
  for (const item of located) {
    const ids = byWindow.get(item.windowId) ?? [];
    ids.push(item.id);
    byWindow.set(item.windowId, ids);
  }

  for (const [windowId, ids] of byWindow) {
    if (ids.length < 2) continue;
    const tabs = await Promise.all(ids.map((id) => chrome.tabs.get(id).catch(() => undefined)));
    const indexes = tabs
      .map((tab) => tab?.index)
      .filter((index): index is number => typeof index === "number");
    if (indexes.length === 0) continue;
    const start = Math.min(...indexes);
    await chrome.tabs.move(ids, { windowId, index: start }).catch(() => undefined);
  }
}

function shouldReuseTab(tab: chrome.tabs.Tab, joinUrl: string): boolean {
  const tabUrl = tab.url ?? tab.pendingUrl ?? "";
  if (!tabUrl || tabUrl === "about:blank" || tab.status === "loading") return true;
  try {
    const join = new URL(joinUrl);
    const live = new URL(tabUrl);
    return live.host === join.host && live.pathname === join.pathname;
  } catch {
    return true;
  }
}
