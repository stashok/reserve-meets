import type { Participant, Reservation, Session, Settings } from "./models";

export type ExtensionRequest =
  | { type: "GET_STATE" }
  | { type: "EXTRACT"; tabId?: number }
  | { type: "SET_SELECTED"; localIds: string[] }
  | { type: "ADD_MANUAL"; name: string }
  | { type: "CREATE"; confirmClose?: boolean }
  | { type: "OPEN_TAB"; localId: string }
  | { type: "GET_SETTINGS" }
  | { type: "SAVE_SETTINGS"; settings: Settings }
  | { type: "GET_TAB_OVERLAY" }
  | { type: "SET_OVERLAY_COLLAPSED"; collapsed: boolean };

export type UiEvent = { type: "STATE_CHANGED" };

export type OverlayPayload = {
  type: "OVERLAY";
  tabId: number;
  tabTitle: string;
  collapsed: boolean;
  studentText: string;
  slackText: string;
  slackHtml: string;
};

export type ExtensionResponse =
  | {
      type: "STATE";
      session: Session | null;
      extractError: string | null;
      rememberedUrls: Record<string, string>;
    }
  | { type: "SETTINGS"; settings: Settings }
  | { type: "SAVED" }
  | { type: "CONFIRM_CLOSE"; names: string[] }
  | OverlayPayload
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
