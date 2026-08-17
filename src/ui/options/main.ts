import type { ExtensionRequest, ExtensionResponse } from "../../shared/messages";
import { DEFAULT_SETTINGS, type Settings } from "../../shared/models";
import "../common.css";

const form = must<HTMLFormElement>("#form");
const saved = must("#saved");

void boot();

async function boot(): Promise<void> {
  const settings = await loadSettings();
  fill(settings);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void save();
  });
}

async function save(): Promise<void> {
  const current = await loadSettings();
  const settings: Settings = {
    ...current,
    jitsiBaseUrl: value("#jitsiBaseUrl").replace(/\/+$/, ""),
    teacherDisplayName: value("#teacherDisplayName"),
    muteOnOpen: must<HTMLInputElement>("#muteOnOpen").checked,
    openInNewWindow: must<HTMLInputElement>("#openInNewWindow").checked,
    studentTemplate: value("#studentTemplate"),
    adminHeader: value("#adminHeader"),
    adminItemTemplate: value("#adminItemTemplate"),
    profileUrlTemplate: value("#profileUrlTemplate"),
  };

  await send({ type: "SAVE_SETTINGS", settings });
  saved.hidden = false;
  window.setTimeout(() => {
    saved.hidden = true;
  }, 1500);
}

function fill(settings: Settings): void {
  must<HTMLInputElement>("#jitsiBaseUrl").value = settings.jitsiBaseUrl;
  must<HTMLInputElement>("#teacherDisplayName").value = settings.teacherDisplayName;
  must<HTMLInputElement>("#muteOnOpen").checked = settings.muteOnOpen;
  must<HTMLInputElement>("#openInNewWindow").checked = settings.openInNewWindow;
  must<HTMLInputElement>("#openInCurrentWindow").checked = !settings.openInNewWindow;
  must<HTMLTextAreaElement>("#studentTemplate").value = settings.studentTemplate;
  must<HTMLInputElement>("#adminHeader").value = settings.adminHeader;
  must<HTMLTextAreaElement>("#adminItemTemplate").value = settings.adminItemTemplate;
  must<HTMLInputElement>("#profileUrlTemplate").value = settings.profileUrlTemplate;
}

async function loadSettings(): Promise<Settings> {
  const response = await send({ type: "GET_SETTINGS" });
  return response.type === "SETTINGS" ? response.settings : DEFAULT_SETTINGS;
}

async function send(request: ExtensionRequest): Promise<ExtensionResponse> {
  return chrome.runtime.sendMessage(request) as Promise<ExtensionResponse>;
}

function value(selector: string): string {
  return must<HTMLInputElement | HTMLTextAreaElement>(selector).value.trim();
}

function must<T extends HTMLElement = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Не найден элемент ${selector}`);
  return el;
}
