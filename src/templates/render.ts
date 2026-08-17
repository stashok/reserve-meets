import type { TemplateContext } from "../shared/messages";

const TOKEN = /\{([a-z_]+)\}/gi;

export function renderTemplate(template: string, context: TemplateContext): string {
  const rendered = template.replace(TOKEN, (match, key: string) => {
    const value = context[key as keyof TemplateContext];
    return value === undefined ? match : value;
  });
  return tidyMessage(rendered);
}

export function buildStudentMessage(
  template: string,
  name: string,
  meetingUrl: string,
  profileUrl = "",
): string {
  return renderTemplate(template, contextOf(name, meetingUrl, profileUrl));
}

export function buildAdminMessage(
  header: string,
  itemTemplate: string,
  items: Array<{ name: string; meetingUrl: string; profileUrl?: string }>,
): string {
  const blocks = items.map((item) =>
    renderTemplate(
      itemTemplate,
      contextOf(item.name, item.meetingUrl, item.profileUrl ?? ""),
    ),
  );
  const body = blocks.join("\n\n");
  const head = header.trim();
  return head ? `${head}\n\n${body}` : body;
}

function contextOf(name: string, meetingUrl: string, profileUrl: string): TemplateContext {
  return {
    name,
    name_link: slackNameLink(name, profileUrl),
    meeting_url: meetingUrl,
    profile_url: profileUrl,
    provider: "Jitsi",
    date: new Intl.DateTimeFormat("ru-RU").format(new Date()),
  };
}

export function slackNameLink(name: string, profileUrl: string): string {
  if (!profileUrl) return name;
  return `<${profileUrl}|${name}>`;
}

function tidyMessage(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
