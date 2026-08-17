import { playHelpChime } from "../chime";
import type { ExtensionRequest, ExtensionResponse } from "../../shared/messages";

chrome.runtime.onMessage.addListener((message: ExtensionRequest, _sender, sendResponse) => {
  if (message.type !== "PLAY_HELP_SOUND") return;
  void playHelpChime(message.volume);
  const response: ExtensionResponse = { type: "SAVED" };
  sendResponse(response);
  return true;
});
