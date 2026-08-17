export function resolveProfileUrl(input: {
  userId: string | null;
  scrapedUrl: string;
  pageUrl: string;
  template: string;
}): string {
  const scraped = input.scrapedUrl.trim();
  if (isHttpUrl(scraped)) return scraped;

  const userId = input.userId?.trim() ?? "";
  const template = input.template.trim();
  if (!template || !userId) return scraped;

  return template
    .replaceAll("{origin}", originOf(input.pageUrl))
    .replaceAll("{user_id}", userId)
    .replaceAll("{userId}", userId);
}

function originOf(pageUrl: string): string {
  try {
    return new URL(pageUrl).origin;
  } catch {
    return "";
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
