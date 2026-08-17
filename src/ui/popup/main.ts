import type { ExtensionRequest, ExtensionResponse, MenuState } from "../../shared/messages";
import "../common.css";

const contextEl = must("#context");
const openPanelBtn = must<HTMLButtonElement>("#open-panel");
const overlayToggle = must<HTMLButtonElement>("#overlay-toggle");
const openOptions = must<HTMLAnchorElement>("#open-options");

void boot();

async function boot(): Promise<void> {
  const state = await menuState();
  paint(state);

  openPanelBtn.addEventListener("click", () => {
    void openPanel();
  });
  overlayToggle.addEventListener("click", () => {
    if (!state?.meeting) return;
    void setOverlayHidden(state, !state.meeting.hidden);
  });
  openOptions.addEventListener("click", (event) => {
    event.preventDefault();
    void chrome.runtime.openOptionsPage();
  });
}

function paint(state: MenuState | null): void {
  if (!state) {
    contextEl.hidden = false;
    contextEl.textContent = "Не удалось прочитать вкладку.";
    overlayToggle.hidden = true;
    return;
  }
  if (state.meeting) {
    contextEl.hidden = false;
    contextEl.textContent = state.meeting.name;
    overlayToggle.hidden = false;
    overlayToggle.textContent = state.meeting.hidden ? "Показать поп-ап" : "Скрыть поп-ап";
    return;
  }
  contextEl.hidden = true;
  overlayToggle.hidden = true;
}

async function openPanel(): Promise<void> {
  const windowId = (await chrome.windows.getCurrent()).id;
  if (windowId != null) {
    await chrome.sidePanel.open({ windowId });
  }
  await send({ type: "OPEN_PANEL" });
  window.close();
}

async function setOverlayHidden(state: MenuState, hidden: boolean): Promise<void> {
  const tabId = state.meeting?.tabId;
  if (tabId == null) return;
  await send({ type: "SET_OVERLAY_HIDDEN", tabId, hidden });
  window.close();
}

async function menuState(): Promise<MenuState | null> {
  const response = await send({ type: "GET_MENU_STATE" });
  return response.type === "MENU_STATE" ? response : null;
}

async function send(request: ExtensionRequest): Promise<ExtensionResponse> {
  return chrome.runtime.sendMessage(request) as Promise<ExtensionResponse>;
}

function must<T extends HTMLElement = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Не найден элемент ${selector}`);
  return el;
}
