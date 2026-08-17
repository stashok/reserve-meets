import type { Session } from "../shared/models";

const SESSION_KEY = "session";
const EXTRACT_ERROR_KEY = "extractError";
const RAISED_HANDS_KEY = "raisedHands";

export async function loadSession(): Promise<Session | null> {
  const stored = await chrome.storage.session.get(SESSION_KEY);
  return (stored[SESSION_KEY] as Session | undefined) ?? null;
}

export async function saveSession(session: Session | null): Promise<void> {
  if (session) {
    await chrome.storage.session.set({ [SESSION_KEY]: session });
    return;
  }
  await chrome.storage.session.remove(SESSION_KEY);
}

export async function loadExtractError(): Promise<string | null> {
  const stored = await chrome.storage.session.get(EXTRACT_ERROR_KEY);
  return (stored[EXTRACT_ERROR_KEY] as string | undefined) ?? null;
}

export async function saveExtractError(reason: string | null): Promise<void> {
  if (reason) {
    await chrome.storage.session.set({ [EXTRACT_ERROR_KEY]: reason });
    return;
  }
  await chrome.storage.session.remove(EXTRACT_ERROR_KEY);
}

export type HandWatch = { since: number; signal: string; downAt: number | null };
export type RaisedHands = Record<string, HandWatch>;

export async function loadRaisedHands(): Promise<RaisedHands> {
  const stored = await chrome.storage.session.get(RAISED_HANDS_KEY);
  const value = stored[RAISED_HANDS_KEY];
  if (Array.isArray(value)) {
    const now = Date.now();
    const migrated: RaisedHands = {};
    for (const id of value) {
      if (typeof id === "number") migrated[String(id)] = { since: now, signal: "", downAt: null };
    }
    return migrated;
  }
  if (value && typeof value === "object") {
    const result: RaisedHands = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const watch = asWatch(item);
      if (watch) result[key] = watch;
    }
    return result;
  }
  return {};
}

function asWatch(value: unknown): HandWatch | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { since: usableSince(value), signal: "", downAt: null };
  }
  if (!value || typeof value !== "object") return null;
  const since = (value as { since?: unknown }).since;
  if (typeof since !== "number" || !Number.isFinite(since)) return null;
  const signal = (value as { signal?: unknown }).signal;
  return {
    since: usableSince(since),
    signal: typeof signal === "string" ? signal : "",
    downAt: optionalTime((value as { downAt?: unknown }).downAt),
  };
}

function optionalTime(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function usableSince(since: number): number {
  const now = Date.now();
  return since > now + 2000 ? now : since;
}

export async function saveRaisedHands(hands: RaisedHands): Promise<void> {
  await chrome.storage.session.set({ [RAISED_HANDS_KEY]: hands });
}
