import type { Participant, RawParticipant } from "../shared/models";
import { parseLessonSlot } from "./duration";

const PLACEHOLDER_LAST_NAMES = new Set(["", "-", "–", "—", ".", "•", "*"]);

export function isRealLastName(lastName: string): boolean {
  return !PLACEHOLDER_LAST_NAMES.has(lastName.trim());
}

export function greetingNameOf(firstName: string): string {
  return firstName.trim();
}

export function baseListName(firstName: string, lastName: string): string {
  const first = firstName.trim();
  const last = lastName.trim();
  if (isRealLastName(last)) return `${first} ${last}`;
  return first;
}

export function withDisplayNames(
  rows: Array<
    Omit<Participant, "listName" | "greetingName" | "selected"> & {
      selected?: boolean;
    }
  >,
): Participant[] {
  return rows.map((row) => ({
    ...row,
    selected: row.selected ?? true,
    listName: baseListName(row.firstName, row.lastName),
    greetingName: greetingNameOf(row.firstName),
    duration: row.duration ?? null,
  }));
}

export function toParticipant(
  raw: RawParticipant,
  source: Participant["source"] = "detected",
): Omit<Participant, "listName" | "greetingName" | "selected"> {
  return {
    localId: crypto.randomUUID(),
    userId: raw.userId || null,
    firstName: raw.firstName.trim(),
    lastName: raw.lastName.trim(),
    skill: raw.skill.trim(),
    profileUrl: raw.profileUrl?.trim() ?? "",
    duration: parseLessonSlot(raw.duration),
    source,
  };
}
