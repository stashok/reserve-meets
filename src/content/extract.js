(async function extractParticipantsFromPage() {
  const selectors = [
    '.panel-trainer-lesson-list [id-qa="list-group-item"]',
    '[id-qa="child-list"] [id-qa="list-group-item"]',
    '[id-qa="list-group-item"][data-first_name]',
    "[data-user_id][data-first_name]",
  ];
  const hostHint = '.panel-trainer-lesson-list, [id-qa="child-list"], [data-first_name]';
  const isTop = window === window.top;

  if (!isTop && !document.querySelector(hostHint)) {
    return { found: false, participants: [] };
  }

  const collect = () => {
    let items = [];
    for (const selector of selectors) {
      items = Array.from(document.querySelectorAll(selector));
      if (items.length > 0) break;
    }

    const participants = [];
    const seen = new Set();

    for (const item of items) {
      if (!(item instanceof HTMLElement)) continue;

      const userId = (item.getAttribute("data-user_id") ?? "").trim();
      const firstName = (item.getAttribute("data-first_name") ?? "").trim();
      const lastName = (item.getAttribute("data-last_name") ?? "").trim();
      const skill = (item.getAttribute("data-skill") ?? "").trim();
      const profileUrl = readProfileUrl(item, userId);
      const durationAttr = (item.getAttribute("data-duration") ?? "").trim();
      const duration =
        durationAttr === "0" || durationAttr === "1" || durationAttr === "2"
          ? Number(durationAttr)
          : null;

      if (!firstName) continue;

      const key = userId || `${firstName}|${lastName}|${participants.length}`;
      if (seen.has(key)) continue;
      seen.add(key);

      participants.push({ userId, firstName, lastName, skill, profileUrl, duration });
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

  function readProfileUrl(item, userId) {
    const named = item.querySelector("a.title-name[href], a[href^='/profile/']");
    if (named instanceof HTMLAnchorElement) {
      const href = (named.getAttribute("href") ?? "").trim();
      if (href && href !== "#" && !href.startsWith("javascript:")) {
        return named.href || absolutize(href);
      }
    }

    const fromAttr = [
      item.getAttribute("data-profile_url"),
      item.getAttribute("data-profile-url"),
      item.getAttribute("data-href"),
      item.getAttribute("data-url"),
    ].find((value) => value && value.trim());
    if (fromAttr) return absolutize(fromAttr.trim());

    const anchors = Array.from(item.querySelectorAll("a[href]"));
    const useful = anchors
      .map((anchor) => ({
        href: anchor.getAttribute("href") ?? "",
        absolute: anchor.href,
      }))
      .filter((link) => {
        const href = link.href.trim();
        return href && href !== "#" && !href.startsWith("javascript:");
      });

    const matched = userId
      ? useful.find((link) => link.href.includes(userId) || link.absolute.includes(userId))
      : undefined;
    if (matched) return matched.absolute;
    if (useful.length === 1) return useful[0].absolute;
    return "";
  }

  function absolutize(value) {
    try {
      return new URL(value, location.href).href;
    } catch {
      return value;
    }
  }
})();
