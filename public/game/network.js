(() => {
  const q = new URLSearchParams(location.search),
    room = q.get("room"),
    token = q.get("token"),
    seat = Number(q.get("seat"));
  if (!room || !token || ![0, 1].includes(seat)) return;
  onlineSeat = seat;
  let revision = -1,
    lastSent = "",
    applying = false,
    polling = false,
    hostStarted = false,
    dirty = false,
    sending = false,
    localMutation = 0;
  const originalRender = render;
  render = function () {
    originalRender();
    if (state && onlineSeat !== state.active && state.setup >= 2) {
      $("#actions").innerHTML =
        '<span class="mode-note">等待對手完成回合…</span>';
      $("#hint").textContent = "對手行動中，牌桌會自動同步。";
    }
  };
  const pack = () =>
    JSON.parse(
      JSON.stringify(state, (k, v) =>
        [
          "afterEffect",
          "pendingExhaust",
          "pendingExtra",
          "eventDiscardQueue",
        ].includes(k)
          ? undefined
          : v,
      ),
    );
  async function send() {
    if (!state || applying || sending) return;
    if (onlineSeat !== state.active) {
      dirty = false;
      return;
    }
    const raw = JSON.stringify(pack());
    if (raw === lastSent) {
      dirty = false;
      return;
    }
    const marker = localMutation;
    sending = true;
    try {
      const r = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "state",
          code: room,
          token,
          state: JSON.parse(raw),
        }),
      });
      if (r.ok) {
        revision = (await r.json()).revision;
        lastSent = raw;
        if (marker === localMutation) dirty = false;
      }
    } catch {
      setTimeout(send, 1000);
    } finally {
      sending = false;
      if (dirty && marker !== localMutation) setTimeout(send, 120);
    }
  }
  function adopt(x) {
    applying = true;
    state = x.state;
    revision = x.revision;
    lastSent = JSON.stringify(x.state);
    $("#start").classList.add("hidden");
    $("#game").classList.remove("hidden");
    $("#choice").classList.add("hidden");
    render();
    applying = false;
    if (state.setup < 2 && state.active === seat) setTimeout(setup, 50);
  }
  async function initialize() {
    if (hostStarted) return;
    hostStarted = true;
    oldNew();
    const initial = pack();
    $("#choice").classList.add("hidden");
    const r = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "init",
        code: room,
        token,
        state: initial,
      }),
    });
    if (!r.ok) {
      hostStarted = false;
      return;
    }
    const x = await r.json();
    if (x.state) adopt(x);
  }
  async function pull() {
    if (polling || dirty || sending) return;
    polling = true;
    try {
      const r = await fetch(`/api/rooms?code=${room}&token=${token}`, {
        cache: "no-store",
      });
      if (!r.ok) return;
      const x = await r.json();
      if (x.names) {
        $("#name1").value = x.names[0] || "玩家一";
        $("#name2").value = x.names[1] || "玩家二";
      }
      if (!x.state) {
        await initialize();
        return;
      }
      if (x.revision !== revision) adopt(x);
    } finally {
      polling = false;
    }
  }
  document.addEventListener(
    "click",
    () => {
      dirty = true;
      localMutation++;
      setTimeout(send, 120);
    },
    true,
  );
  const oldNew = window.newGame;
  $("#newGame").onclick = () => {
    if (seat !== 0) return;
    oldNew();
    setTimeout(send, 400);
  };
  if (seat === 1) {
    $("#start").innerHTML =
      '<input id="name1" type="hidden"><input id="name2" type="hidden"><div class="panel"><h2>正在同步牌局</h2><p>完成後會自動進入你的起始選牌。</p></div>';
  }
  pull();
  setInterval(pull, 1400);
})();
