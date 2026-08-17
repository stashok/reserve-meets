import type { Participant, Reservation, Session, Settings } from "./models";

export type ExtensionRequest =
  | { type: "GET_STATE" }
  | { type: "EXTRACT"; tabId?: number }
  | { type: "SET_SELECTED"; localIds: string[] }
  | { type: "ADD_MANUAL"; name: string }
  | { type: "CREATE"; confirmClose?: boolean; tile?: boolean }
  | { type: "OPEN_TAB"; localId: string; userId?: string | null }
  | { type: "GET_SETTINGS" }
  | { type: "SAVE_SETTINGS"; settings: Settings }
  | { type: "GET_TAB_OVERLAY" }
  | { type: "SET_OVERLAY_COLLAPSED"; collapsed: boolean }
  | { type: "GET_MENU_STATE" }
  | { type: "OPEN_PANEL" }
  | { type: "SET_OVERLAY_HIDDEN"; hidden: boolean; tabId?: number }
  | { type: "HAND_STATE"; raised: boolean; raisedAt?: number; remoteId?: string }
  | { type: "PLAY_HELP_SOUND"; volume?: number }
  | { type: "PLAY_HELP_SOUND_UI"; volume?: number };

export type UiEvent =
  | { type: "STATE_CHANGED" }
  | { type: "OVERLAY_REFRESH" }
  | { type: "PLAY_HELP_SOUND_UI"; volume?: number };

export type OverlayPayload = {
  type: "OVERLAY";
  tabId: number;
  tabTitle: string;
  collapsed: boolean;
  hidden: boolean;
  studentText: string;
  slackText: string;
  slackHtml: string;
  raised: boolean;
};

export type MenuState = {
  type: "MENU_STATE";
  lessonTabId: number | null;
  activeTabId: number | null;
  meeting: { tabId: number; name: string; hidden: boolean } | null;
};

export type ExtensionResponse =
  | {
      type: "STATE";
      session: Session | null;
      extractError: string | null;
      rememberedUrls: Record<string, string>;
      helpSince: Record<string, number>;
      tileHint?: string | null;
    }
  | { type: "SETTINGS"; settings: Settings }
  | { type: "SAVED" }
  | { type: "CONFIRM_CLOSE"; names: string[] }
  | OverlayPayload
  | MenuState
  | { type: "ERROR"; message: string };

export interface TemplateContext {
  name: string;
  name_link: string;
  meeting_url: string;
  profile_url: string;
  provider: string;
  date: string;
}

export type { Participant, Reservation, Session, Settings };
