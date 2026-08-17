import type { LessonSlot } from "../shared/models";

export function parseLessonSlot(raw: string | number | null | undefined): LessonSlot | null {
  const value = String(raw ?? "").trim();
  if (value === "0" || value === "1" || value === "2") {
    return Number(value) as LessonSlot;
  }
  return null;
}

export function lessonSlotLabel(slot: LessonSlot | null): string {
  switch (slot) {
    case 0:
      return "2 часа";
    case 1:
      return "1-й час";
    case 2:
      return "2-й час";
    default:
      return "Без слота";
  }
}

export function lessonSlotRank(slot: LessonSlot | null): number {
  if (slot === 0) return 0;
  if (slot === 1) return 1;
  if (slot === 2) return 2;
  return 3;
}

export function sortByLessonSlot<T extends { duration: LessonSlot | null }>(items: T[]): T[] {
  return [...items].sort((left, right) => lessonSlotRank(left.duration) - lessonSlotRank(right.duration));
}

export function groupByLessonSlot<T extends { duration: LessonSlot | null }>(
  items: T[],
): Array<{ slot: LessonSlot | null; label: string; items: T[] }> {
  const groups: Array<{ slot: LessonSlot | null; label: string; items: T[] }> = [];
  for (const item of sortByLessonSlot(items)) {
    const last = groups.at(-1);
    if (last && last.slot === item.duration) {
      last.items.push(item);
    } else {
      groups.push({
        slot: item.duration,
        label: lessonSlotLabel(item.duration),
        items: [item],
      });
    }
  }
  return groups;
}
