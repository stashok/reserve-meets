/**
 * Эта функция инжектится в страницу урока целиком.
 * Нельзя импортировать другие модули: chrome.scripting передаёт только тело.
 */
export async function extractParticipantsFromPage(): Promise<{
  found: boolean;
  participants: Array<{
    userId: string;
    firstName: string;
    lastName: string;
    skill: string;
  }>;
}> {
  const selectors = [
    '.panel-trainer-lesson-list [id-qa="list-group-item"]',
    '[id-qa="child-list"] [id-qa="list-group-item"]',
    '[id-qa="list-group-item"][data-first_name]',
    "[data-user_id][data-first_name]",
  ];
  const hostHint = '.panel-trainer-lesson-list, [id-qa="child-list"]';
  const isTop = window === window.top;

  if (!isTop && !document.querySelector(hostHint)) {
    return { found: false, participants: [] };
  }

  const collect = () => {
    let items: Element[] = [];
    for (const selector of selectors) {
      items = Array.from(document.querySelectorAll(selector));
      if (items.length > 0) break;
    }

    const participants: Array<{
      userId: string;
      firstName: string;
      lastName: string;
      skill: string;
    }> = [];
    const seen = new Set<string>();

    for (const item of items) {
      if (!(item instanceof HTMLElement)) continue;

      const userId = (item.getAttribute("data-user_id") ?? "").trim();
      const firstName = (item.getAttribute("data-first_name") ?? "").trim();
      const lastName = (item.getAttribute("data-last_name") ?? "").trim();
      const skill = (item.getAttribute("data-skill") ?? "").trim();

      if (!firstName) continue;

      const key = userId || `${firstName}|${lastName}|${participants.length}`;
      if (seen.has(key)) continue;
      seen.add(key);

      participants.push({ userId, firstName, lastName, skill });
    }

    return {
      found: participants.length > 0,
      participants,
    };
  };

  const started = Date.now();
  let result = collect();
  while (!result.found && Date.now() - started < 2500) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    result = collect();
  }

  return result;
}
