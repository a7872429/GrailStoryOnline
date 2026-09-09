const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)],
  D = GAME_DATA;
const img = (t, n) =>
  t === "card"
    ? `assets/new-card-${String(n).padStart(2, "0")}.svg`
    : `assets/${t}-${String(n).padStart(2, "0")}.webp`;
const esc = (s) =>
  String(s || "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );
let state,
  selected = {},
  choice,
  previewTimer,
  previewPinned = false,
  previewIgnoreNextClick = false,
  modalContinue = null,
  playerChoiceCallback = null;
let onlineSeat = null;
let effectContinuations = [];
let extraContinuation = null;
let dismissedGameOverKey = "";
function queueEffectContinuation(next) {
  if (typeof next === "function") effectContinuations.push(next);
}
function viewerSeat() {
  return Number.isInteger(onlineSeat) && onlineSeat >= 0 && onlineSeat < state.players.length
    ? onlineSeat
    : state.active;
}
function shuffle(a) {
  for (let i = a.length - 1; i; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function player(name) {
  return { name, hand: [], field: [], scores: [], black: 2, white: 2 };
}
function log(s) {
  state.log.push(`第 ${state.round} 回合｜${s}`);
}
function handLimit(p) {
  if (p.field.some((c) => c.id === 51)) return 7;
  return 5;
}
function effectBusy() {
  return !!(
    state.pendingDice ||
    state.pendingExhaust ||
    state.pendingExtra ||
    state.pendingBarrier ||
    state.pendingSaintRemoval ||
    effectContinuations.length
  );
}
function setDie(owner, key, value, source = "效果") {
  let p = state.players[owner],
    old = p[key],
    next = Math.max(1, Math.min(6, value));
  p[key] = next;
  if (old !== next)
    log(`${source}：${p.name}${key === "black" ? "黑" : "白"}骰點數 ${old} → ${next}。`);
  if (key === "white" && next > old) {
    let barriers = p.field.filter((c) => c.id === 7).length;
    if (barriers) {
      state.pendingBarrier = (state.pendingBarrier || 0) + barriers;
      log(
        `${source}使${p.name}白骰增加，觸發 ${barriers} 次「結界師」在場效果。`,
      );
    }
  }
  return { old, next };
}
function resetCard(card, owner, source = "效果") {
  if (!card.exhausted) return false;
  card.exhausted = false;
  if (card.id === 51) {
    state.pendingSaintRemoval = (state.pendingSaintRemoval || 0) + 1;
    log(`${source}重置「聖女」，觸發移除中央區 1 張牌。`);
  }
  return true;
}
function newGame() {
  effectContinuations = [];
  extraContinuation = null;
  let deck = shuffle(
      D.cards.map((c) => ({
        ...c,
        entry: { ...c.entry },
        activate: { ...c.activate },
        img: img("card", c.id),
        exhausted: false,
      })),
    ),
    eventToggle = $("#useEvents"),
    queryEvents = new URLSearchParams(location.search).get("events"),
    eventsEnabled = state?.gameOver
      ? state.eventsEnabled !== false
      : queryEvents !== null
        ? queryEvents !== "0"
        : eventToggle
          ? eventToggle.checked
          : state?.eventsEnabled !== false,
    events = eventsEnabled ? shuffle(D.events.map((e) => ({ ...e }))) : [];
  let playerCount = window.onlinePlayerCount === 4 ? 4 : 2,
    players = Array.from({ length: playerCount }, (_, i) =>
      player($("#name" + (i + 1))?.value || `玩家${i + 1}`),
    );
  state = {
    players,
    active: 0,
    deck,
    discard: [],
    center: [],
    events,
    eventReady: [],
    eventDiscard: [],
    currentEvent: null,
    currentEventOwner: null,
    round: 1,
    log: [],
    setup: 0,
    turnAction: null,
    turnDidSomething: false,
    activationCount: 0,
    eventsEnabled,
    gameOver: null,
  };
  dismissedGameOverKey = "";
  state.players.forEach((p) => (p.hand = deck.splice(-5)));
  state.center = deck.splice(-4);
  $("#start").classList.add("hidden");
  $("#game").classList.remove("hidden");
  render();
  setup();
}
function card(c, z, i, back = false, scored = false) {
  if (back)
    return `<span class="card card-back back-${c.faction}" title="${c.faction}命格">${c.faction}</span>`;
  return `<button class="card ${c.exhausted ? "exhausted" : ""} ${scored ? "scored" : ""}" data-zone="${z}" data-index="${i}" data-id="${c.id}" data-img="${c.img}"><img src="${c.img}" alt="${esc(c.name)}">${scored ? '<span class="tag">計分牌</span>' : ""}</button>`;
}
function eventCard(e, z, i) {
  let faces = e.participants
    .map((id) => {
      let name = D.cards.find((c) => c.id === id)?.name;
      return `<span class="event-avatar" style="background-image:url('${img("card", id)}')" role="img" aria-label="${esc(name)}"></span>`;
    })
    .join("");
  return `<button class="card event-card event-count-${e.participants.length}" data-zone="${z}" data-index="${i}" data-id="${e.id}"><strong>${esc(e.name)}</strong><span class="event-faces">${faces}</span></button>`;
}
function die(n, color, owner, key) {
  return `<button class="die die-${color}" data-die-owner="${owner}" data-die-key="${key}" aria-label="${owner === state.active ? "我方" : "敵方"}${color === "black" ? "黑" : "白"}骰，${n}點">${n}</button>`;
}
function activeView(p) {
  let i = viewerSeat();
  return `<div class="player-head"><h2>${esc(p.name)}</h2><div class="player-dice">${die(p.black, "black", i, "black")}${die(p.white, "white", i, "white")}</div><div class="score-badge">紀行 ${p.scores.length}/4</div></div><div class="zones"><div><div class="title">自身區 ${p.field.length}/5</div><div class="card-row">${p.field.map((c, i) => card(c, "field", i)).join("") || '<span class="empty">尚無角色</span>'}</div></div><div><div class="title">你的手牌 ${p.hand.length}/${handLimit(p)}</div><div class="card-row">${p.hand.map((c, i) => card(c, "hand", i)).join("") || '<span class="empty">手牌為空</span>'}</div></div><div class="score-zone"><div class="title">計分區 ${p.scores.length}/4</div><div class="card-row score-cards">${p.scores.map((c, i) => card(c, "score", i, false, true)).join("") || '<span class="empty">尚無計分牌</span>'}</div></div></div>`;
}
function teamLabel(i) {
  if (state.players.length < 4) return i === viewerSeat() ? "我方" : "敵方";
  return `${i % 2 === 0 ? "紅" : "藍"}${i < 2 ? 1 : 2}`;
}
function opponentView(p, i) {
  return `<section class="opponent-seat team-${i % 2 ? "blue" : "red"}"><div class="opponent-head"><div class="opponent-identity"><span>${teamLabel(i)}</span><h2>${esc(p.name)}</h2></div><strong>紀行 ${p.scores.length}/4</strong></div><div class="title"><span>自身區 ${p.field.length}/5</span><span>手牌 ${p.hand.length}</span></div><div class="card-row opponent-field">${p.field.map((c, n) => card(c, "opp", n)).join("") || '<span class="empty">尚無角色</span>'}</div><div class="opponent-hand-line"><div class="card-row opponent-hand">${p.hand.map((c) => card(c, "", 0, true)).join("")}</div><div class="opponent-stats">${die(p.black, "black", i, "black")}${die(p.white, "white", i, "white")}</div></div></section>`;
}
function base() {
  if (state.gameOver)
    return `<span class="mode-note">遊戲已結束：${esc(state.gameOver.message)}</span>`;
  if (
    Number.isInteger(onlineSeat) &&
    state.setup >= state.players.length &&
    onlineSeat !== state.active
  )
    return `<span class="mode-note">等待對手完成回合…</span>`;
  if (state.turnAction === "play")
    return `<span class="mode-note">打牌進場：請選擇一張手牌</span><button data-act="cancelMain" class="ghost">返回三選一</button><button data-act="score">⚡ 計分</button>`;
  if (state.turnAction === "activate")
    return `<span class="mode-note">啟動階段：依序選擇直立角色</span><button data-act="finishActivate" class="primary">完成啟動</button><button data-act="cancelMain" class="ghost">取消啟動，返回三選一</button><button data-act="score">⚡ 計分</button>`;
  if (state.turnAction)
    return `<span class="mode-note">本回合已完成「${state.turnAction === "playDone" ? "打牌進場" : state.turnAction === "buy" ? "購買／重置" : "啟動"}」</span><button data-act="score">⚡ 計分</button><button data-act="end" class="danger" ${state.turnDidSomething ? "" : "disabled"}>結束回合</button>`;
  return `<button data-act="choosePlay">打牌進場</button><button data-act="buy">購買＆重置</button><button data-act="chooseActivate">啟動</button><button data-act="score">⚡ 計分</button><button data-act="end" class="danger" disabled title="請先完成一項主要行動">結束回合</button>`;
}
function actions() {
  let p = state.players[state.active],
    c =
      selected.zone === "hand"
        ? p.hand[selected.index]
        : selected.zone === "field"
          ? p.field[selected.index]
          : null;
  if (selected.zone === "hand" && c) {
    let costs = c.entry.effect
        ? c.entry.costs.length
          ? c.entry.costs
          : ["無須支付"]
        : [],
      entryButtons = costs
        .map(
          (x, i) =>
            `<button data-act="entry" data-cost="${i}" class="primary skill-action">進場條件 ${String.fromCharCode(65 + i)}：${esc(x)}</button>`,
        )
        .join("");
    return `<button data-act="play" class="primary">打牌進場（不發動）</button>${entryButtons}<button data-act="score">⚡ 計分</button><button data-act="cancelMain" class="ghost">取消打牌，返回三選一</button>`;
  }
  if (selected.zone === "field" && c)
    return `<button data-act="activate" class="primary skill-action">啟動：${esc(c.activate.cost || "依卡牌條件")}</button><button data-act="score">⚡ 計分</button><button data-act="cancelMain" class="ghost">取消啟動，返回三選一</button>`;
  return base();
}
function bindActions() {
  $$("[data-act]").forEach(
    (b) =>
      (b.onclick = () =>
        b.dataset.act === "entry"
          ? beginEntry(+b.dataset.cost)
          : {
              buy,
              score,
              end,
              play,
              activate: beginActivate,
              cancel: clearSel,
              choosePlay,
              chooseActivate,
              finishActivate,
              cancelMain,
              extraPay,
              extraSkip,
              barrierPay,
              barrierSkip,
            }[b.dataset.act]()),
  );
}
function render() {
  let view = viewerSeat(),
    p = state.players[view],
    opponents = state.players.map((p, i) => ({ p, i })).filter((x) => x.i !== view),
    top = state.deck.at(-1),
    last = state.discard.at(-1);
  $("#turnName").textContent =
    state.setup < state.players.length
      ? `${state.players[state.active].name}：選擇起始角色`
      : state.players[state.active].name;
  $("#opponent").innerHTML = opponents.map((x) => opponentView(x.p, x.i)).join("");
  $("#activePlayer").innerHTML = activeView(p);
  $("#center").innerHTML =
    state.center.map((c, i) => card(c, "center", i)).join("") ||
    '<span class="empty">中央區為空</span>';
  $("#eventReady").innerHTML =
    state.eventsEnabled === false
      ? '<span class="empty">本局未啟用事件牌</span>'
      : state.eventReady.map((e, i) => eventCard(e, "event", i)).join("") ||
        '<span class="empty">購買後翻開事件</span>';
  $("#currentEvent").innerHTML = state.currentEvent
    ? eventCard(state.currentEvent, "current", 0)
    : `<span class="empty">${state.eventsEnabled === false ? "事件牌未啟用" : "尚無事件"}</span>`;
  $("#deckPile").innerHTML = top
    ? `${card(top, "deck", state.deck.length - 1, true)}<span class="pile-meta">牌庫頂：${top.faction}<b>${state.deck.length} 張</b></span>`
    : '<span class="empty">牌庫已空</span>';
  $("#discardPile").innerHTML = last
    ? `${card(last, "discard", state.discard.length - 1)}<span class="pile-meta">最後棄牌<b>${state.discard.length} 張</b></span>`
    : '<span class="pile-meta">棄牌區<b>0 張</b></span>';
  $("#deckCount").textContent = `剩餘 ${state.deck.length} 張`;
  $("#eventDeckCount").textContent =
    state.eventsEnabled === false
      ? "事件牌：停用"
      : `事件牌堆 ${state.events.length}｜已棄 ${state.eventDiscard.length}`;
  $("#log").innerHTML = state.log
    .slice()
    .reverse()
    .map((x) => `<li>${esc(x)}</li>`)
    .join("");
  selected = {};
  $("#actions").innerHTML = state.setup < state.players.length ? "" : base();
  bindCards();
  bindActions();
  if (state.pendingDice) showDiceChoice();
  else if (state.pendingExhaust && !state.exhaustChoiceOpening) {
    state.exhaustChoiceOpening = true;
    setTimeout(showPendingExhaust);
  } else if (state.pendingSaintRemoval) showSaintRemoval();
  else if (state.pendingBarrier) showBarrierChoice();
  else if (effectContinuations.length && !state.effectContinuationOpening) {
    state.effectContinuationOpening = true;
    setTimeout(continueEffectFlow);
  } else if (state.pendingExtra) showExtraChoice();
  if (state.gameOver) setTimeout(showGameOver);
}
function clearSel() {
  $$(".selected").forEach((x) => x.classList.remove("selected"));
  selected = {};
  $("#actions").innerHTML = base();
  bindActions();
}
function bindCards() {
  $$("#game [data-zone]").forEach((el) => {
    bindPreview(el);
    el.onclick = () => {
      if (state.gameOver) return showGameOver();
      if (el._previewDragged) {
        el._previewDragged = false;
        return;
      }
      let z = el.dataset.zone;
      if (["opp", "score", "current", "deck", "discard"].includes(z)) return;
      if (z === "hand" && state.turnAction !== "play")
        return warn("尚未選擇打牌行動", "請先在下方三選一中選擇「打牌進場」。");
      if (z === "field" && state.turnAction !== "activate")
        return warn("尚未進入啟動階段", "請先在下方三選一中選擇「啟動」。");
      $$(".selected").forEach((x) => x.classList.remove("selected"));
      el.classList.add("selected");
      selected = { zone: z, index: +el.dataset.index };
      $("#actions").innerHTML = actions();
      bindActions();
      $("#hint").textContent =
        z === "hand"
          ? "選擇直接入場，或支付條件發動進場效果。"
          : z === "field"
            ? "可發動此角色的啟動效果。"
            : "已選擇卡牌。";
    };
  });
}
function choosePlay() {
  state.turnAction = "play";
  log(`${state.players[state.active].name} 選擇「打牌進場」。`);
  render();
  $("#hint").textContent = "請選擇一張手牌。";
}
function cancelMain() {
  if (state.turnAction === "activate" && state.activationCount > 0)
    return warn("已經啟動角色", "至少一張角色已經完成啟動，不能取消整個啟動行動。");
  selected = {};
  state.turnAction = null;
  state.activationCount = 0;
  render();
}
function chooseActivate() {
  state.turnAction = "activate";
  state.activationCount = 0;
  log(`${state.players[state.active].name} 進入啟動階段。`);
  render();
  $("#hint").textContent = "依序選擇要橫置並發動效果的直立角色。";
}
function finishActivate() {
  if (!state.activationCount)
    return warn(
      "尚未啟動角色",
      "回合必須完成一項主要行動，請至少啟動一名直立角色。",
    );
  log(`${state.players[state.active].name} 完成啟動階段。`);
  state.turnAction = "activateDone";
  render();
}
function skill(c, event) {
  if (event) {
    let names = c.participants
      .map((id) => D.cards.find((x) => x.id === id)?.name)
      .filter(Boolean)
      .join("、");
    return `<div class="skill-section"><b>參與角色</b><br>${esc(names || "—")}</div><div class="skill-section"><b>進場效果</b><br>${esc(c.enter || "—")}</div><div class="skill-section"><b>在場持續效果</b><br>${esc(c.ongoing || "—")}</div><div class="skill-section"><b>離場效果</b><br>${esc(c.leave || "—")}</div>`;
  }
  let kw =
    c.keywords
      .map((k) => {
        let x = D.keywords[k] || {};
        return `<em>${esc(k)}</em><br>條件：${esc(x.condition || "—")}<br>效果：${esc(x.effect || "—")}${x.extraEffect ? `<br>追加：${esc(x.extraCondition)} → ${esc(x.extraEffect)}` : ""}`;
      })
      .join("<br>") || "—";
  let ongoing = (c.ongoing || [])
    .map(
      (x, i) =>
        `<div class="skill-section"><b>在場（自身區）被動${c.ongoing.length > 1 ? i + 1 : ""}</b><br>條件：${esc(x.condition || "—")}<br>效果：${esc(x.effect || "—")}</div>`,
    )
    .join("");
  let entry =
    c.entry.costs.length || c.entry.effect || c.entry.extraEffect
      ? `<div class="skill-section"><b>進場</b><br>條件：${esc(c.entry.costs.join("／") || "—")}<br>效果：${esc(c.entry.effect || "—")}${c.entry.extraEffect ? `<br>追加：${esc(c.entry.extraCondition)} → ${esc(c.entry.extraEffect)}` : ""}</div>`
      : "";
  return `<div class="skill-section"><b>${c.faction}命格 · 事件</b><br>${esc(c.event || "無")}</div><div class="skill-section"><b>關鍵字</b><br>${kw}</div>${ongoing}${entry}<div class="skill-section"><b>啟動</b><br>條件：${esc(c.activate.cost || "—")}<br>效果：${esc(c.activate.effect || "—")}${c.activate.extraEffect ? `<br>追加：${esc(c.activate.extraCondition)} → ${esc(c.activate.extraEffect)}` : ""}</div>`;
}
function preview(el) {
  let event = ["event", "current"].includes(el.dataset.zone),
    c = (event ? D.events : D.cards).find((x) => x.id === +el.dataset.id);
  if (!c) return;
  $("#previewImage").classList.toggle("hidden", event);
  if (!event) $("#previewImage").src = el.dataset.img;
  $("#previewTitle").textContent = c.name;
  $("#previewText").innerHTML = skill(c, event);
  $("#cardPreview").classList.toggle("event-preview", event);
  $("#cardPreview").classList.remove("hidden");
}
function movePreview(e) {
  let b = $("#cardPreview"),
    r = b.getBoundingClientRect(),
    w = r.width || 540,
    h = r.height || 500;
  b.style.left = `${Math.max(8, Math.min(e.clientX + 12, innerWidth - w - 16))}px`;
  b.style.top = `${Math.max(8, Math.min(e.clientY - h / 2, innerHeight - h - 8))}px`;
}
function hidePreview() {
  clearTimeout(previewTimer);
  previewPinned = false;
  $("#cardPreview").classList.add("hidden");
}
function bindPreview(el) {
  let start;
  el.onpointerdown = (e) => {
    if (e.button !== 0) return;
    previewPinned = false;
    clearTimeout(previewTimer);
    start = { x: e.clientX, y: e.clientY, touch: e.pointerType === "touch" };
    previewTimer = setTimeout(
      () => {
        previewPinned = start?.touch || false;
        if (start?.touch) {
          el._previewDragged = true;
          previewIgnoreNextClick = true;
        }
        preview(el);
        movePreview(e);
      },
      start.touch ? 500 : 420,
    );
  };
  el.onpointermove = (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) {
      el._previewDragged = true;
      clearTimeout(previewTimer);
    }
    if (!$("#cardPreview").classList.contains("hidden") && !start?.touch)
      movePreview(e);
  };
  el.onpointerup = el.onpointercancel = () => {
    start = null;
    clearTimeout(previewTimer);
    if (!previewPinned) $("#cardPreview").classList.add("hidden");
  };
  el.onpointerleave = () => {
    if (start?.touch) return;
    clearTimeout(previewTimer);
    if (!previewPinned) $("#cardPreview").classList.add("hidden");
  };
  el.oncontextmenu = (e) => {
    e.preventDefault();
    clearTimeout(previewTimer);
    previewPinned = true;
    preview(el);
    movePreview(e);
  };
}
function openChoice(o) {
  let min = o.minRequired ?? o.required,
    limit = o.required,
    label = min === limit ? `${limit}` : `最多 ${limit}`;
  choice = { ...o, minRequired: min, picks: new Set() };
  $("#choiceTitle").textContent = o.title;
  $("#choiceText").innerHTML =
    `${o.text} <span class="choice-count">已選 0/${label}</span>`;
  $("#choiceCards").classList.add("setup-horizontal");
  $("#choiceCards").innerHTML = o.cards
    .map((x, i) => {
      let h = o.event
        ? eventCard(x.card, "event", i)
        : card(x.card, "choice", i);
      h = h.replace(
        `data-zone="${o.event ? "event" : "choice"}"`,
        `data-zone="${o.event ? "event" : "choice"}" data-choice-zone="${x.zone || ""}"`,
      );
      return `<div class="choice-item">${h}${x.zone ? `<span class="choice-zone">${esc(x.zone)}</span>` : ""}</div>`;
    })
    .join("");
  $("#choiceCancel").classList.toggle("hidden", o.cancel === false);
  $("#choiceConfirm").disabled = min > 0;
  $("#choice").classList.remove("hidden");
  $$("#choiceCards .card").forEach((el) => {
    bindPreview(el);
    el.onclick = () => {
      if (el._previewDragged) {
        el._previewDragged = false;
        return;
      }
      let i = +el.dataset.index,
        first = [...choice.picks][0],
        locked = first === undefined ? "" : choice.cards[first].zone;
      if (choice.picks.has(i)) {
        choice.picks.delete(i);
        el.classList.remove("selected");
      } else if (
        choice.picks.size < choice.required &&
        (!choice.sameZone || !locked || choice.cards[i].zone === locked)
      ) {
        choice.picks.add(i);
        el.classList.add("selected");
      }
      let next = [...choice.picks][0],
        zone = next === undefined ? "" : choice.cards[next].zone;
      if (choice.sameZone)
        $$("#choiceCards .card").forEach((x, j) =>
          x.classList.toggle("dimmed", !!zone && choice.cards[j].zone !== zone),
        );
      $("#choiceText .choice-count").textContent =
        `已選 ${choice.picks.size}/${label}`;
      $("#choiceConfirm").disabled =
        choice.picks.size < choice.minRequired ||
        choice.picks.size > choice.required;
    };
  });
}
function setup() {
  let p = state.players[state.active];
  openChoice({
    title: `${p.name}：選擇起始角色`,
    text: "從五張手牌選 1 張放入自身區。",
    cards: p.hand.map((c) => ({ card: c })),
    required: 1,
    cancel: false,
    horizontal: true,
    confirm: (picks) => {
      p.field.push(p.hand.splice([...picks][0], 1)[0]);
      log(`${p.name} 選擇起始角色。`);
      state.setup++;
      if (state.setup < state.players.length) {
        state.active = state.setup;
        render();
        if (onlineSeat === null) {
          $("#passName").textContent = state.players[state.active].name;
          $("#pass").classList.remove("hidden");
          setTimeout(setup);
        }
      } else {
        state.active = 0;
        state.setup = state.players.length;
        render();
        if (onlineSeat === null) {
          $("#passName").textContent = state.players[0].name;
          $("#pass").classList.remove("hidden");
        }
      }
    },
  });
}
function warn(t, s, continuation = null) {
  modalContinue = continuation;
  $("#modalTitle").textContent = t;
  $("#modalText").textContent = s;
  $("#modal").classList.remove("hidden");
}
function opponentPlayers(owner = state.active) {
  return state.players
    .map((_, i) => i)
    .filter((i) =>
      state.players.length === 4 ? i % 2 !== owner % 2 : i !== owner,
    );
}
function targetPlayersFor(text, owner = state.active) {
  let scope = String(text || "");
  if (/你(?:或|與)(?:敵方|對手)|自身(?:區)?(?:或|與)(?:敵方|對手)/.test(scope))
    return [owner, ...opponentPlayers(owner)];
  return state.players.map((_, i) => i);
}
function targetZoneLabel(owner, effectOwner = state.active) {
  if (owner === effectOwner) return "我方自身區";
  if (state.players.length === 4 && owner % 2 === effectOwner % 2)
    return `${teamLabel(owner)}（隊友）自身區`;
  return `${teamLabel(owner)}自身區`;
}
function choosePlayerTarget(title, text, done, candidates = null) {
  let owner = state.active,
    allowed = candidates || state.players.map((_, i) => i);
  playerChoiceCallback = done;
  let buttons = state.players
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => allowed.includes(i))
    .map(
      ({ p, i }) =>
        `<button data-player-target="${i}" class="${i === owner ? "primary" : ""}">${i === owner ? "自己" : state.players.length === 2 ? "敵方" : teamLabel(i)}：${esc(p.name)}（黑 ${p.black}／白 ${p.white}）</button>`,
    )
    .join("");
  let overlay = $("#playerChoice");
  if (!overlay) {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="playerChoice" class="overlay hidden"><div class="panel player-choice-panel"><h2 id="playerChoiceTitle"></h2><p id="playerChoiceText"></p><div id="playerChoiceButtons" class="player-targets"></div></div></div>',
    );
    overlay = $("#playerChoice");
  }
  $("#playerChoiceTitle").textContent = title;
  $("#playerChoiceText").textContent = text;
  $("#playerChoiceButtons").innerHTML = buttons;
  overlay.classList.remove("hidden");
  $$("#playerChoice [data-player-target]").forEach(
    (b) =>
      (b.onclick = () => {
        let cb = playerChoiceCallback;
        playerChoiceCallback = null;
        overlay.classList.add("hidden");
        cb?.(+b.dataset.playerTarget);
      }),
  );
}
function chooseCardThenPlayer(c, after, sourceName = "技能效果") {
  let pool = state.center.map((card, index) => ({
    card,
    index,
    zone: "中央區",
  }));
  if (!pool.length) return warn("沒有可選牌卡", "中央區目前沒有牌卡。", after);
  openChoice({
    title: `「${c.name}」－${sourceName}：指定牌卡`,
    text: "選擇中央區 1 張牌。",
    cards: pool,
    required: 1,
    cancel: false,
    confirm: (picks) => {
      let pick = pool[[...picks][0]],
        card = state.center[pick.index];
      choosePlayerTarget(
        `「${c.name}」－${sourceName}`,
        "選擇這張牌要放入哪位玩家的自身區。",
        (owner) => {
          state.center.splice(pick.index, 1);
          let field = state.players[owner].field;
          if (field.length >= 5) state.discard.push(field.shift());
          field.push(card);
          log(
            `「${c.name}」將「${card.name}」放入 ${state.players[owner].name} 的自身區。`,
          );
          refill();
          render();
          after?.();
        },
        targetPlayersFor("自身區或敵方自身區"),
      );
    },
  });
}
function chooseResetTarget(c, after, sourceName = "技能效果", scopeText = "場上") {
  let pool = [],
    owners = targetPlayersFor(scopeText);
  state.players.forEach((p, owner) =>
    p.field.forEach((card, index) => {
      if (owners.includes(owner) && card.exhausted)
        pool.push({
          card,
          owner,
          index,
          zone: targetZoneLabel(owner),
        });
    }),
  );
  if (!pool.length)
    return warn("沒有可重置角色", "雙方自身區目前沒有橫置角色。", after);
  openChoice({
    title: `「${c.name}」－${sourceName}：重置角色`,
    text: "選擇 1 張橫置角色重置。",
    cards: pool,
    required: 1,
    cancel: false,
    confirm: (picks) => {
      let x = pool[[...picks][0]];
      let saintTriggered = x.card.id === 51;
      if (saintTriggered && after) queueEffectContinuation(after);
      resetCard(x.card, x.owner, `「${c.name}」`);
      log(
        `「${c.name}」重置 ${state.players[x.owner].name} 的「${x.card.name}」。`,
      );
      render();
      if (!saintTriggered) after?.();
    },
  });
}
function showSaintRemoval() {
  if (state.saintRemovalOpening) return;
  if (!state.center.length) {
    state.pendingSaintRemoval--;
    if (!state.pendingSaintRemoval) delete state.pendingSaintRemoval;
    log("聖女在場效果：中央區為空，無牌可移除。");
    return render();
  }
  state.saintRemovalOpening = true;
  let pool = state.center.map((card, index) => ({
    card,
    index,
    zone: "中央區",
  }));
  openChoice({
    title: "聖女：被重置時",
    text: "移除中央區 1 張牌。",
    cards: pool,
    required: 1,
    cancel: false,
    confirm: (picks) => {
      let pick = pool[[...picks][0]];
      state.discard.push(...state.center.splice(pick.index, 1));
      state.pendingSaintRemoval--;
      if (!state.pendingSaintRemoval) delete state.pendingSaintRemoval;
      state.saintRemovalOpening = false;
      log(`聖女在場效果：移除中央區「${pick.card.name}」。`);
      refill();
      render();
    },
  });
}
function showBarrierChoice() {
  let p = state.players[state.active];
  $("#actions").innerHTML =
    `<span class="mode-note">結界師：你的白骰增加。可先移除中央區或自身區 1 張幻命格牌，再橫置雙方合計 1 名角色。</span><button data-act="barrierPay" class="primary">支付並發動</button><button data-act="barrierSkip" class="ghost">不發動</button>`;
  bindActions();
}
function barrierSkip() {
  state.pendingBarrier--;
  if (!state.pendingBarrier) delete state.pendingBarrier;
  log("結界師在場效果：選擇不發動。");
  render();
}
function barrierPay() {
  let c = state.players[state.active].field.find((x) => x.id === 7);
  if (!c) return barrierSkip();
  pay(
    "移除中央區或自身區1幻",
    () => {
      state.pendingBarrier--;
      if (!state.pendingBarrier) delete state.pendingBarrier;
      let spec = exhaustSpec("橫置自身與敵方區合計1角色");
      chooseExhaustTargets(spec, "結界師在場效果", () => render());
    },
    () => render(),
    c,
  );
}
function paymentSnapshot() {
  return {
    players: state.players.map((p) => ({
      hand: [...p.hand],
      field: [...p.field],
      scores: [...p.scores],
    })),
    center: [...state.center],
    discard: [...state.discard],
    exhausted: state.players.flatMap((p) =>
      p.field.map((c) => [c, !!c.exhausted]),
    ),
    log: [...state.log],
    turnDidSomething: state.turnDidSomething,
  };
}
function rollbackPayment(s, resetMain = false) {
  state.players.forEach((p, i) => {
    p.hand = s.players[i].hand;
    p.field = s.players[i].field;
    p.scores = s.players[i].scores;
  });
  state.center = s.center;
  state.discard = s.discard;
  s.exhausted.forEach(([c, v]) => (c.exhausted = v));
  state.log = s.log;
  state.turnDidSomething = s.turnDidSomething;
  state.pendingExhaust = null;
  effectContinuations = [];
  if (resetMain) state.turnAction = null;
  render();
}
const cn = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 };
function exhaustSpec(text) {
  let source = String(text || ""),
    m = source.match(
      /橫置([^，。；;\n]*?)(最多|合計)?\s*(\d+|[一二三四五])\s*個?角色/,
    ),
    n;
  if (m) n = +m[3] || cn[m[3]];
  else {
    m = source.match(
      /選擇([^，。；;\n]*?)(最多|合計)?\s*(\d+|[一二三四五])\s*個?角色橫置/,
    );
    if (m) n = +m[3] || cn[m[3]];
  }
  if (!m) return null;
  let clause = m[0],
    both = /敵方|對手|場上|目標角色/.test(clause),
    optional = /最多/.test(clause);
  return { clause, count: n, both, optional };
}
function chooseExhaustTargets(spec, title, confirm, cancel) {
  let effectOwner = spec.owner ?? state.active,
    owners = spec.both
      ? targetPlayersFor(spec.clause, effectOwner)
      : [effectOwner],
    pool = [];
  owners.forEach((owner) =>
    state.players[owner].field.forEach((card, index) => {
      if (!card.exhausted)
        pool.push({
          card,
          owner,
          index,
          zone: targetZoneLabel(owner, effectOwner),
        });
    }),
  );
  let required = Math.min(spec.count, pool.length),
    min = spec.optional ? 0 : spec.count;
  if (pool.length < min) {
    cancel?.();
    return warn(
      "可橫置角色不足",
      `需要 ${spec.count} 名未橫置角色，目前只有 ${pool.length} 名。`,
    );
  }
  openChoice({
    title,
    text: spec.both
      ? "選擇我方或敵方自身區的直立角色。"
      : "選擇我方自身區的直立角色。",
    cards: pool,
    required,
    minRequired: spec.optional ? 0 : required,
    cancel: !!cancel,
    cancelAction: cancel,
    confirm: (picks) => {
      let chosen = [...picks].map((i) => pool[i]);
      chosen.forEach((x) => (x.card.exhausted = true));
      if (chosen.length)
        log(
          `${title}：橫置 ${chosen.map((x) => `${state.players[x.owner].name}的「${x.card.name}」`).join("、")}。`,
        );
      confirm?.(chosen);
      render();
    },
  });
}
function showPendingExhaust() {
  let job = state.pendingExhaust;
  state.pendingExhaust = null;
  state.exhaustChoiceOpening = false;
  if (job) chooseExhaustTargets(job.spec, job.title);
}
function recycleDiscardIntoDeck() {
  if (state.deck.length || !state.discard.length) return false;
  state.deck = shuffle(state.discard.splice(0));
  log(`牌庫用盡，將棄牌區 ${state.deck.length} 張牌重新洗牌放回牌庫。`);
  return true;
}
function refill() {
  while (state.center.length < 4) {
    if (!state.deck.length && !recycleDiscardIntoDeck()) break;
    state.center.push(state.deck.pop());
    recycleDiscardIntoDeck();
  }
}
function keywordEffects(c, p) {
  let effects = [];
  for (let name of c.keywords) {
    let count = p.field.filter((x) => x.keywords.includes(name)).length,
      data = D.keywords[name];
    if (!data || count < 2) continue;
    effects.push({ name, text: data.effect });
    let need = +(data.extraCondition || "").match(/已有(\d+)個/)?.[1];
    if (data.extraEffect && need && count >= need + 1)
      effects.push({ name: `${name}追加`, text: data.extraEffect });
  }
  return effects;
}
function runEffectSequence(items, c, after) {
  let next = () => {
    let item = items.shift();
    if (!item) return after?.();
    log(`「${c.name}」觸發關鍵字【${item.name}】。`);
    applyEffect(item.text, c, next, item.name);
  };
  next();
}
function chooseCenterCardToHand(c, after, sourceName) {
  let owner = state.active,
    p = state.players[owner],
    pool = state.center.map((card, index) => ({ card, index, zone: "中央區" }));
  if (!pool.length)
    return warn("中央區沒有牌", `「${c.name}」－${sourceName}沒有可選擇的牌。`, after);
  openChoice({
    title: `「${c.name}」－${sourceName}`,
    text: "從中央區選擇 1 張牌加入你的手牌。",
    cards: pool,
    required: 1,
    cancel: false,
    confirm: (picks) => {
      let pick = pool[[...picks][0]],
        card = state.center.splice(pick.index, 1)[0];
      p.hand.push(card);
      log(`「${c.name}」－${sourceName}：${p.name}將中央區「${card.name}」加入手牌。`);
      refill();
      render();
      after?.();
    },
  });
}
function chooseExtraPlay(sourceCard, after, sourceName, exhaustAfter = false) {
  let owner = state.active,
    p = state.players[owner],
    pool = p.hand.map((card, index) => ({ card, index, zone: "我方手牌" }));
  if (!pool.length)
    return warn("沒有可打出的手牌", `「${sourceCard.name}」－${sourceName}無法額外打牌。`, after);
  openChoice({
    title: `「${sourceCard.name}」－${sourceName}`,
    text: `選擇額外打出的 1 張牌${exhaustAfter ? "；進場後將其橫置" : ""}。`,
    cards: pool,
    required: 1,
    cancel: false,
    confirm: (picks) => {
      let pick = pool[[...picks][0]],
        card = p.hand.splice(pick.index, 1)[0];
      if (p.field.length >= 5) state.discard.push(p.field.shift());
      card.exhausted = exhaustAfter;
      p.field.push(card);
      log(`「${sourceCard.name}」－${sourceName}：${p.name}額外打出「${card.name}」${exhaustAfter ? "並橫置" : ""}。`);
      let effects = keywordEffects(card, p),
        top = state.deck.at(-1);
      if (top && top.faction === card.faction) {
        state.discard.push(state.deck.pop());
        recycleDiscardIntoDeck();
        effects.push({ name: "與牌庫頂牌同系", text: "你選擇自己黑骰或白骰點數+1" });
        log(`「${card.name}」與牌庫頂同為${card.faction}命格，牌庫頂移至棄牌區。`);
      }
      refill();
      render();
      if (effects.length) runEffectSequence(effects, card, after);
      else after?.();
    },
  });
}
function put(effect) {
  let p = state.players[state.active],
    c = p.hand[selected.index];
  c = p.hand.splice(selected.index, 1)[0];
  if (p.field.length >= 5) state.discard.push(p.field.shift());
  p.field.push(c);
  state.turnAction = "playDone";
  state.turnDidSomething = true;
  if (effect && c.entry.costs.join("").includes("橫置這張牌"))
    c.exhausted = true;
  log(`${p.name} 打出「${c.name}」${effect ? "並發動進場效果" : ""}。`);
  let keywords = keywordEffects(c, p),
    top = state.deck.at(-1),
    topEffects = [];
  if (top && top.faction === c.faction) {
    state.discard.push(state.deck.pop());
    recycleDiscardIntoDeck();
    topEffects.push({
      name: "與牌庫頂牌同系",
      text: "你選擇自己黑骰或白骰點數+1",
    });
    log(`「${c.name}」與牌庫頂同為${c.faction}命格，牌庫頂移至棄牌區。`);
  }
  let finishTop = () =>
      topEffects.length ? runEffectSequence(topEffects, c) : null,
    finishEntry = () =>
      effect
        ? applyEffect(
            c.entry.effect,
            c,
            () =>
              c.entry.extraEffect && c.entry.extraCondition
                ? offerExtra(c, finishTop)
                : finishTop(),
            "進場效果",
          )
        : finishTop(),
    finishKeywords = () =>
      keywords.length ? runEffectSequence(keywords, c, finishEntry) : finishEntry(),
    finishEvent = () =>
      state.eventsEnabled !== false &&
      state.currentEvent?.participants.includes(c.id)
        ? applyEventRoleEffect(
            state.currentEvent,
            state.active,
            "在場效果",
            finishKeywords,
          )
        : finishKeywords();
  finishEvent();
  refill();
  render();
}
function play() {
  if (selected.zone !== "hand") return warn("尚未選牌", "請先選擇手牌。");
  put(false);
}
function pay(text, done, cancel, sourceCard) {
  let p = state.players[state.active],
    xs = exhaustSpec(text);
  if (xs)
    return chooseExhaustTargets(
      xs,
      "支付條件",
      () => pay(text.replace(xs.clause, ""), done, cancel, sourceCard),
      cancel,
    );
  let m = text.match(/(\d+)手/);
  if (m) {
    let n = +m[1],
      pool = p.hand
        .map((c, i) => ({ card: c, index: i }))
        .filter((x) => x.card !== sourceCard);
    if (pool.length < n) {
      cancel?.();
      return warn("條件不足", `需要 ${n} 張手牌。`);
    }
    return openChoice({
      title: `支付 ${n} 張手牌`,
      text: "選擇支付到中央區的手牌。",
      cards: pool,
      required: n,
      cancel: !!cancel,
      cancelAction: cancel,
      confirm: (picks) => {
        [...picks]
          .map((i) => pool[i].index)
          .sort((a, b) => b - a)
          .forEach((i) => state.center.push(...p.hand.splice(i, 1)));
        done();
      },
    });
  }
  let f = text.match(/(\d+)(幻|血|聖|技|詠)/);
  if (f) {
    let n = +f[1],
      fac = f[2],
      own = p.field
        .map((c, i) => ({ card: c, zone: "我方自身區", index: i }))
        .filter((x) => x.card.faction === fac),
      mid = state.center
        .map((c, i) => ({ card: c, zone: "中央區", index: i }))
        .filter((x) => x.card.faction === fac),
      pool = [...(own.length >= n ? own : []), ...(mid.length >= n ? mid : [])];
    $$("#activePlayer .card,#center .card").forEach((el) => {
      let c = D.cards.find((x) => x.id === +el.dataset.id);
      el.classList.add(c?.faction === fac ? "eligible" : "dimmed");
    });
    if (!pool.length) {
      cancel?.();
      return warn(
        "條件不足",
        `自身區或中央區需有 ${n} 張${fac}命格牌，不可跨區支付。`,
      );
    }
    return openChoice({
      title: `支付 ${n} 張${fac}命格牌`,
      text: "可從中央區或我方自身區支付；選第一張後，另一區的牌會變暗且無法選擇。",
      cards: pool,
      required: n,
      sameZone: true,
      cancel: !!cancel,
      cancelAction: cancel,
      confirm: (picks) => {
        [...picks]
          .map((i) => pool[i])
          .sort((a, b) => b.index - a.index)
          .forEach((x) =>
            state.discard.push(
              ...(x.zone === "我方自身區" ? p.field : state.center).splice(
                x.index,
                1,
              ),
            ),
          );
        done();
      },
    });
  }
  done();
}
function beginEntry(costIndex = 0) {
  let p = state.players[state.active],
    c = p.hand[selected.index],
    cost = c.entry.costs[costIndex] || "",
    snapshot = paymentSnapshot(),
    cancel = () => rollbackPayment(snapshot, true);
  pay(
    cost,
    () => {
      selected.index = p.hand.indexOf(c);
      if (selected.index < 0) {
        cancel();
        return warn("無法進場", "要打出的角色已不在手牌中。");
      }
      put(true);
    },
    cancel,
    c,
  );
}
function beginActivate() {
  let p = state.players[state.active],
    c = p.field[selected.index];
  if (c.exhausted) return warn("角色已橫置", "這張角色已啟動。");
  let snapshot = paymentSnapshot(),
    cancel = () => rollbackPayment(snapshot, false);
  pay(
    c.activate.cost || "",
    () => {
      c.exhausted = true;
      state.turnDidSomething = true;
      state.activationCount++;
      log(`${p.name} 啟動「${c.name}」。`);
      applyEffect(c.activate.effect, c, null, "啟動效果");
      refill();
      render();
    },
    cancel,
    c,
  );
}
function applyEffect(s, c, after, sourceName = c.name) {
  let owner = state.active,
    p = state.players[owner],
    done = [],
    ops = [],
    fixed = s || "";
  let leading = fixed.match(
    /^你(黑|白)骰(?:點數)?([+-])(\d+)[，,]\s*(?:然後)?\s*(.+)$/,
  );
  if (leading) {
    let key = leading[1] === "黑" ? "black" : "white",
      delta = (leading[2] === "+" ? 1 : -1) * +leading[3];
    setDie(owner, key, p[key] + delta, `「${c.name}」`);
    log(
      `「${c.name}」－${sourceName}：自動執行${leading[1]}骰${leading[2]}${leading[3]}。`,
    );
    let next = () => applyEffect(leading[4], c, after, sourceName);
    if (state.pendingBarrier) {
      queueEffectContinuation(next);
      return render();
    }
    render();
    return next();
  }
  let allBlack = fixed.match(/所有黑骰(?:點數)?(?:變成|調整為)(\d+)/);
  if (allBlack) {
    state.players.forEach((player, target) =>
      setDie(target, "black", +allBlack[1], `「${c.name}」－${sourceName}`),
    );
    log(
      `「${c.name}」－${sourceName}：所有玩家黑骰點數調整為 ${allBlack[1]}。`,
    );
    render();
    return applyEffect(
      fixed.replace(allBlack[0], ""),
      c,
      after,
      sourceName,
    );
  }
  let discardCenter = fixed.match(
    /(?:棄掉|棄置|移除)中央區(?:合計)?(\d+|[一二三四五])張?(?:角色|牌)/,
  );
  if (discardCenter) {
    let requested = +discardCenter[1] || cn[discardCenter[1]],
      required = Math.min(requested, state.center.length),
      rest = fixed.replace(discardCenter[0], "");
    if (!required)
      return applyEffect(rest, c, after, sourceName);
    let pool = state.center.map((card, index) => ({
      card,
      index,
      zone: "中央區",
    }));
    return openChoice({
      title: `「${c.name}」－${sourceName}`,
      text: `從中央區選擇 ${required} 張牌棄置。`,
      cards: pool,
      required,
      cancel: false,
      confirm: (picks) => {
        [...picks]
          .sort((a, b) => b - a)
          .forEach((i) => state.discard.push(...state.center.splice(i, 1)));
        log(`「${c.name}」－${sourceName}：棄置中央區 ${required} 張牌。`);
        refill();
        render();
        applyEffect(rest, c, after, sourceName);
      },
    });
  }
  let takeCenter = fixed.match(/從中央區選(?:擇)?1張牌(?:進|到|加入)(?:你)?手牌/);
  if (takeCenter)
    return chooseCenterCardToHand(
      c,
      () => applyEffect(fixed.replace(takeCenter[0], ""), c, after, sourceName),
      sourceName,
    );
  let extraPlay = fixed.match(/(?:你)?額外打出(?:一|1)張牌(?:，?並)?(?:且)?(?:橫置那張牌)?/);
  if (extraPlay) {
    let exhaustAfter = /橫置那張牌/.test(extraPlay[0]);
    return chooseExtraPlay(
      c,
      () => applyEffect(fixed.replace(extraPlay[0], ""), c, after, sourceName),
      sourceName,
      exhaustAfter,
    );
  }
  let move = fixed.match(/選擇中央區1張牌，?放入自身區或敵方自身區/);
  if (move)
    return chooseCardThenPlayer(
      c,
      () => applyEffect(fixed.replace(move[0], ""), c, after, sourceName),
      sourceName,
    );
  let reset = fixed.match(/(?:你)?選擇自身區或敵方自身區1個?角色重置/);
  if (reset)
    return chooseResetTarget(
      c,
      () => applyEffect(fixed.replace(reset[0], ""), c, after, sourceName),
      sourceName,
      reset[0],
    );
  let playerDice = fixed.match(
    /你選擇你或敵方，?選擇的人黑骰(?:點數)?([+-]\d+)，?白骰(?:點數)?([+-]\d+)/,
  );
  if (playerDice)
    return choosePlayerTarget(
      `「${c.name}」－${sourceName}`,
      "選擇承受此效果的玩家。",
      (target) => {
        for (let [key, value] of [
          ["black", +playerDice[1]],
          ["white", +playerDice[2]],
        ])
          setDie(
            target,
            key,
            state.players[target][key] + value,
            `「${c.name}」－${sourceName}`,
          );
        log(
          `「${c.name}」－${sourceName}：指定 ${state.players[target].name}，黑骰${playerDice[1]}、白骰${playerDice[2]}。`,
        );
        render();
        applyEffect(fixed.replace(playerDice[0], ""), c, after, sourceName);
      },
      targetPlayersFor(playerDice[0], owner),
    );
  let discardPlayer = fixed.match(
    /(?:你)?選擇你或敵方(?:玩家)?，?棄(\d+)張手牌(?:到中央區)?/,
  );
  if (discardPlayer)
    return choosePlayerTarget(
      `「${c.name}」－${sourceName}`,
      `選擇棄 ${discardPlayer[1]} 張手牌的玩家。`,
      (target) => {
        let tp = state.players[target],
          n = Math.min(+discardPlayer[1], tp.hand.length);
        if (!n) {
          render();
          return applyEffect(
            fixed.replace(discardPlayer[0], ""),
            c,
            after,
            sourceName,
          );
        }
        openChoice({
          title: `「${c.name}」－${sourceName}：${tp.name} 選擇棄牌`,
          text: `選擇 ${n} 張手牌棄到中央區。`,
          cards: tp.hand.map((card) => ({ card })),
          required: n,
          cancel: false,
          confirm: (picks) => {
            [...picks]
              .sort((a, b) => b - a)
              .forEach((i) => state.center.push(...tp.hand.splice(i, 1)));
            render();
            applyEffect(
              fixed.replace(discardPlayer[0], ""),
              c,
              after,
              sourceName,
            );
          },
        });
      },
      targetPlayersFor(discardPlayer[0], owner),
    );
  let xs = exhaustSpec(fixed),
    op = (v, t, owners = state.players.map((_, i) => i)) =>
      v.startsWith("+") || v.startsWith("-")
        ? { type: "delta", value: +v, targets: t, owners }
        : { type: "set", value: +v.match(/\d+/)[0], targets: t, owners };
  if (xs) {
    xs.owner = owner;
    state.pendingExhaust = {
      spec: xs,
      title: `「${c.name}」－${sourceName}`,
    };
    fixed = fixed.replace(xs.clause, "");
  }
  let own = fixed.match(
    /你(?:選擇)?(?:自己)?黑骰(?:點數)?([+-]\d+)或白骰(?:點數)?\1|你(?:選擇)?(?:自己)?黑骰或白骰(?:點數)?([+-]\d+|調整為\d+|變成\d+)/,
  );
  if (own) {
    let v = own[1] || own[2];
    ops.push(op(v, "self", [owner]));
    fixed = fixed.replace(own[0], "");
  }
  let eitherSideColor = fixed.match(
    /你選擇你或敵方，?黑骰(?:點數)?([+-]\d+)或白骰(?:點數)?\1/,
  );
  if (eitherSideColor) {
    ops.push(op(eitherSideColor[1], "all", targetPlayersFor(eitherSideColor[0], owner)));
    fixed = fixed.replace(eitherSideColor[0], "");
  }
  for (let m of [...fixed.matchAll(
    /(?:任意|任|選擇)[1一]?顆?個?骰(?:子)?(?:點數)?([+-]\d+|調整為\d+|變成\d+)/g,
  )]) {
    ops.push(op(m[1], "all"));
    fixed = fixed.replace(m[0], "");
  }
  for (let m of [...fixed.matchAll(
    /你選擇你或敵方(?:任意)?[1一]個骰，?骰?點數?([+-]\d+|調整為\d+|變成\d+)/g,
  )]) {
    ops.push(op(m[1], "all", targetPlayersFor(m[0], owner)));
    fixed = fixed.replace(m[0], "");
  }
  for (let m of [...fixed.matchAll(
    /你選擇你或敵方，?(黑|白)骰(?:點數)?([+-]\d+|調整為\d+|變成\d+)/g,
  )]) {
    ops.push(op(m[2], m[1] === "黑" ? "black" : "white", targetPlayersFor(m[0], owner)));
    fixed = fixed.replace(m[0], "");
  }
  let all = fixed.match(/所有大於(\d+)的骰(?:點數)?([+-])(\d+)/);
  if (all) {
    for (let x of state.players)
      for (let k of ["black", "white"])
        if (x[k] > +all[1])
          setDie(
            state.players.indexOf(x),
            k,
            x[k] + (all[2] === "+" ? 1 : -1) * +all[3],
            `「${c.name}」`,
          );
    done.push(all[0]);
    fixed = fixed.replace(all[0], "");
  }
  for (let [ch, k] of [
    ["黑", "black"],
    ["白", "white"],
  ]) {
    let m = fixed.match(new RegExp(`你?${ch}骰(?:點數)?([+-])(\\d+)`));
    if (m) {
      setDie(owner, k, p[k] + (m[1] == "+" ? 1 : -1) * +m[2], `「${c.name}」`);
      done.push(`${ch}骰${m[1]}${m[2]}`);
      fixed = fixed.replace(m[0], "");
    }
  }
  let d = fixed.match(/抽(\d+)張?牌/);
  if (d) {
    draw(p, +d[1]);
    done.push(`抽${d[1]}張牌`);
    fixed = fixed.replace(d[0], "");
  }
  if (done.length)
    log(`「${c.name}」－${sourceName}：自動執行${done.join("、")}。`);
  let residual = fixed.replace(/^[，,、。；;\s]+|[，,、。；;\s]+$/g, ""),
    asynchronous = xs || ops.length || state.pendingBarrier;
  if (asynchronous && (residual || after))
    queueEffectContinuation(() =>
      residual ? applyEffect(residual, c, after, sourceName) : after?.(),
    );
  if (ops.length) {
    state.pendingDice = {
      card: c.name,
      sourceName,
      ops,
      chosen: null,
      owner,
    };
    log(`「${c.name}」等待${p.name}選擇骰子。`);
  } else if (!done.length && !xs && residual.length)
    choosePlayerTarget(
      `${c.name}－${sourceName}：選擇目標`,
      `${residual}｜請直接選擇效果目標，不需要再按確定。`,
      (target) => {
        log(`「${c.name}」選擇 ${state.players[target].name} 作為效果目標。`);
        render();
        after?.();
      },
      targetPlayersFor(residual, owner),
    );
  else if (!xs && !state.pendingBarrier && !ops.length) {
    if (residual) applyEffect(residual, c, after, sourceName);
    else after?.();
  }
}
function continueEffectFlow() {
  state.effectContinuationOpening = false;
  if (
    state.pendingDice ||
    state.pendingExhaust ||
    state.pendingBarrier ||
    state.pendingSaintRemoval
  )
    return render();
  let next = effectContinuations.shift();
  if (next) next();
}
function offerExtra(c, after = null) {
  state.pendingExtra = c;
  extraContinuation = after;
  showExtraChoice();
}
function showExtraChoice() {
  let c = state.pendingExtra;
  if (!c) return;
  $("#actions").innerHTML =
    `<span class="mode-note">${esc(c.name)}追加條件：${esc(c.entry.extraCondition || "符合追加條件")}</span><button data-act="extraPay" class="primary skill-action">追加：${esc(c.entry.extraEffect)}</button><button data-act="extraSkip" class="ghost">不追加</button>`;
  bindActions();
}
function extraSkip() {
  let c = state.pendingExtra;
  if (c) log(`「${c.name}」不發動追加效果。`);
  state.pendingExtra = null;
  render();
  let next = extraContinuation;
  extraContinuation = null;
  next?.();
}
function extraPay() {
  let c = state.pendingExtra;
  if (!c) return;
  let condition = c.entry.extraCondition || "",
    snapshot = paymentSnapshot(),
    cancel = () => {
      state.pendingExtra = c;
      rollbackPayment(snapshot, false);
    };
  pay(
    condition,
    () => {
      state.pendingExtra = null;
      if (condition.includes("橫置這張牌")) c.exhausted = true;
      log(
        `「${c.name}」支付／符合追加條件：${condition || "無"}，發動追加效果。`,
      );
      let next = extraContinuation;
      extraContinuation = null;
      applyEffect(c.entry.extraEffect, c, next, "追加效果");
      render();
    },
    cancel,
    c,
  );
}
function diceSummary(owner, label) {
  let p = state.players[owner];
  return `${label}（黑 ${p.black}／白 ${p.white}）`;
}
function showDiceChoice() {
  let q = state.pendingDice,
    op = q.ops[0],
    label =
      op.type === "delta"
        ? op.value > 0
          ? `+${op.value}`
          : `${op.value}`
        : `調整為 ${op.value}`,
    needsSide = op.targets !== "self";
  $$("[data-die-owner]").forEach((d) => {
    let owner = +d.dataset.dieOwner,
      allowed =
        op.owners.includes(owner) &&
        (!needsSide || (q.side !== null && q.side !== undefined)) &&
        (!needsSide || owner === q.side) &&
        (op.targets === "all" ||
          (op.targets === "self" && owner === q.owner) ||
          op.targets === d.dataset.dieKey);
    d.classList.toggle("die-option", allowed);
    d.classList.toggle("eligible", allowed);
    d.classList.toggle("dimmed", !allowed);
    d.onclick = allowed ? () => selectDie(d) : null;
  });
  let target =
      op.targets === "all"
        ? "選擇任意一顆骰子"
        : op.targets === "self"
          ? `由 ${state.players[q.owner].name} 選擇自己的黑骰或白骰`
          : `選擇你或敵方${op.targets === "black" ? "黑" : "白"}骰`,
    sideButtons = needsSide
      ? `<div class="side-choice">${state.players.map((_, i) => i).filter((i) => op.owners.includes(i)).map((i) => `<button data-side="${i}" class="${q.side === i ? "primary" : ""}">${diceSummary(i, i === q.owner ? "自己" : teamLabel(i))}</button>`).join("")}</div>`
      : "";
  let sourceText =
    q.sourceName === "與牌庫頂牌同系"
      ? "與牌庫頂牌同系，由玩家選擇一顆黑骰或白骰"
      : `「${q.card}」－${q.sourceName || "技能效果"}：${target}`;
  $("#actions").innerHTML =
    `<span class="mode-note">${esc(sourceText)} ${label}</span>${sideButtons}<button id="confirmDie" class="primary" ${q.chosen ? "" : "disabled"}>確認執行</button>`;
  $$("[data-side]").forEach(
    (b) =>
      (b.onclick = () => {
        q.side = +b.dataset.side;
        q.chosen = null;
        showDiceChoice();
      }),
  );
  $("#confirmDie").onclick = confirmDie;
}
function selectDie(el) {
  let q = state.pendingDice;
  q.chosen = { owner: +el.dataset.dieOwner, key: el.dataset.dieKey };
  $$("[data-die-owner]").forEach((d) => {
    let on = d === el;
    d.classList.toggle("die-chosen", on);
    d.classList.toggle("dimmed", !on);
    d.classList.toggle("eligible", on);
  });
  $("#confirmDie").disabled = false;
}
function confirmDie() {
  let q = state.pendingDice;
  if (!q.chosen) return;
  let op = q.ops.shift(),
    p = state.players[q.chosen.owner],
    old = p[q.chosen.key];
  setDie(
    q.chosen.owner,
    q.chosen.key,
    op.type === "delta" ? old + op.value : op.value,
    q.card,
  );
  if (q.ops.length) {
    q.chosen = null;
    q.side = null;
    render();
  } else {
    state.pendingDice = null;
    render();
  }
}
function hasEventRole(p, e) {
  return p.field.some((c) => e.participants.includes(c.id));
}
function draw(p, n) {
  for (let i = 0; i < n; i++) {
    if (!state.deck.length && !recycleDiscardIntoDeck()) break;
    p.hand.push(state.deck.pop());
    recycleDiscardIntoDeck();
  }
}
function queueDiscards(items) {
  state.eventDiscardQueue = [
    ...(state.eventDiscardQueue || []),
    ...items.filter((x) => x.count > 0),
  ];
  if (!state.eventDiscardBusy) {
    state.eventDiscardBusy = true;
    setTimeout(nextEventDiscard);
  }
}
function nextEventDiscard() {
  let q = state.eventDiscardQueue;
  if (!q?.length) {
    state.eventDiscardBusy = false;
    return;
  }
  let job = q.shift(),
    p = state.players[job.player],
    n = Math.min(job.count, p.hand.length);
  if (!n) return nextEventDiscard();
  openChoice({
    title: `${job.reason}：${p.name} 選擇棄牌`,
    text: `請選擇 ${n} 張手牌棄到中央區。`,
    cards: p.hand.map((c) => ({ card: c })),
    required: n,
    cancel: false,
    confirm: (picks) => {
      [...picks]
        .sort((a, b) => b - a)
        .forEach((i) => state.center.push(...p.hand.splice(i, 1)));
      render();
      nextEventDiscard();
    },
  });
}
function applyEventRoleEffect(e, owner, phase, done = null) {
  let p = state.players[owner],
    source = `事件「${e.name}」${phase}`,
    delta = (key, n) => setDie(owner, key, p[key] + n, source);
  if (["劍意末路", "紅蓮叛亂"].includes(e.name)) delta("black", 1);
  else if (["神子創臨", "女武神計畫"].includes(e.name)) delta("white", 1);
  else if (e.name === "圓桌統合") delta("black", -1);
  else if (e.name === "精靈解放") delta("white", -1);
  else if (e.name === "黑衣聖教") {
    draw(p, 1);
    log(`${source}：${p.name}抽 1 張牌。`);
  } else if (e.name === "巫女暴走") {
    for (let key of ["black", "white"])
      if (p[key] > 2) delta(key, -1);
  } else if (e.name === "賢者之書") {
    for (let key of ["black", "white"])
      if (p[key] < 3) delta(key, 1);
  } else if (e.name === "御神之亂") {
    if (!p.hand.length) {
      log(`${source}：${p.name}沒有手牌可棄。`);
      render();
      return done?.();
    }
    return openChoice({
      title: source,
      text: `${p.name}：選擇 1 張手牌棄到中央區。`,
      cards: p.hand.map((card) => ({ card, zone: `${p.name}手牌` })),
      required: 1,
      cancel: false,
      confirm: (picks) => {
        let i = [...picks][0];
        state.center.push(...p.hand.splice(i, 1));
        log(`${source}：${p.name}棄 1 張手牌。`);
        refill();
        render();
        done?.();
      },
    });
  }
  render();
  done?.();
}
function applyEventEnter(e, done = null) {
  let owners = state.players
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => hasEventRole(p, e))
      .map(({ i }) => i),
    next = () => {
      let owner = owners.shift();
      if (owner === undefined) {
        log(`「${e.name}」進場效果已結算。`);
        render();
        return done?.();
      }
      applyEventRoleEffect(e, owner, "進場效果", next);
    };
  next();
}
function applyEventLeave(e) {
  state.players.forEach((p) => {
    let removed = p.field.filter((c) => e.participants.includes(c.id));
    p.field = p.field.filter((c) => !e.participants.includes(c.id));
    state.discard.push(...removed);
  });
  log(`「${e.name}」離場，對應角色已移除。`);
}
function revealEvent() {
  if (state.eventsEnabled === false || !state.events.length) return;
  let e = state.events.pop();
  state.eventReady.push(e);
  log(`購買後翻開事件「${e.name}」（${state.eventReady.length}/4）。`);
  render();
  if (state.eventReady.length === 4)
    setTimeout(() =>
      openChoice({
        title: "四張事件：選擇一張進場",
        text: "選定事件會進場，其餘三張永久丟棄。",
        cards: state.eventReady.map((card) => ({ card })),
        required: 1,
        cancel: false,
        event: true,
        confirm: (picks) => resolveEvent([...picks][0]),
      }),
    );
}
function resolveEvent(index) {
  let chosen = state.eventReady[index],
    others = state.eventReady.filter((_, i) => i !== index);
  if (state.currentEvent) {
    applyEventLeave(state.currentEvent);
    state.eventDiscard.push(state.currentEvent);
  }
  state.eventDiscard.push(...others);
  state.eventReady = [];
  state.currentEvent = chosen;
  state.currentEventOwner = state.active;
  log(
    `${state.players[state.active].name} 選擇「${chosen.name}」進場，其他三張事件丟棄。`,
  );
  applyEventEnter(chosen);
}
function applyBuy(ix) {
  let p = state.players[state.active],
    got = ix.sort((a, b) => b - a).map((i) => state.center.splice(i, 1)[0]);
  p.hand.push(...got.reverse());
  state.turnDidSomething = true;
  let n = 2 + p.scores.length,
    d = 0;
  for (let c of p.field)
    if (c.exhausted && d < n) {
      resetCard(c, state.active, "購買／重置");
      d++;
    }
  log(`${p.name} 購買 ${got.length} 張牌並重置 ${d} 名角色。`);
  refill();
  render();
  if (state.eventsEnabled !== false) revealEvent();
}
function buy() {
  if (state.turnAction)
    return warn(
      "本回合已選擇行動",
      "打牌、購買、啟動三種主要行動只能選擇一種。",
    );
  let p = state.players[state.active];
  if (p.hand.length >= 5) return warn("無法購買", "手牌已達上限。");
  state.turnAction = "buy";
  let required = Math.min(4, state.center.length);
  if (state.center.length === required)
    return applyBuy(state.center.map((_, i) => i));
  openChoice({
    title: "選擇購買卡牌",
    text: `請從中央區選擇 ${required} 張加入手牌。`,
    cards: state.center.map((c) => ({ card: c })),
    required,
    cancelAction: () => {
      state.turnAction = null;
      render();
    },
    confirm: (p) => applyBuy([...p]),
  });
}
function victoryResult() {
  if (state.players.length === 2) {
    let winner = state.players.findIndex((p) => p.scores.length >= 4);
    if (winner >= 0)
      return {
        key: `player-${winner}-${state.round}`,
        message: `${state.players[winner].name} 完成四次紀行，獲得勝利！`,
      };
    return null;
  }
  for (let team = 0; team < 2; team++) {
    let members = state.players.filter((_, i) => i % 2 === team),
      total = members.reduce((sum, p) => sum + p.scores.length, 0);
    if (members.length === 2 && total >= 5 && members.every((p) => p.scores.length >= 1))
      return {
        key: `team-${team}-${state.round}`,
        message: `${team === 0 ? "紅方" : "藍方"}兩位玩家皆已完成紀行，合計 ${total} 分，獲得勝利！`,
      };
  }
  return null;
}
function showGameOver() {
  if (!state.gameOver || dismissedGameOverKey === state.gameOver.key) return;
  let overlay = $("#gameOver");
  if (!overlay) {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="gameOver" class="overlay hidden"><div class="panel game-over-panel"><p class="eyebrow">紀行完成</p><h2 id="gameOverTitle"></h2><div class="game-over-actions"><button id="gameRematch" class="primary">A. 重來一局</button><button id="gameHome">B. 回到主頁面</button><button id="gameStay" class="ghost">C. 停留在目前頁面</button></div></div></div>',
    );
    overlay = $("#gameOver");
  }
  $("#gameOverTitle").textContent = state.gameOver.message;
  overlay.classList.remove("hidden");
  $("#gameRematch").onclick = () => newGame();
  $("#gameHome").onclick = () => (location.href = "../");
  $("#gameStay").onclick = () => {
    dismissedGameOverKey = state.gameOver.key;
    overlay.classList.add("hidden");
  };
}
function endGame(result) {
  if (!result || state.gameOver) return;
  state.gameOver = result;
  state.pendingDice = null;
  state.pendingExhaust = null;
  state.pendingExtra = null;
  state.pendingBarrier = null;
  state.pendingSaintRemoval = null;
  effectContinuations = [];
  choice = null;
  $("#choice").classList.add("hidden");
  log(result.message);
  render();
}
function score() {
  let p = state.players[state.active],
    both = p.black === 6 && p.white === 6,
    n = both ? 2 : p.black === 6 || p.white === 6 ? 1 : 0;
  if (!n || p.field.length < n)
    return warn("尚不能計分", "需要骰點 6 且有足夠角色。");
  for (let i = 0; i < n; i++) p.scores.push(p.field.shift());
  if (both) {
    setDie(state.active, "black", 2, "計分");
    setDie(state.active, "white", 2, "計分");
  } else if (p.black === 6) setDie(state.active, "black", 1, "計分");
  else setDie(state.active, "white", 1, "計分");
  log(`${p.name} 完成 ${n} 次紀行。`);
  let result = victoryResult();
  if (result) endGame(result);
  else render();
}
function finish() {
  if (state.gameOver) return showGameOver();
  state.active = (state.active + 1) % state.players.length;
  state.round++;
  state.turnAction = null;
  state.turnDidSomething = false;
  state.activationCount = 0;
  render();
  if (onlineSeat === null) {
    $("#passName").textContent = state.players[state.active].name;
    $("#pass").classList.remove("hidden");
  }
}
function end() {
  if (effectBusy()) {
    // 不顯示阻斷式警告，直接回到目前或下一個待結算效果。
    if (
      effectContinuations.length &&
      !state.pendingDice &&
      !state.pendingExhaust &&
      !state.pendingBarrier &&
      !state.pendingSaintRemoval
    )
      continueEffectFlow();
    else render();
    return;
  }
  if (!state.turnDidSomething)
    return warn(
      "尚未完成主要行動",
      "每回合必須選擇打牌進場、購買＆重置或至少啟動一名角色，不能直接結束回合。",
    );
  let p = state.players[state.active],
    limit = handLimit(p),
    n = p.hand.length - limit;
  if (n <= 0) return finish();
  openChoice({
    title: "回合結束：選擇棄牌",
    text: `目前手牌上限 ${limit}，請自行選擇 ${n} 張棄至中央區。`,
    cards: p.hand.map((c) => ({ card: c })),
    required: n,
    cancel: false,
    confirm: (x) => {
      [...x]
        .sort((a, b) => b - a)
        .forEach((i) => state.center.push(...p.hand.splice(i, 1)));
      finish();
    },
  });
}
$("#choiceConfirm").onclick = () => {
  let c = choice,
    p = c.picks;
  $("#choice").classList.add("hidden");
  c.confirm(p);
};
$("#choiceCancel").onclick = () => {
  let c = choice;
  $("#choice").classList.add("hidden");
  c.cancelAction?.();
};
$("#newGame").onclick = newGame;
$("#restart").onclick = () => location.reload();
$("#reveal").onclick = () => $("#pass").classList.add("hidden");
$("#modalClose").onclick = () => {
  let next = modalContinue;
  modalContinue = null;
  $("#modal").classList.add("hidden");
  next?.();
};
$("#cardPreview").onclick = (e) => {
  if (previewIgnoreNextClick) {
    previewIgnoreNextClick = false;
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  hidePreview();
};
$("#previewClose").onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  previewIgnoreNextClick = false;
  hidePreview();
};
document.addEventListener(
  "click",
  (e) => {
    if (
      !matchMedia("(hover: none)").matches ||
      $("#cardPreview").classList.contains("hidden")
    )
      return;
    if (previewIgnoreNextClick) {
      previewIgnoreNextClick = false;
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    hidePreview();
  },
  true,
);
document.addEventListener("mousedown", (e) => {
  if (
    previewPinned &&
    !e.target.closest(".card") &&
    !e.target.closest("#cardPreview")
  )
    hidePreview();
});
