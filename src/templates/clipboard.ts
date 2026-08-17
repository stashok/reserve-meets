export type SlackItem = { name: string; meetingUrl: string; profileUrl?: string };
export type SlackGroup = { label: string; items: SlackItem[] };

export function slackNameHtml(name: string, profileUrl: string): string {
  const safeName = escapeHtml(name);
  if (!profileUrl) return safeName;
  return `<a href="${escapeAttr(profileUrl)}">${safeName}</a>`;
}

export function buildSlackClipboard(
  items: SlackItem[],
  header = "",
): { html: string; text: string } {
  return buildSlackClipboardFromGroups([{ label: "", items }], header);
}

export function buildSlackClipboardFromGroups(
  groups: SlackGroup[],
  header = "",
): { html: string; text: string } {
  const htmlParts: string[] = [];
  const textParts: string[] = [];
  const head = header.trim();
  if (head) {
    htmlParts.push(escapeHtml(head));
    textParts.push(head);
  }

  for (const group of groups) {
    if (group.items.length === 0) continue;
    if (group.label) {
      htmlParts.push(`<b>${escapeHtml(group.label)}</b>`);
      textParts.push(group.label);
    }
    for (const item of group.items) {
      htmlParts.push(
        `${slackNameHtml(item.name, item.profileUrl ?? "")}<br>${escapeHtml(item.meetingUrl)}`,
      );
      textParts.push(`${item.name}\n${item.meetingUrl}`);
    }
  }

  return {
    html: htmlParts.join("<br><br>"),
    text: textParts.join("\n\n"),
  };
}

export async function copySlackClipboard(items: SlackItem[], header = ""): Promise<void> {
  await writeSlackClipboard(buildSlackClipboard(items, header));
}

export async function copySlackClipboardFromGroups(
  groups: SlackGroup[],
  header = "",
): Promise<void> {
  await writeSlackClipboard(buildSlackClipboardFromGroups(groups, header));
}

async function writeSlackClipboard(payload: { html: string; text: string }): Promise<void> {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([payload.html], { type: "text/html" }),
        "text/plain": new Blob([payload.text], { type: "text/plain" }),
      }),
    ]);
  } catch {
    await navigator.clipboard.writeText(payload.text);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
