import type { Session } from "../shared/models";

const SESSION_KEY = "session";
const EXTRACT_ERROR_KEY = "extractError";

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
