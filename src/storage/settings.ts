import { DEFAULT_SETTINGS, type Settings } from "../shared/models";
import { createRoomNamespace } from "../providers/jitsi";

const SETTINGS_KEY = "settings";
const LEGACY_ADMIN_HEADER = "Резервные подключения на урок:";
const LEGACY_ADMIN_ITEM = `{name}
{meeting_url}`;
const LEGACY_ADMIN_ITEM_WITH_PROFILE = `{name}
{profile_url}
{meeting_url}`;

const WINDOW_DEFAULT_MIGRATION = "migratedOpenInNewWindowV2";

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get([SETTINGS_KEY, WINDOW_DEFAULT_MIGRATION]);
  const settings = { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] as Partial<Settings> | undefined) };
  if (!stored[WINDOW_DEFAULT_MIGRATION]) {
    settings.openInNewWindow = true;
    await chrome.storage.local.set({
      [SETTINGS_KEY]: settings,
      [WINDOW_DEFAULT_MIGRATION]: true,
    });
  }
  if (settings.adminHeader === LEGACY_ADMIN_HEADER) {
    settings.adminHeader = "";
  }
  if (
    settings.adminItemTemplate === LEGACY_ADMIN_ITEM ||
    settings.adminItemTemplate === LEGACY_ADMIN_ITEM_WITH_PROFILE
  ) {
    settings.adminItemTemplate = DEFAULT_SETTINGS.adminItemTemplate;
  }
  if (!settings.profileUrlTemplate.trim()) {
    settings.profileUrlTemplate = DEFAULT_SETTINGS.profileUrlTemplate;
  }
  if (!settings.roomNamespace) {
    settings.roomNamespace = createRoomNamespace();
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  }
  return settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}
