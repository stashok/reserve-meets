(() => {
  if (window.__reserveMeetHandsWatch) return;
  window.__reserveMeetHandsWatch = true;

  let lastRaised = null;
  let lastSignal = "";
  let lastSent = 0;

  function publish(raised, raisedAt, remoteId) {
    const signal = `${remoteId || ""}:${raisedAt || 0}`;
    const now = Date.now();
    const changed = raised !== lastRaised || signal !== lastSignal;
    if (!changed && (!raised || now - lastSent < 2000)) return;
    lastRaised = raised;
    lastSignal = signal;
    lastSent = now;
    window.postMessage(
      { source: "reserve-meet", type: "HANDS", raised, raisedAt, remoteId },
      "*",
    );
  }

  function isRaised(participant) {
    if (!participant) return false;
    if (Number(participant.raisedHandTimestamp) > 0) return true;
    return participant.raisedHand === true;
  }

  function remotesList(remotes) {
    if (!remotes) return [];
    if (typeof remotes.values === "function") return [...remotes.values()];
    if (typeof remotes.toArray === "function") return remotes.toArray();
    return Object.values(remotes);
  }

  function readRaised() {
    try {
      const feature = window.APP?.store?.getState?.()?.["features/base/participants"];
      if (!feature) return null;
      const localId = feature.local?.id;
      const remotes = remotesList(feature.remote).filter((item) => item && item.id !== localId);
      const liveIds = new Set(remotes.map((item) => item.id).filter(Boolean));
      const raised = [];

      for (const participant of remotes) {
        if (isRaised(participant)) raised.push(participant);
      }

      const queue = feature.raisedHandsQueue;
      if (Array.isArray(queue)) {
        for (const item of queue) {
          if (!item?.id || item.id === localId || !liveIds.has(item.id)) continue;
          if (Number(item.raisedHandTimestamp) > 0 && !raised.some((row) => row.id === item.id)) {
            raised.push(item);
          }
        }
      }

      if (raised.length === 0) return { raised: false, raisedAt: 0, remoteId: "" };

      let newest = raised[0];
      for (const item of raised) {
        if (Number(item.raisedHandTimestamp) > Number(newest.raisedHandTimestamp)) newest = item;
      }
      return {
        raised: true,
        raisedAt: Number(newest.raisedHandTimestamp) || 0,
        remoteId: newest.id || "",
      };
    } catch {
      return null;
    }
  }

  function tick() {
    const state = readRaised();
    if (!state) return;
    publish(state.raised, state.raisedAt, state.remoteId);
  }

  window.setInterval(tick, 400);
  const wait = window.setInterval(() => {
    if (!window.APP?.store?.subscribe) return;
    window.clearInterval(wait);
    window.APP.store.subscribe(tick);
    tick();
  }, 300);
})();
