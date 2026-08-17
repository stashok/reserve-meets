export type LessonSlot = 0 | 1 | 2;
export type ParticipantSource = "detected" | "manual";

export interface RawParticipant {
  userId: string;
  firstName: string;
  lastName: string;
  skill: string;
  profileUrl?: string;
  duration?: string | number | null;
}

export interface Participant {
  localId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  skill: string;
  source: ParticipantSource;
  selected: boolean;
  profileUrl: string;
  duration: LessonSlot | null;
  /** Подпись в списке и Slack */
  listName: string;
  /** Имя для обращения в сообщении ученику */
  greetingName: string;
}

export type ReservationStatus = "pending" | "ready" | "failed";

export interface Reservation {
  participantLocalId: string;
  listName: string;
  greetingName: string;
  userId: string | null;
  joinUrl: string;
  profileUrl: string;
  duration: LessonSlot | null;
  tabId: number | null;
  windowId: number | null;
  status: ReservationStatus;
  error: string | null;
}

export interface Session {
  id: string;
  createdAt: string;
  pageUrl: string;
  pageTitle: string;
  lessonTabId: number | null;
  participants: Participant[];
  reservations: Reservation[];
  staleTabIds: number[];
}

export interface Settings {
  jitsiBaseUrl: string;
  roomNamespace: string;
  teacherDisplayName: string;
  muteOnOpen: boolean;
  openInNewWindow: boolean;
  studentTemplate: string;
  adminHeader: string;
  adminItemTemplate: string;
  profileUrlTemplate: string;
}

export const DEFAULT_SETTINGS: Settings = {
  jitsiBaseUrl: "https://meet.jit.si",
  roomNamespace: "",
  teacherDisplayName: "Преподаватель",
  muteOnOpen: true,
  openInNewWindow: true,
  studentTemplate: `Привет, {name}!

Сегодня подключайся к занятию по резервной ссылке:

{meeting_url}`,
  adminHeader: "",
  adminItemTemplate: `{name_link}
{meeting_url}`,
  profileUrlTemplate: "{origin}/profile/{user_id}",
};
