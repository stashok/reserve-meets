const MEMORY_KEY = "linkMemories";
const LEGACY_SESSION_KEY = "linkMemory";
const MAX_LESSONS = 30;

export interface LinkMemory {
  lessonKey: string;
  urls: Record<string, string>;
}

interface StoredLessons {
  lessons: Record<string, { urls: Record<string, string>; updatedAt: number }>;
}

export function lessonKeyFromUrl(pageUrl: string): string {
  try {
    const url = new URL(pageUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return pageUrl;
  }
}

export function memoryKeyFor(userId: string | null | undefined, localId: string): string {
  return userId ? `user:${userId}` : `manual:${localId}`;
}

export async function loadLinkMemory(pageUrl: string): Promise<LinkMemory> {
  const lessonKey = lessonKeyFromUrl(pageUrl);
  const all = await loadAll();
  return { lessonKey, urls: all.lessons[lessonKey]?.urls ?? {} };
}

export async function rememberJoinUrls(
  pageUrl: string,
  urls: Record<string, string>,
): Promise<void> {
  if (Object.keys(urls).length === 0) return;
  const lessonKey = lessonKeyFromUrl(pageUrl);
  const all = await loadAll();
  const current = all.lessons[lessonKey]?.urls ?? {};
  all.lessons[lessonKey] = {
    urls: { ...current, ...urls },
    updatedAt: Date.now(),
  };
  prune(all);
  await chrome.storage.local.set({ [MEMORY_KEY]: all });
}

async function loadAll(): Promise<StoredLessons> {
  const stored = await chrome.storage.local.get(MEMORY_KEY);
  const current = stored[MEMORY_KEY] as StoredLessons | undefined;
  const lessons = { ...(current?.lessons ?? {}) };

  const legacy = await chrome.storage.session.get(LEGACY_SESSION_KEY);
  const sessionMemory = legacy[LEGACY_SESSION_KEY] as LinkMemory | undefined;
  if (sessionMemory?.lessonKey && Object.keys(sessionMemory.urls).length > 0) {
    const existing = lessons[sessionMemory.lessonKey]?.urls ?? {};
    lessons[sessionMemory.lessonKey] = {
      urls: { ...sessionMemory.urls, ...existing },
      updatedAt: Date.now(),
    };
    await chrome.storage.session.remove(LEGACY_SESSION_KEY);
    const merged = { lessons };
    prune(merged);
    await chrome.storage.local.set({ [MEMORY_KEY]: merged });
    return merged;
  }

  return { lessons };
}

function prune(all: StoredLessons): void {
  const entries = Object.entries(all.lessons).sort((left, right) => right[1].updatedAt - left[1].updatedAt);
  if (entries.length <= MAX_LESSONS) return;
  all.lessons = Object.fromEntries(entries.slice(0, MAX_LESSONS));
}
