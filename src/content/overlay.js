(() => {
  if (window.__reserveMeetOverlayInstalled) {
    requestPayload();
    return;
  }
  window.__reserveMeetOverlayInstalled = true;
  requestPayload();

  function requestPayload(attempt) {
    chrome.runtime.sendMessage({ type: "GET_TAB_OVERLAY" }, (payload) => {
      if (!payload || payload.type !== "OVERLAY") {
        if ((attempt ?? 0) < 8) {
          window.setTimeout(() => requestPayload((attempt ?? 0) + 1), 300);
        }
        return;
      }
      mount(payload);
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "OVERLAY_REFRESH") requestPayload();
  });

  function mount(payload) {
    watchTitle(payload.tabTitle);
    if (payload.hidden) {
      document.getElementById("reserve-meet-overlay")?.remove();
      return;
    }
    renderPanel(payload);
  }

  function watchTitle(title) {
    window.__reserveMeetTabTitle = title;
    if (window.__reserveMeetTitleWatch) return;
    window.__reserveMeetTitleWatch = true;
    const apply = () => {
      const next = window.__reserveMeetTabTitle;
      if (next && document.title !== next) document.title = next;
    };
    apply();
    const node = document.querySelector("title");
    if (node) {
      new MutationObserver(apply).observe(node, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    window.setInterval(apply, 1500);
  }

  function renderPanel(payload) {
    const existing = document.getElementById("reserve-meet-overlay");
    if (existing) existing.remove();

    const host = document.createElement("div");
    host.id = "reserve-meet-overlay";
    host.style.all = "initial";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.append(style());

    if (payload.collapsed) {
      shadow.append(collapsedChip(payload));
    } else {
      shadow.append(expandedPanel(payload));
    }

    document.documentElement.append(host);
  }

  function collapsedChip(payload) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.setAttribute("class", "chip");
    chip.textContent = payload.tabTitle;
    chip.title = "Показать панель Reserve Meet";
    chip.addEventListener("click", () => {
      setCollapsed(payload, false);
    });
    return chip;
  }

  function expandedPanel(payload) {
    const wrap = document.createElement("div");
    wrap.setAttribute("class", "panel");

    const head = document.createElement("div");
    head.setAttribute("class", "head");

    const name = document.createElement("div");
    name.setAttribute("class", "name");
    name.textContent = payload.tabTitle;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.setAttribute("class", "close");
    closeBtn.setAttribute("aria-label", "Свернуть");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => {
      setCollapsed(payload, true);
    });

    head.append(name, closeBtn);

    const studentBtn = actionButton("Ученику");
    const slackBtn = actionButton("Slack");
    studentBtn.addEventListener("click", () => {
      void copy(payload.studentText, studentBtn);
    });
    slackBtn.addEventListener("click", () => {
      void copySlack(payload, slackBtn);
    });

    wrap.append(head, studentBtn, slackBtn);
    return wrap;
  }

  function setCollapsed(payload, collapsed) {
    payload.collapsed = collapsed;
    chrome.runtime.sendMessage({ type: "SET_OVERLAY_COLLAPSED", collapsed });
    renderPanel(payload);
  }

  function actionButton(label) {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = label;
    el.dataset.label = label;
    return el;
  }

  async function copy(text, buttonEl) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      fallbackCopy(text);
    }
    copied(buttonEl);
  }

  async function copySlack(payload, buttonEl) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([payload.slackHtml || payload.slackText], { type: "text/html" }),
          "text/plain": new Blob([payload.slackText], { type: "text/plain" }),
        }),
      ]);
    } catch {
      await copy(payload.slackText, buttonEl);
      return;
    }
    copied(buttonEl);
  }

  function fallbackCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }

  function copied(buttonEl) {
    buttonEl.textContent = "Скопировано";
    window.setTimeout(() => {
      buttonEl.textContent = buttonEl.dataset.label ?? "";
    }, 1400);
  }

  function style() {
    const el = document.createElement("style");
    el.textContent = `
      .panel, .chip {
        position: fixed;
        top: 56px;
        left: 12px;
        z-index: 2147483646;
        background: #f5f5f3;
        color: #1d1d1f;
        font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
        box-sizing: border-box;
      }
      .panel {
        display: grid;
        gap: 6px;
        width: 220px;
        padding: 12px;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      }
      .chip {
        max-width: 180px;
        border: 0;
        border-radius: 999px;
        padding: 6px 12px;
        cursor: pointer;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .name {
        font-weight: 600;
        font-size: 14px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .close {
        width: 22px;
        height: 22px;
        padding: 0;
        border: 0;
        background: transparent;
        color: #6e6e73;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
      }
      .panel > button {
        border: 0;
        background: #ffffff;
        color: #1d1d1f;
        border-radius: 10px;
        padding: 8px 10px;
        cursor: pointer;
        text-align: left;
        font: inherit;
      }
      .panel > button:hover, .chip:hover {
        background: #ecece8;
      }
      .close:hover {
        color: #1d1d1f;
      }
    `;
    return el;
  }
})();
