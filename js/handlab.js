'use strict';
/* Hand Lab: enter hands from real sessions on an arena-style table, then replay them
 * with pot odds, equities and stats at every point, and grade each decision. */

const LAB_TYPES = [['UNKNOWN', 'Unknown'], ...PROFILE_KEYS.map(k => [k, PROFILES[k].label])];

/* =====================================================================
 * Engine: deterministic state machine driven by entered events.
 * Events: { t: 'a', type: 'fold'|'check'|'call'|'raise', amount } | { t: 'b', cards: [...] }
 * ===================================================================== */
const LabEngine = {
  clone: o => JSON.parse(JSON.stringify(o)),
  canAct: p => !p.folded && !p.allIn,
  pot: st => st.players.reduce((s, p) => s + p.contrib, 0),
  next: (st, i) => (i + 1) % st.n,

  create(setup) {
    const n = setup.players.length;
    const layout = POSITION_LAYOUTS[n];
    const k = layout.indexOf(setup.heroPos);
    const dealer = (n - k) % n;
    const st = {
      n, sb: setup.sb, bb: setup.bb, dealer, board: [], street: 0, currentBet: 0, minRaise: setup.bb,
      raiseLevel: 0, actions: [], need: 0, done: null, toAct: -1,
      players: setup.players.map((p, i) => ({
        id: i, name: p.name, isHero: i === 0,
        profile: p.type && p.type !== 'UNKNOWN' ? p.type : 'REG', typeKnown: !!p.type && p.type !== 'UNKNOWN',
        cards: p.cards && p.cards.length === 2 ? p.cards.slice() : null,
        stack: p.stack, startStack: p.stack, bet: 0, contrib: 0,
        folded: false, allIn: false, acted: false, position: layout[(i - dealer + n) % n], lastAction: '',
      })),
    };
    const sbIdx = n === 2 ? dealer : (dealer + 1) % n;
    const bbIdx = (sbIdx + 1) % n;
    this.post(st, st.players[sbIdx], st.sb, 'SB');
    this.post(st, st.players[bbIdx], st.bb, 'BB');
    st.currentBet = st.bb;
    st.toAct = (bbIdx + 1) % n;
    this.advance(st);
    return st;
  },

  post(st, p, amt, label) {
    const a = Math.min(amt, p.stack);
    this.put(p, a);
    p.lastAction = `${label} ${a}`;
  },

  put(p, amt) {
    p.stack = +(p.stack - amt).toFixed(2);
    p.bet = +(p.bet + amt).toFixed(2);
    p.contrib = +(p.contrib + amt).toFixed(2);
    if (p.stack <= 0) { p.stack = 0; p.allIn = true; }
  },

  ctx(st, p) {
    const toCall = Math.min(st.currentBet - p.bet, p.stack);
    const maxRaiseTo = +(p.bet + p.stack).toFixed(2);
    const othersCanAct = st.players.some(o => o !== p && this.canAct(o));
    return {
      toCall, pot: this.pot(st), maxRaiseTo,
      minRaiseTo: Math.min(st.currentBet + st.minRaise, maxRaiseTo),
      canRaise: maxRaiseTo > st.currentBet && othersCanAct,
    };
  },

  roundComplete(st) {
    const actors = st.players.filter(p => this.canAct(p));
    if (actors.every(p => p.acted && p.bet === st.currentBet)) return true;
    return actors.length <= 1 && actors.every(p => p.bet >= st.currentBet);
  },

  advance(st) {
    if (st.players.filter(p => !p.folded).length === 1) { st.done = 'uncontested'; st.toAct = -1; return; }
    if (this.roundComplete(st)) {
      st.toAct = -1;
      if (st.street === 3) st.done = 'showdown';
      else st.need = st.street === 0 ? 3 : 1;
      return;
    }
    for (let g = 0; g < st.n; g++) {
      const p = st.players[st.toAct];
      if (this.canAct(p) && (!p.acted || p.bet < st.currentBet)) return;
      st.toAct = this.next(st, st.toAct);
    }
  },

  act(st, type, amount) {
    if (st.done || st.need || st.toAct < 0) return 'No action is pending.';
    const p = st.players[st.toAct];
    const c = this.ctx(st, p);
    if (type === 'check' && c.toCall > 0) return `${p.name} can't check facing a bet.`;
    if (type === 'call' && c.toCall === 0) type = 'check';
    if (type === 'raise' && !c.canRaise) return `${p.name} can't raise here.`;
    const snap = {
      pid: p.id, street: st.street, board: st.board.slice(), pot: c.pot, toCall: c.toCall,
      currentBet: st.currentBet, betBefore: p.bet, stackBefore: p.stack, minRaiseTo: c.minRaiseTo,
      maxRaiseTo: c.maxRaiseTo, canRaise: c.canRaise, raiseLevel: st.raiseLevel,
      live: st.players.filter(o => !o.folded).map(o => o.id),
      stacks: Object.fromEntries(st.players.map(o => [o.id, o.stack])),
    };
    if (type === 'fold') {
      p.folded = true; p.lastAction = 'Fold';
    } else if (type === 'check') {
      p.lastAction = 'Check';
    } else if (type === 'call') {
      this.put(p, c.toCall); p.lastAction = `Call ${p.bet}`;
    } else if (type === 'raise') {
      const target = +Math.min(Math.max(+amount || 0, c.minRaiseTo), c.maxRaiseTo).toFixed(2);
      const size = target - st.currentBet;
      const isBet = st.currentBet === 0;
      this.put(p, +(target - p.bet).toFixed(2));
      if (size >= st.minRaise) st.minRaise = size;
      st.currentBet = Math.max(st.currentBet, p.bet);
      st.raiseLevel++;
      for (const o of st.players) if (o !== p && this.canAct(o)) o.acted = false;
      p.lastAction = `${p.allIn ? 'All-in' : isBet ? 'Bet' : 'Raise'} ${p.bet}`;
    } else return 'Unknown action.';
    p.acted = true;
    Object.assign(snap, { type, amount: p.bet, added: +(snap.stackBefore - p.stack).toFixed(2), allIn: p.allIn });
    st.actions.push(snap);
    st.toAct = this.next(st, st.players.indexOf(p));
    this.advance(st);
    return null;
  },

  usedCards(st) {
    const used = new Set(st.board);
    for (const p of st.players) if (p.cards) p.cards.forEach(c => used.add(c));
    return used;
  },

  deal(st, cards) {
    if (!st.need) return 'No board cards are needed right now.';
    if (cards.length !== st.need) return `Pick exactly ${st.need} card${st.need > 1 ? 's' : ''}.`;
    const used = this.usedCards(st);
    if (cards.some(c => used.has(c)) || new Set(cards).size !== cards.length) return 'That card is already in use.';
    st.board.push(...cards);
    st.street++;
    for (const p of st.players) { p.bet = 0; p.acted = false; if (!p.folded && !p.allIn) p.lastAction = ''; }
    st.currentBet = 0; st.minRaise = st.bb; st.raiseLevel = 0; st.need = 0;
    if (st.players.filter(p => this.canAct(p)).length <= 1) {
      if (st.street === 3) st.done = 'showdown'; else st.need = 1;
      return null;
    }
    st.toAct = this.next(st, st.dealer);
    this.advance(st);
    return null;
  },

  apply(st, ev) {
    return ev.t === 'b' ? this.deal(st, ev.cards) : this.act(st, ev.type, ev.amount);
  },

  /** Replays events; frames[i] = state after i events (frames[0] = after blinds). */
  replay(setup, events) {
    const st = this.create(setup);
    const frames = [this.clone(st)];
    for (let i = 0; i < events.length; i++) {
      const err = this.apply(st, events[i]);
      if (err) return { st, frames, error: err, applied: i };
      frames.push(this.clone(st));
    }
    return { st, frames, error: null, applied: events.length };
  },

  /** Final result: winners and amounts (null when hole cards needed for showdown are unknown). */
  result(st) {
    if (!st.done) return null;
    const players = this.clone(st.players);
    const sorted = players.slice().sort((a, b) => b.contrib - a.contrib);
    if (sorted[1] && sorted[0].contrib > sorted[1].contrib) {
      const diff = sorted[0].contrib - sorted[1].contrib;
      sorted[0].contrib -= diff;
      sorted[0].stack += diff;
    }
    const live = players.filter(p => !p.folded);
    const pot = players.reduce((s, p) => s + p.contrib, 0);
    if (live.length === 1) return { winners: [{ id: live[0].id, amount: pot, hand: '' }], players };
    if (st.board.length < 5 || live.some(p => !p.cards)) return { unknown: true, players, pot };
    const scores = new Map(live.map(p => [p.id, evaluateHand([...p.cards, ...st.board])]));
    const levels = [...new Set(players.map(p => p.contrib).filter(c => c > 0))].sort((a, b) => a - b);
    const won = new Map();
    let prev = 0, carry = 0;
    for (const level of levels) {
      let amount = carry;
      for (const p of players) amount += Math.max(0, Math.min(p.contrib, level) - prev);
      prev = level;
      const elig = live.filter(p => p.contrib >= level);
      if (!elig.length) { carry = amount; continue; }
      carry = 0;
      const best = Math.max(...elig.map(p => scores.get(p.id)));
      const ws = elig.filter(p => scores.get(p.id) === best);
      for (const w of ws) won.set(w.id, (won.get(w.id) || 0) + amount / ws.length);
    }
    return {
      winners: [...won].map(([id, amount]) => ({ id, amount: +amount.toFixed(2), hand: describeHand(scores.get(id)) })),
      players, scores,
    };
  },

  /** History in the same shape the arena's Hand Review uses, from one player's perspective. */
  history(st, perspectiveId) {
    return {
      handNum: 0, sb: st.sb, bb: st.bb, dealer: st.dealer,
      players: st.players.map(p => ({
        id: p.id, name: p.name, isHero: p.id === perspectiveId, profile: p.profile,
        position: p.position, cards: p.cards, startStack: p.startStack,
      })),
      actions: st.actions, board: st.board.slice(), runout: [], tells: [], results: [],
      showdown: st.done === 'showdown',
    };
  },
};

/* =====================================================================
 * UI
 * ===================================================================== */
const HandLab = {
  KEY: 'nlh.lab.hands',
  mode: 'setup', // setup | enter | replay
  setup: null,
  events: [],
  frame: 0,
  evals: null,
  pickTarget: null,
  boardPick: [],
  savedId: null,
  eqCache: {},

  init() {
    this.root = $('#spots-lab');
    this.root.innerHTML = this.template();
    this.draft = Store.get('nlh.lab.draft', null) || this.defaultDraft(6);
    this.bind();
    this.renderSetup();
    this.renderSaved();
    this.setMode('setup');
    new ResizeObserver(() => this.layoutSeats()).observe($('#lab-table'));
  },

  defaultDraft(n) {
    const layout = POSITION_LAYOUTS[n];
    return { n, sb: 1, bb: 2, stackBB: 100, heroPos: layout.includes('BTN') ? 'BTN' : layout[0], seats: {} };
  },

  template() {
    return `
      <div class="lab-intro panel note">
        <b>Hand Lab</b> — rebuild hands from your real sessions. Set the table, enter your hand and any cards you saw (at showdown or otherwise),
        then play the action in with the same buttons as the Practice Arena. Afterwards, step through every point of the hand with pot odds,
        equities and stats, and get each decision graded.
      </div>
      <div class="arena-layout">
        <div class="arena-main">
          <div class="arena-toolbar">
            <div class="toolbar-info" id="lab-info"></div>
            <div class="btn-row">
              <button class="btn btn-sm" id="lab-example">Load example</button>
              <button class="btn btn-sm" id="lab-new">New hand</button>
              <button class="btn btn-sm btn-primary" id="lab-save" hidden>Save hand</button>
            </div>
          </div>

          <div class="panel lab-setup" id="lab-setup">
            <div class="setup-grid">
              <label class="lab-players">Players at the table <b id="lab-n-val"></b>
                <input type="range" id="lab-n" min="2" max="9" step="1">
              </label>
              <label>Small blind ($)<input type="number" id="lab-sb" min="0" step="0.5"></label>
              <label>Big blind ($)<input type="number" id="lab-bb" min="0.5" step="0.5"></label>
              <label>Default stack (bb)<input type="number" id="lab-stack" min="1" step="1"></label>
              <label>Your position<select id="lab-heropos"></select></label>
            </div>
            <h4>Players &amp; cards <span class="hint">— click a card box, then pick cards below or type them (e.g. <code>AhKd</code>). Leave cards blank if unknown.</span></h4>
            <div class="lab-seat-rows" id="lab-seats"></div>
            <div class="lab-picker-wrap"><span class="label" id="lab-picker-label">Card picker</span><div class="card-picker" id="lab-picker"></div></div>
            <div class="btn-row"><button class="btn btn-primary" id="lab-start">Start entering the action →</button><span class="bad" id="lab-setup-err"></span></div>
          </div>

          <div class="table-wrap">
            <div class="poker-table" id="lab-table">
              <div class="felt">
                <div class="felt-logo">HAND LAB</div>
                <div class="pot" id="lab-pot"></div>
                <div class="board" id="lab-board"></div>
                <div class="table-msg" id="lab-msg"></div>
              </div>
              <div id="lab-seat-layer"></div>
            </div>
          </div>

          <div class="action-bar" id="lab-actionbar" hidden>
            <div class="action-info" id="lab-action-info"></div>
            <div class="sizing" id="lab-sizing">
              <div class="size-presets" id="lab-presets"></div>
              <div class="size-input">
                <input type="range" id="lab-raise-slider" min="0" max="100" step="1">
                <input type="number" id="lab-raise-input" min="0" step="0.5">
              </div>
            </div>
            <div class="action-buttons">
              <button class="btn act act-fold" id="lab-fold">Fold</button>
              <button class="btn act act-call" id="lab-call">Check</button>
              <button class="btn act act-raise" id="lab-raise">Raise</button>
              <button class="btn" id="lab-undo">↶ Undo</button>
              <button class="btn btn-primary" id="lab-to-replay" hidden>▶ Replay &amp; analyze</button>
            </div>
          </div>

          <div class="action-bar lab-boardbar" id="lab-boardbar" hidden>
            <div class="action-info" id="lab-board-info"></div>
            <div class="lab-board-pick" id="lab-board-pick"></div>
            <div class="action-buttons">
              <button class="btn" id="lab-board-random" title="Fill with random unused cards">Random</button>
              <button class="btn act act-call" id="lab-board-deal">Deal</button>
              <button class="btn" id="lab-board-undo">↶ Undo</button>
            </div>
            <div class="card-picker" id="lab-board-picker"></div>
          </div>

          <div class="action-bar lab-replaybar" id="lab-replaybar" hidden>
            <div class="action-info" id="lab-replay-info"></div>
            <div class="lab-replay-controls">
              <button class="btn btn-sm" id="lab-first">⏮</button>
              <button class="btn btn-sm" id="lab-prev">◀ Prev</button>
              <input type="range" id="lab-frame" min="0" max="0" step="1">
              <button class="btn btn-sm" id="lab-next">Next ▶</button>
              <button class="btn btn-sm" id="lab-last">⏭</button>
            </div>
            <div class="action-buttons">
              <button class="btn btn-sm" id="lab-edit">✎ Edit actions</button>
            </div>
          </div>

          <div class="panel review-panel" id="lab-eval" hidden>
            <div class="panel-head">
              <h3>Decision Review</h3>
              <label class="inline-label">Grade <select id="lab-eval-who">
                <option value="hero">My decisions</option><option value="all">Everyone with known cards</option>
              </select></label>
            </div>
            <div id="lab-eval-body"></div>
          </div>
        </div>

        <aside class="arena-side">
          <div class="panel"><div class="panel-head"><h3>Spot Stats</h3></div><div id="lab-stats"></div></div>
          <div class="panel"><div class="panel-head"><h3>Equity &amp; Outs</h3></div><div id="lab-equity"></div></div>
          <div class="panel log-panel"><div class="panel-head"><h3>Hand Log</h3></div><div id="lab-log" class="hand-log"></div></div>
          <div class="panel"><div class="panel-head"><h3>Saved Hands</h3></div><div id="lab-saved"></div></div>
        </aside>
      </div>`;
  },

  fmt(x) {
    const bb = this.setup ? this.setup.bb : this.draft.bb;
    return `$${+(+x).toFixed(2)} <span class="muted">(${+(x / bb).toFixed(1)}bb)</span>`;
  },
  fmtPlain(x) { return `$${+(+x).toFixed(2)}`; },

  /* ---------------- Setup ---------------- */
  bind() {
    $('#lab-n').oninput = e => { this.resize(+e.target.value); };
    $('#lab-sb').oninput = e => { this.draft.sb = +e.target.value || 0; this.saveDraft(); };
    $('#lab-bb').oninput = e => { this.draft.bb = +e.target.value || 1; this.saveDraft(); this.renderSeatStackHints(); };
    $('#lab-stack').oninput = e => { this.draft.stackBB = +e.target.value || 100; this.saveDraft(); this.renderSeatStackHints(); };
    $('#lab-heropos').onchange = e => { this.draft.heroPos = e.target.value; this.saveDraft(); this.renderSetup(); };
    $('#lab-start').onclick = () => this.start();
    $('#lab-new').onclick = () => {
      // New hand: keep names, stacks and types, clear everyone's cards.
      for (const s of Object.values(this.draft.seats)) s.cards = '';
      this.pickTarget = this.draft.heroPos;
      this.savedId = null; this.events = []; this.setup = null;
      this.setMode('setup');
      this.renderSetup();
    };
    $('#lab-example').onclick = () => this.loadExample();
    $('#lab-save').onclick = () => this.save();
    $('#lab-fold').onclick = () => this.enter({ t: 'a', type: 'fold' });
    $('#lab-call').onclick = () => this.enter({ t: 'a', type: this.curCtx && this.curCtx.toCall > 0 ? 'call' : 'check' });
    $('#lab-raise').onclick = () => this.enter({ t: 'a', type: 'raise', amount: +$('#lab-raise-input').value });
    $('#lab-undo').onclick = $('#lab-board-undo').onclick = () => this.undo();
    $('#lab-raise-slider').oninput = () => { $('#lab-raise-input').value = $('#lab-raise-slider').value; this.updateRaiseLabel(); };
    $('#lab-raise-input').oninput = () => { $('#lab-raise-slider').value = $('#lab-raise-input').value; this.updateRaiseLabel(); };
    $('#lab-board-deal').onclick = () => this.enter({ t: 'b', cards: this.boardPick.slice() });
    $('#lab-board-random').onclick = () => this.randomBoard();
    $('#lab-first').onclick = () => this.goFrame(0);
    $('#lab-last').onclick = () => this.goFrame(this.frames.length - 1);
    $('#lab-prev').onclick = () => this.goFrame(this.frame - 1);
    $('#lab-next').onclick = () => this.goFrame(this.frame + 1);
    $('#lab-frame').oninput = e => this.goFrame(+e.target.value);
    $('#lab-edit').onclick = () => this.setMode('enter');
    $('#lab-to-replay').onclick = () => this.setMode('replay');
    $('#lab-eval-who').onchange = () => this.renderEval();
    document.addEventListener('keydown', e => {
      if (this.mode !== 'replay' || !this.root.offsetParent) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); this.goFrame(this.frame + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.goFrame(this.frame - 1); }
    });
  },

  saveDraft() { Store.set('nlh.lab.draft', this.draft); },

  resize(n) {
    const old = this.draft;
    if (!POSITION_LAYOUTS[n].includes(old.heroPos)) old.heroPos = POSITION_LAYOUTS[n].includes('BTN') ? 'BTN' : 'BB';
    old.n = n;
    this.saveDraft();
    this.renderSetup();
  },

  /** Positions in preflop acting order for n players. */
  preflopOrder(n) {
    const layout = POSITION_LAYOUTS[n];
    return n === 2 ? ['BTN', 'BB'] : [...layout.slice(3), 'BTN', 'SB', 'BB'];
  },

  renderSetup() {
    const d = this.draft;
    $('#lab-n').value = d.n;
    $('#lab-n-val').textContent = `${d.n} ${d.n === 2 ? '(heads-up)' : d.n === 6 ? '(6-max)' : d.n === 9 ? '(full ring)' : ''}`;
    $('#lab-sb').value = d.sb;
    $('#lab-bb').value = d.bb;
    $('#lab-stack').value = d.stackBB;
    $('#lab-heropos').innerHTML = this.preflopOrder(d.n).map(p => `<option ${p === d.heroPos ? 'selected' : ''}>${p}</option>`).join('');
    const typeOpts = LAB_TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
    $('#lab-seats').innerHTML = `
      <div class="lab-seat-row head"><span>Seat</span><span>Name</span><span>Stack ($)</span><span>Type</span><span>Hole cards</span></div>` +
      this.preflopOrder(d.n).map(pos => {
        const s = d.seats[pos] || {};
        const hero = pos === d.heroPos;
        return `<div class="lab-seat-row ${hero ? 'is-hero' : ''}" data-pos="${pos}">
          <span><span class="pos-badge">${pos}</span>${hero ? ' <b class="good">You</b>' : ''}</span>
          <input type="text" class="ls-name" maxlength="16" value="${esc(s.name || (hero ? 'You' : ''))}" placeholder="${hero ? 'You' : 'Villain'}">
          <input type="number" class="ls-stack" min="0" step="0.5" value="${s.stack ?? ''}" placeholder="${d.stackBB * d.bb}">
          ${hero ? '<span class="muted">—</span>' : `<select class="ls-type">${typeOpts}</select>`}
          <div class="ls-cards-wrap"><input type="text" class="ls-cards" maxlength="6" value="${esc(s.cards || '')}" placeholder="${hero ? 'required' : 'unknown'}"><div class="ls-preview"></div></div>
        </div>`;
      }).join('');
    $$('#lab-seats .lab-seat-row[data-pos]').forEach(row => {
      const pos = row.dataset.pos;
      const s = d.seats[pos] = d.seats[pos] || {};
      const type = $('.ls-type', row);
      if (type) { type.value = s.type || 'UNKNOWN'; type.onchange = () => { s.type = type.value; this.saveDraft(); }; }
      $('.ls-name', row).oninput = e => { s.name = e.target.value; this.saveDraft(); this.renderPreviewTable(); };
      $('.ls-stack', row).oninput = e => { s.stack = e.target.value === '' ? undefined : +e.target.value; this.saveDraft(); this.renderPreviewTable(); };
      const ci = $('.ls-cards', row);
      ci.onfocus = () => { this.pickTarget = pos; this.renderPicker(); };
      ci.oninput = () => { s.cards = ci.value; this.saveDraft(); this.renderCardPreview(row); this.renderPicker(); this.renderPreviewTable(); };
      this.renderCardPreview(row);
    });
    if (!this.pickTarget || !this.preflopOrder(d.n).includes(this.pickTarget)) this.pickTarget = d.heroPos;
    this.renderPicker();
    this.saveDraft();
    if (this.mode === 'setup') this.renderPreviewTable();
  },

  renderSeatStackHints() {
    $$('#lab-seats .ls-stack').forEach(i => { i.placeholder = this.draft.stackBB * this.draft.bb; });
  },

  renderCardPreview(row) {
    const cards = Cards.parseMany($('.ls-cards', row).value);
    const prev = $('.ls-preview', row);
    const raw = $('.ls-cards', row).value.trim();
    prev.innerHTML = cards && cards.length ? cardsHtml(cards, 'xs') : raw ? '<span class="bad">?</span>' : '';
  },

  setupUsed() {
    const used = new Map();
    for (const pos of this.preflopOrder(this.draft.n)) {
      const c = Cards.parseMany((this.draft.seats[pos] || {}).cards || '');
      if (c) c.forEach(x => used.set(x, pos));
    }
    return used;
  },

  renderPicker() {
    const used = this.setupUsed();
    const target = this.pickTarget;
    $('#lab-picker-label').innerHTML = `Card picker — filling <b>${esc(target)}${target === this.draft.heroPos ? ' (you)' : ''}</b>`;
    this.pickerHtml($('#lab-picker'), c => used.has(c) && used.get(c) !== target, c => used.get(c) === target, c => this.pickSetupCard(c));
  },

  pickerHtml(el, isDisabled, isSelected, onPick) {
    let html = '';
    for (let s = 0; s < 4; s++) {
      html += '<div class="cp-row">';
      for (let r = 12; r >= 0; r--) {
        const c = r * 4 + [0, 1, 2, 3][s];
        html += `<button class="cp-card suit-${SUITS[c & 3]} ${isDisabled(c) ? 'used' : ''} ${isSelected(c) ? 'sel' : ''}" data-c="${c}" ${isDisabled(c) ? 'disabled' : ''}>${RANKS[r]}${SUIT_SYMBOLS[SUITS[c & 3]]}</button>`;
      }
      html += '</div>';
    }
    el.innerHTML = html;
    $$('.cp-card', el).forEach(b => (b.onclick = () => onPick(+b.dataset.c)));
  },

  pickSetupCard(c) {
    const pos = this.pickTarget;
    const s = this.draft.seats[pos] = this.draft.seats[pos] || {};
    let cards = Cards.parseMany(s.cards || '') || [];
    if (cards.includes(c)) cards = cards.filter(x => x !== c);
    else if (cards.length < 2) cards.push(c);
    else cards = [cards[1], c];
    s.cards = cards.map(Cards.toString).join('');
    const row = $(`#lab-seats .lab-seat-row[data-pos="${pos}"]`);
    $('.ls-cards', row).value = s.cards;
    this.renderCardPreview(row);
    this.saveDraft();
    this.renderPreviewTable();
    // Move on to the next seat once two cards are chosen.
    if (cards.length === 2) {
      const order = this.preflopOrder(this.draft.n);
      const from = order.indexOf(pos);
      for (let k = 1; k < order.length; k++) {
        const nx = order[(from + k) % order.length];
        if (!Cards.parseMany((this.draft.seats[nx] || {}).cards || '')?.length) { this.pickTarget = nx; break; }
      }
    }
    this.renderPicker();
  },

  buildSetup() {
    const d = this.draft;
    const layout = POSITION_LAYOUTS[d.n];
    const k = layout.indexOf(d.heroPos);
    const dealer = (d.n - k) % d.n;
    const used = new Set();
    const players = [];
    for (let i = 0; i < d.n; i++) {
      const pos = layout[(i - dealer + d.n) % d.n];
      const s = d.seats[pos] || {};
      const raw = (s.cards || '').trim();
      const cards = raw ? Cards.parseMany(raw) : null;
      if (raw && (!cards || cards.length !== 2)) return { error: `${pos}: "${raw}" isn't two valid cards.` };
      if (cards) for (const c of cards) { if (used.has(c)) return { error: `${Cards.toString(c)} is used twice.` }; used.add(c); }
      if (i === 0 && !cards) return { error: 'Enter your hole cards.' };
      const stack = s.stack > 0 ? +s.stack : d.stackBB * d.bb;
      players.push({ name: (s.name || '').trim() || (i === 0 ? 'You' : pos), stack, type: i === 0 ? 'REG' : s.type || 'UNKNOWN', cards });
    }
    if (!(d.bb > 0) || d.sb < 0) return { error: 'Check the blinds.' };
    return { setup: { sb: +d.sb, bb: +d.bb, heroPos: d.heroPos, players } };
  },

  start() {
    const { setup, error } = this.buildSetup();
    $('#lab-setup-err').textContent = error || '';
    if (error) return;
    this.setup = setup;
    this.events = [];
    this.savedId = null;
    this.setMode('enter');
  },

  /* ---------------- Modes ---------------- */
  setMode(mode) {
    this.mode = mode;
    $('#lab-setup').hidden = mode !== 'setup';
    $('#lab-save').hidden = mode === 'setup';
    $('#lab-eval').hidden = mode !== 'replay';
    if (mode === 'setup') {
      $('#lab-actionbar').hidden = $('#lab-boardbar').hidden = $('#lab-replaybar').hidden = true;
      this.renderPreviewTable();
      return;
    }
    this.recompute();
    if (mode === 'replay') {
      this.computeEvals();
      this.goFrame(0);
    } else {
      this.renderEnter();
    }
  },

  recompute() {
    const r = LabEngine.replay(this.setup, this.events);
    if (r.error) this.events = this.events.slice(0, r.applied);
    this.st = r.st;
    this.frames = r.frames;
    this.eqCache = {};
  },

  enter(ev) {
    const err = LabEngine.apply(LabEngine.clone(this.st), ev);
    if (err) { setHTML($('#lab-action-info'), `<span class="bad">${esc(err)}</span>`); return; }
    this.events.push(ev);
    this.boardPick = [];
    this.recompute();
    if (this.st.done) { this.setMode('replay'); return; }
    this.renderEnter();
  },

  undo() {
    if (!this.events.length) { this.setMode('setup'); this.renderSetup(); return; }
    this.events.pop();
    this.boardPick = [];
    this.recompute();
    this.renderEnter();
  },

  /* ---------------- Entering actions ---------------- */
  renderEnter() {
    const st = this.st;
    this.renderTable(st, { active: st.toAct });
    this.renderLog(this.frames.length - 1);
    this.renderStats(st);
    this.renderEquity(st);
    $('#lab-replaybar').hidden = true;
    $('#lab-actionbar').hidden = !!st.need;
    $('#lab-boardbar').hidden = !st.need;
    $('#lab-to-replay').hidden = !st.done;
    for (const id of ['#lab-fold', '#lab-call', '#lab-raise', '#lab-sizing']) $(id).hidden = !!st.done;
    this.renderInfo();
    if (st.done) {
      setHTML($('#lab-action-info'), 'Hand complete — <b>Replay &amp; analyze</b>, or Undo to change the action.');
      return;
    }
    if (st.need) {
      const name = st.street === 0 ? 'flop (3 cards)' : st.street === 1 ? 'turn' : 'river';
      setHTML($('#lab-board-info'), `Deal the <b>${name}</b> — pick from the cards below. ${st.players.filter(p => LabEngine.canAct(p)).length <= 1 ? '<span class="muted">(All-in: run out the board.)</span>' : ''}`);
      this.renderBoardPicker();
      return;
    }
    const p = st.players[st.toAct];
    const c = LabEngine.ctx(st, p);
    this.curCtx = c;
    $('#lab-fold').hidden = c.toCall === 0;
    $('#lab-call').innerHTML = c.toCall === 0 ? 'Check' : `Call ${this.fmtPlain(c.toCall)}${c.toCall >= p.stack ? ' (all-in)' : ''}`;
    $('#lab-raise').hidden = !c.canRaise;
    $('#lab-sizing').hidden = !c.canRaise;
    setHTML($('#lab-action-info'), `<b>${STREET_NAMES[st.street]}</b> · Action on <span class="pos-badge">${p.position}</span> <b>${esc(p.name)}</b>${p.isHero ? ' (you)' : ''} — ${c.toCall > 0 ? `${this.fmt(c.toCall)} to call into ${this.fmt(c.pot)}` : `pot ${this.fmt(c.pot)}`}`);
    if (c.canRaise) {
      for (const el of [$('#lab-raise-slider'), $('#lab-raise-input')]) { el.min = c.minRaiseTo; el.max = c.maxRaiseTo; el.step = st.sb < 1 ? 0.5 : 1; }
      this.renderPresets(st, c);
      const def = st.street === 0 ? (st.raiseLevel === 0 ? st.bb * 3 : st.currentBet * 3) : st.currentBet === 0 ? c.pot * 0.5 : st.currentBet * 3;
      this.setRaise(def);
    }
  },

  renderPresets(st, c) {
    let presets;
    if (st.street === 0) {
      presets = st.raiseLevel === 0
        ? [['2x', st.bb * 2], ['2.5x', st.bb * 2.5], ['3x', st.bb * 3], ['4x', st.bb * 4]]
        : [['2.5x', st.currentBet * 2.5], ['3x', st.currentBet * 3], ['4x', st.currentBet * 4], ['Pot', st.currentBet + c.pot + c.toCall]];
    } else {
      presets = [['⅓', 0.33], ['½', 0.5], ['⅔', 0.66], ['¾', 0.75], ['Pot', 1], ['1.5x', 1.5]]
        .map(([l, f]) => [l, st.currentBet === 0 ? c.pot * f : st.currentBet + (c.pot + c.toCall) * f]);
    }
    presets.push(['All-in', c.maxRaiseTo]);
    $('#lab-presets').innerHTML = presets.map(([l, v]) => `<button class="btn btn-xs" data-v="${v}">${l}</button>`).join('');
    $$('#lab-presets button').forEach(b => (b.onclick = () => this.setRaise(+b.dataset.v)));
  },

  setRaise(v) {
    const c = this.curCtx;
    const step = this.st.sb < 1 ? 0.5 : 1;
    v = Math.round(v / step) * step;
    v = Math.max(c.minRaiseTo, Math.min(c.maxRaiseTo, v));
    $('#lab-raise-slider').value = v;
    $('#lab-raise-input').value = +v.toFixed(2);
    this.updateRaiseLabel();
  },

  updateRaiseLabel() {
    const c = this.curCtx;
    if (!c) return;
    const v = Math.min(+$('#lab-raise-input').value, c.maxRaiseTo);
    const word = v >= c.maxRaiseTo ? 'All-in' : this.st.currentBet === 0 ? 'Bet' : 'Raise to';
    $('#lab-raise').textContent = `${word} ${this.fmtPlain(v)}`;
  },

  renderBoardPicker() {
    const used = LabEngine.usedCards(this.st);
    const need = this.st.need;
    this.pickerHtml($('#lab-board-picker'), c => used.has(c), c => this.boardPick.includes(c), c => {
      if (this.boardPick.includes(c)) this.boardPick = this.boardPick.filter(x => x !== c);
      else if (this.boardPick.length < need) this.boardPick.push(c);
      else this.boardPick = [...this.boardPick.slice(1), c];
      this.renderBoardPicker();
    });
    setHTML($('#lab-board-pick'), Array.from({ length: need }, (_, i) => this.boardPick[i] !== undefined ? Cards.html(this.boardPick[i], 'sm') : Cards.placeholderHtml('sm')).join(''));
    $('#lab-board-deal').disabled = this.boardPick.length !== need;
  },

  randomBoard() {
    const used = LabEngine.usedCards(this.st);
    const deck = Cards.newDeck().filter(c => !used.has(c) && !this.boardPick.includes(c));
    while (this.boardPick.length < this.st.need) this.boardPick.push(deck.pop());
    this.renderBoardPicker();
  },

  renderInfo() {
    const s = this.setup;
    const n = s.players.length;
    const hero = s.players[0];
    setHTML($('#lab-info'), `
      <span><b>${this.mode === 'replay' ? 'Replay' : 'Entering hand'}</b></span>
      <span>${n}-handed</span>
      <span>Blinds <b>$${s.sb}/$${s.bb}</b></span>
      <span>You: <b>${this.setup.heroPos}</b> ${cardsHtml(hero.cards, 'xs')}</span>`);
  },

  /* ---------------- Table ---------------- */
  renderPreviewTable() {
    const { setup } = this.buildSetup();
    $('#lab-log').innerHTML = '';
    setHTML($('#lab-stats'), '<p class="hint">Stats appear once you start entering the hand.</p>');
    setHTML($('#lab-equity'), '<p class="hint">Equities for every player with known cards appear here.</p>');
    if (!setup) { setHTML($('#lab-seat-layer'), ''); setHTML($('#lab-board'), ''); setHTML($('#lab-pot'), ''); setHTML($('#lab-msg'), 'Enter your hole cards to preview the table.'); setHTML($('#lab-info'), '<span><b>Setup</b></span>'); return; }
    this.setup = setup;
    this.renderTable(LabEngine.create(setup), { active: -1, preview: true });
    setHTML($('#lab-msg'), 'Set up the table, then start entering the action.');
    setHTML($('#lab-info'), '<span><b>Setup</b></span>');
  },

  seatCoords(n, portrait) {
    const rx = portrait ? 39 : 42, ry = portrait ? 41 : 40;
    return Array.from({ length: n }, (_, i) => {
      const ang = (90 + (i * 360) / n) * Math.PI / 180;
      return [50 + rx * Math.cos(ang), 50 + ry * Math.sin(ang) + (portrait ? 0 : -1)];
    });
  },

  renderTable(st, { active = -1, nextEv = null, preview = false } = {}) {
    const table = $('#lab-table');
    const layer = $('#lab-seat-layer');
    if (layer.dataset.n !== String(st.n)) {
      layer.dataset.n = st.n;
      layer.innerHTML = st.players.map(p => `
        <div class="seat ${p.isHero ? 'hero' : ''}" id="lab-seat-${p.id}">
          <div class="seat-cards"></div>
          <div class="seat-box">
            <div class="seat-top"><span class="seat-name"></span><span class="pos-badge"></span></div>
            <div class="seat-stack"></div>
            <span class="type-badge" hidden></span>
            <div class="dealer-btn" hidden>D</div>
          </div>
          <div class="seat-action"></div>
        </div>
        <div class="bet-chip" id="lab-bet-${p.id}" hidden></div>`).join('');
      setHTML($('#lab-board'), Array.from({ length: 5 }, (_, i) => `<div class="board-slot" id="lab-board-${i}"></div>`).join(''));
    }
    table.classList.toggle('many', st.n > 6);
    this.layoutSeats();
    for (const p of st.players) {
      const seat = $('#lab-seat-' + p.id);
      $('.seat-name', seat).textContent = p.name;
      $('.pos-badge', seat).textContent = p.position;
      setHTML($('.seat-stack', seat), this.fmtPlain(preview ? p.startStack : p.stack));
      $('.dealer-btn', seat).hidden = p.position !== 'BTN';
      const tb = $('.type-badge', seat);
      tb.hidden = p.isHero || !p.typeKnown;
      if (p.typeKnown) { tb.textContent = PROFILES[p.profile].label; tb.style.background = PROFILES[p.profile].color; }
      setHTML($('.seat-cards', seat), p.cards ? p.cards.map(c => Cards.html(c, p.isHero ? 'lg' : '')).join('') : Cards.backHtml('') + Cards.backHtml(''));
      const label = p.lastAction ? p.lastAction.replace(/[\d.]+$/, m => this.fmtPlain(+m)) : '';
      setHTML($('.seat-action', seat), preview ? '' : esc(label));
      seat.classList.toggle('active', p.id === active && !p.isHero);
      seat.classList.toggle('hero-turn', p.id === active && p.isHero);
      seat.classList.toggle('folded', p.folded);
      seat.classList.toggle('allin', p.allIn);
      seat.classList.toggle('winner', !!(this.resultIds && this.resultIds.has(p.id) && st.done));
      const chip = $('#lab-bet-' + p.id);
      chip.hidden = !(p.bet > 0) || preview;
      if (p.bet > 0) setHTML(chip, `<span class="chip-icon"></span>${this.fmtPlain(p.bet)}`);
    }
    for (let i = 0; i < 5; i++) setHTML($('#lab-board-' + i), st.board[i] !== undefined ? Cards.html(st.board[i]) : '');
    setHTML($('#lab-pot'), preview ? '' : `Pot <b>${this.fmtPlain(LabEngine.pot(st))}</b>`);
    let msg = '';
    if (st.done) {
      const res = LabEngine.result(st);
      this.resultIds = new Set(res && res.winners ? res.winners.map(w => w.id) : []);
      msg = res.unknown ? 'Showdown — enter the remaining players\' cards in setup to see who won.'
        : res.winners.map(w => `<div class="${st.players[w.id].isHero ? 'win-hero' : ''}">${esc(st.players[w.id].name)} wins ${this.fmtPlain(w.amount)}${w.hand ? ' — ' + w.hand : ''}</div>`).join('');
      for (const p of st.players) $('#lab-seat-' + p.id).classList.toggle('winner', this.resultIds.has(p.id));
    } else if (nextEv) {
      msg = '';
    }
    if (!preview) setHTML($('#lab-msg'), msg);
  },

  layoutSeats() {
    const layer = $('#lab-seat-layer');
    const n = +layer.dataset.n;
    if (!n) return;
    const table = $('#lab-table');
    const portrait = table.clientWidth < 640;
    table.classList.toggle('portrait', portrait);
    const coords = this.seatCoords(n, portrait);
    for (let i = 0; i < n; i++) {
      const seat = $('#lab-seat-' + i);
      if (!seat) continue;
      const [x, y] = coords[i];
      seat.style.left = x + '%';
      seat.style.top = y + '%';
      seat.dataset.side = y > 50 ? 'bottom' : 'top';
      const chip = $('#lab-bet-' + i);
      chip.style.left = x + (50 - x) * 0.42 + '%';
      chip.style.top = y + (48 - y) * 0.42 + '%';
    }
  },

  /* ---------------- Log ---------------- */
  describeEvent(st, ev, frameBefore) {
    if (ev.t === 'b') return `<span class="tl-street">${['Flop', 'Turn', 'River'][frameBefore.street]}: ${ev.cards.map(Cards.inline).join(' ')}</span>`;
    const p = frameBefore.players[frameBefore.toAct];
    const c = LabEngine.ctx(frameBefore, p);
    const what = ev.type === 'fold' ? 'folds' : ev.type === 'check' || (ev.type === 'call' && c.toCall === 0) ? 'checks'
      : ev.type === 'call' ? `calls ${this.fmtPlain(c.toCall)}`
        : `${frameBefore.currentBet === 0 ? 'bets' : 'raises to'} ${this.fmtPlain(Math.min(Math.max(ev.amount, c.minRaiseTo), c.maxRaiseTo))}`;
    return `<span class="pos-badge">${p.position}</span> ${esc(p.name)} ${what}`;
  },

  renderLog(upto) {
    const lines = ['<div class="log-line info">Blinds posted</div>'];
    this.events.forEach((ev, i) => {
      const cls = i < upto ? '' : 'future';
      lines.push(`<div class="log-line lab-log-line ${cls} ${i === upto - 1 ? 'current' : ''}" data-f="${i + 1}">${this.describeEvent(this.st, ev, this.frames[i])}</div>`);
    });
    setHTML($('#lab-log'), lines.join(''));
    if (this.mode === 'replay') $$('#lab-log [data-f]').forEach(el => (el.onclick = () => this.goFrame(+el.dataset.f)));
  },

  /* ---------------- Stats ---------------- */
  renderStats(st) {
    const actor = st.toAct >= 0 && !st.done && !st.need ? st.players[st.toAct] : null;
    const pot = LabEngine.pot(st);
    const bb = st.bb;
    const row = (k, v, cls = '') => `<div class="${cls}"><span>${k}</span><b>${v}</b></div>`;
    let html = '';
    if (!actor) {
      html += `<p class="hint">${st.done ? 'Hand complete.' : st.need ? 'Waiting for the next board card(s).' : ''}</p>`;
      html += `<div class="stats-grid">${row('Pot', this.fmtPlain(pot))}${row('Pot (bb)', (pot / bb).toFixed(1))}</div>`;
      setHTML($('#lab-stats'), html);
      return;
    }
    const c = LabEngine.ctx(st, actor);
    const others = st.players.filter(o => o !== actor && !o.folded);
    const eff = Math.min(actor.stack + actor.bet, Math.max(...others.map(o => o.stack + o.bet)));
    const potBeforeStreet = pot - st.players.reduce((s, p) => s + p.bet, 0);
    const spr = eff / Math.max(0.01, potBeforeStreet || pot);
    const order = i => (i - st.dealer - 1 + st.n) % st.n;
    const ip = others.every(o => order(o.id) < order(actor.id));
    const leftToAct = st.players.filter(o => o !== actor && LabEngine.canAct(o) && (!o.acted || o.bet < st.currentBet) && order(o.id) > order(actor.id)).length;
    html += `<div class="lab-actor"><span class="pos-badge">${actor.position}</span> <b>${esc(actor.name)}</b>${actor.isHero ? ' (you)' : ''} to act · ${STREET_NAMES[st.street]}</div>`;
    html += '<div class="stats-grid">';
    html += row('Pot', this.fmtPlain(pot));
    html += row('To call', c.toCall ? this.fmtPlain(c.toCall) : '—');
    if (c.toCall > 0) {
      const need = c.toCall / (pot + c.toCall);
      html += row('Pot odds', `${(pot / c.toCall).toFixed(1)} : 1`);
      html += row('Equity needed', pct(need), 'hl-stat');
      html += row('Facing bet', `${Math.round((c.toCall / Math.max(0.01, pot - c.toCall)) * 100)}% pot`);
      html += row('MDF', pct((pot - c.toCall) / pot));
    }
    html += row('Eff. stack', `${(eff / bb).toFixed(1)}bb`);
    if (st.street > 0) html += row('SPR', spr.toFixed(1));
    html += row('Position', st.street === 0 ? actor.position : ip ? 'In position' : 'Out of position');
    html += row('Players in hand', others.length + 1);
    if (leftToAct) html += row('Still to act after', leftToAct);
    if (c.canRaise) html += row('Min raise to', this.fmtPlain(c.minRaiseTo));
    html += row('All-in', this.fmtPlain(c.maxRaiseTo));
    html += '</div>';
    if (c.toCall > 0) {
      const need = c.toCall / (pot + c.toCall);
      let line = `Calling ${this.fmtPlain(c.toCall)} to win ${this.fmtPlain(pot)} needs <b>${pct(need)}</b> equity.`;
      if (actor.cards) {
        const e = this.frameEquity(st).byId[actor.id];
        const vs = others.every(o => o.cards) ? 'the actual cards' : 'the known cards (unknown hands as random)';
        const has = actor.isHero ? 'You have' : `${esc(actor.name)} has`;
        if (e >= need) line += ` ${has} <b class="good">${pct(e)}</b> against ${vs} — a profitable call on direct odds.`;
        else {
          // EV = e*(pot + X) - (1 - e)*toCall >= 0  =>  X >= toCall*(1 - e)/e - pot
          const x = e > 0 ? c.toCall * (1 - e) / e - pot : Infinity;
          line += ` ${has} only <b class="bad">${pct(e)}</b> against ${vs}${st.street < 3 && isFinite(x) ? ` — calling needs about <b>${this.fmtPlain(Math.max(0, x))}</b> more in future winnings (implied odds) to break even` : ' — not enough to call'}.`;
        }
      }
      html += `<p class="hint">${line}</p>`;
    }
    // Last aggressive action's sizing.
    const lastBet = [...st.actions].reverse().find(a => a.street === st.street && a.type === 'raise');
    if (lastBet) {
      const bettor = st.players[lastBet.pid];
      const added = lastBet.amount - lastBet.currentBet;
      const potBefore = lastBet.pot + (lastBet.currentBet - lastBet.betBefore);
      const frac = added / Math.max(0.01, potBefore);
      html += `<div class="lab-sizing-note"><b>${esc(bettor.name)}'s ${lastBet.currentBet === 0 ? 'bet' : 'raise'}</b>: ${Math.round(frac * 100)}% of the pot. As a bluff it must work <b>${pct(added / (potBefore + added))}</b> of the time.</div>`;
    }
    setHTML($('#lab-stats'), html);
  },

  /** Equity of every live player (unknown hands treated as random) plus outs to take the lead. */
  frameEquity(st) {
    const live = st.players.filter(p => !p.folded);
    const key = st.board.join() + '|' + live.map(p => p.id).join();
    if (!this.eqCache[key]) {
      const iters = st.board.length === 5 ? 1 : 4000;
      const eq = st.board.length === 5 && live.every(p => p.cards)
        ? (() => { const sc = live.map(p => evaluateHand([...p.cards, ...st.board])); const best = Math.max(...sc); const w = sc.filter(s => s === best).length; return sc.map(s => (s === best ? 1 / w : 0)); })()
        : calcEquity(live.map(p => p.cards || null), st.board, iters);
      this.eqCache[key] = { eq, outs: this.outs(st, live), byId: Object.fromEntries(live.map((p, i) => [p.id, eq[i]])) };
    }
    return { live, ...this.eqCache[key] };
  },

  renderEquity(st) {
    const { live, eq, outs } = this.frameEquity(st);
    const unknown = live.filter(p => !p.cards).length;
    const rows = live.map((p, i) => {
      const made = p.cards && st.board.length >= 3 ? describeHand(evaluateHand([...p.cards, ...st.board])) : p.cards ? Cards.handCode(p.cards[0], p.cards[1]) : 'Unknown hand';
      const o = outs && outs[p.id];
      return `<div class="lab-eq-row ${p.isHero ? 'is-hero' : ''}">
        <div class="lab-eq-head"><span class="pos-badge">${p.position}</span> <b>${esc(p.name)}</b> <span class="lab-eq-cards">${p.cards ? cardsHtml(p.cards, 'xs') : '<span class="muted">??</span>'}</span><b class="lab-eq-pct">${pct(eq[i])}</b></div>
        <div class="eq-bar"><div style="width:${eq[i] * 100}%"></div></div>
        <div class="lab-eq-made">${made}${o && o.length ? ` · <b>${o.length} out${o.length > 1 ? 's' : ''}</b> to take the lead: ${o.slice(0, 12).map(Cards.inline).join(' ')}${o.length > 12 ? ' …' : ''}` : ''}</div>
      </div>`;
    }).join('');
    const note = unknown ? `<p class="hint">${unknown} player${unknown > 1 ? 's\'' : '\'s'} cards unknown — treated as random hands.</p>` : '';
    const hero = st.players[0];
    let heroBit = '';
    if (!hero.folded && st.board.length >= 3 && st.board.length < 5) {
      const n = outs && outs[hero.id] ? outs[hero.id].length : null;
      if (n) heroBit = `<p class="hint">Rule of 2 &amp; 4 with ${n} outs: ~${n * 2}% next card${st.board.length === 3 ? `, ~${Math.min(100, n * 4)}% by the river` : ''}.</p>`;
    }
    setHTML($('#lab-equity'), rows + note + heroBit);
  },

  outs(st, live) {
    if (st.board.length < 3 || st.board.length >= 5 || live.some(p => !p.cards) || live.length < 2) return null;
    const used = LabEngine.usedCards(st);
    const score = (p, board) => evaluateHand([...p.cards, ...board]);
    const leaderNow = (() => { const sc = live.map(p => score(p, st.board)); return live[sc.indexOf(Math.max(...sc))].id; })();
    const res = {};
    for (const p of live) res[p.id] = [];
    for (let c = 0; c < 52; c++) {
      if (used.has(c)) continue;
      const board = [...st.board, c];
      const sc = live.map(p => score(p, board));
      const best = Math.max(...sc);
      const leaders = live.filter((_, i) => sc[i] === best);
      if (leaders.length === 1 && leaders[0].id !== leaderNow) res[leaders[0].id].push(c);
    }
    return res;
  },

  /* ---------------- Replay & evaluation ---------------- */
  goFrame(f) {
    if (!this.frames) return;
    this.frame = Math.max(0, Math.min(this.frames.length - 1, f));
    const st = this.frames[this.frame];
    const nextEv = this.events[this.frame];
    $('#lab-actionbar').hidden = $('#lab-boardbar').hidden = true;
    $('#lab-replaybar').hidden = false;
    const slider = $('#lab-frame');
    slider.max = this.frames.length - 1;
    slider.value = this.frame;
    this.renderInfo();
    this.renderTable(st, { active: st.toAct, nextEv });
    this.renderLog(this.frame);
    this.renderStats(st);
    this.renderEquity(st);
    const nextText = nextEv ? `Next: ${this.describeEvent(st, nextEv, st)}` : this.st.done ? 'End of hand.' : '';
    setHTML($('#lab-replay-info'), `Step <b>${this.frame + 1}</b> of ${this.frames.length} · <b>${STREET_NAMES[Math.min(st.street, 3)]}</b> · ${nextText}`);
    $('#lab-prev').disabled = this.frame === 0;
    $('#lab-next').disabled = this.frame === this.frames.length - 1;
    this.renderEval();
  },

  /** Index of the action (in st.actions) taken by event i, or -1 for board events. */
  actionIndexOfEvent(i) {
    let k = -1;
    for (let j = 0; j <= i; j++) if (this.events[j].t === 'a') k++;
    return this.events[i] && this.events[i].t === 'a' ? k : -1;
  },

  computeEvals() {
    const st = this.st;
    this.evals = {};
    const known = st.players.filter(p => p.cards);
    for (const p of known) {
      const h = LabEngine.history(st, p.id);
      const helper = p.isHero ? { range: RangeStore.byPosition(p.position), roll: null, lab: true } : { range: null, roll: null, lab: true };
      st.actions.forEach((a, idx) => {
        if (a.pid !== p.id) return;
        try { this.evals[idx] = Analysis.analyzeStep(h, idx, helper); } catch (e) { /* skip */ }
      });
    }
  },

  renderEval() {
    const body = $('#lab-eval-body');
    if (this.mode !== 'replay' || !this.evals) return;
    const who = $('#lab-eval-who').value;
    const st = this.st;
    const steps = Object.entries(this.evals).map(([idx, s]) => ({ idx: +idx, s })).filter(x => who === 'all' || st.players[x.s.action.pid].isHero);
    if (!steps.length) { setHTML(body, '<p class="hint">No decisions to grade (enter hole cards to grade other players).</p>'); return; }
    const counts = { good: 0, ok: 0, mistake: 0 };
    steps.forEach(x => counts[x.s.verdict]++);
    // Which decision is current: the next event if it's an action.
    const curA = this.actionIndexOfEvent(this.frame);
    const pills = steps.map(x => {
      const p = st.players[x.s.action.pid];
      return `<button class="rv-pill v-${x.s.verdict} ${x.idx === curA ? 'active' : ''}" data-a="${x.idx}">
        <span>${STREET_NAMES[x.s.street]} · ${esc(p.name)}</span><b>${Analysis.actionLabel(x.s.action, st.bb)}</b></button>`;
    }).join('');
    const cur = steps.find(x => x.idx === curA);
    let detail = '<p class="hint">Step to a graded decision (or click one above) to see the evaluation.</p>';
    if (cur) detail = this.evalDetail(cur.s);
    setHTML(body, `
      <div class="rv-counts">
        <span class="verdict v-good">${counts.good} good</span>
        <span class="verdict v-ok">${counts.ok} okay</span>
        <span class="verdict v-mistake">${counts.mistake} mistake${counts.mistake === 1 ? '' : 's'}</span>
      </div>
      <div class="rv-pills lab-pills">${pills}</div>
      ${detail}`);
    $$('#lab-eval-body .rv-pill').forEach(b => (b.onclick = () => this.goFrame(this.eventIndexOfAction(+b.dataset.a))));
  },

  eventIndexOfAction(a) {
    let k = -1;
    for (let i = 0; i < this.events.length; i++) if (this.events[i].t === 'a' && ++k === a) return i;
    return 0;
  },

  evalDetail(s) {
    const st = this.st;
    const p = st.players[s.action.pid];
    const card = (title, obj, extra = '', cls = '') => obj ? `
      <div class="rv-card ${cls}">
        <div class="rv-card-head"><h4>${title}</h4>${obj.verdict ? Review.badge(obj.verdict) : ''}</div>
        ${extra}${(obj.text || obj.reasons).map(t => `<p>${t}</p>`).join('')}
      </div>` : '';
    const hs = Math.pow(s.eq.est, 1 / Math.max(1, s.villains.length));
    const better = s.decision.verdict !== 'good'
      ? `<div class="rv-better">Better: <b>${Analysis.recLabel({ a: s.action, bb: st.bb, hs, texture: s.texture, pos: p.position, ip: s.ip, prior: st.actions.slice(0, s.idx) }, s.decision.rec)}</b></div>`
      : '<div class="rv-better good">✓ This was the recommended play.</div>';
    const eqBar = (label, val, cls) => `<div class="rv-eq-row"><span>${label}</span><div class="rv-eq-bar ${cls}"><div style="width:${val * 100}%"></div>${s.eq.need ? `<i style="left:${s.eq.need * 100}%"></i>` : ''}</div><b>${pct(val, 0)}</b></div>`;
    return `
      <div class="lab-eval-head"><span class="pos-badge">${p.position}</span> <b>${esc(p.name)}</b> ${p.cards ? cardsHtml(p.cards, 'xs') : ''} — ${Analysis.actionLabel(s.action, st.bb)} ${Review.badge(s.verdict)}</div>
      ${better}
      <div class="rv-eq">
        ${eqBar('Equity vs estimated range', s.eq.est, 'est')}
        ${s.eq.actual !== null ? eqBar('Equity vs actual cards', s.eq.actual, 'actual') : ''}
        ${s.eq.need ? `<div class="rv-need">Marker = equity needed to call (${pct(s.eq.need)})</div>` : ''}
      </div>
      <div class="rv-cards">
        ${card('Decision', s.decision)}
        ${card('Sizing', s.sizing)}
        ${card('Range', s.range, s.range.freq ? freqBarHtml(s.range.freq) : '')}
        ${card('Position', s.position)}
        ${s.hindsight ? `<div class="rv-card rv-hindsight"><div class="rv-card-head"><h4>Hindsight</h4></div><p>${s.hindsight}</p></div>` : ''}
      </div>`;
  },

  /* ---------------- Save / load ---------------- */
  saved() { return Store.get(this.KEY, []); },

  save() {
    if (!this.setup) return;
    const list = this.saved();
    const hero = this.setup.players[0];
    const defTitle = `${this.setup.heroPos} ${Cards.handCode(hero.cards[0], hero.cards[1])} · $${this.setup.sb}/$${this.setup.bb}`;
    const existing = list.find(x => x.id === this.savedId);
    showModal('Save hand', `<label>Title<input type="text" id="lab-save-title" maxlength="80" value="${esc(existing ? existing.title : defTitle)}"></label>
      <label>Notes<textarea id="lab-save-notes" rows="3">${esc(existing ? existing.notes || '' : '')}</textarea></label>`, [
      { label: 'Cancel' },
      {
        label: 'Save', cls: 'btn-primary', onClick: () => {
          const rec = { id: this.savedId || 'h' + Date.now().toString(36), title: $('#lab-save-title').value || defTitle, notes: $('#lab-save-notes').value, date: new Date().toISOString(), setup: this.setup, events: this.events, draft: this.draft };
          const others = list.filter(x => x.id !== rec.id);
          Store.set(this.KEY, [rec, ...others].slice(0, 100));
          this.savedId = rec.id;
          this.renderSaved();
        },
      },
    ]);
  },

  renderSaved() {
    const list = this.saved();
    setHTML($('#lab-saved'), list.length ? list.map(x => {
      const hero = x.setup.players[0];
      return `<div class="lab-saved-item" data-id="${x.id}">
        <div class="lab-saved-main"><b>${esc(x.title)}</b><span class="muted">${new Date(x.date).toLocaleDateString()} · ${x.setup.players.length}-handed</span></div>
        ${cardsHtml(hero.cards, 'xs')}
        <button class="btn btn-xs btn-danger" data-del="${x.id}" title="Delete">✕</button>
      </div>`;
    }).join('') : '<p class="hint">Saved hands appear here.</p>');
    $$('#lab-saved .lab-saved-item').forEach(el => (el.onclick = e => {
      if (e.target.dataset.del) {
        Store.set(this.KEY, this.saved().filter(x => x.id !== e.target.dataset.del));
        this.renderSaved();
        return;
      }
      this.load(this.saved().find(x => x.id === el.dataset.id));
    }));
  },

  load(rec) {
    if (!rec) return;
    this.setup = rec.setup;
    this.events = rec.events.slice();
    this.savedId = rec.id;
    if (rec.draft) { this.draft = rec.draft; this.saveDraft(); }
    this.recompute();
    this.setMode(this.st.done ? 'replay' : 'enter');
    $('#lab-table').scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  loadExample() {
    const C2 = s => Cards.parseMany(s);
    const draft = {
      n: 6, sb: 1, bb: 2, stackBB: 100, heroPos: 'BTN',
      seats: {
        UTG: { name: 'Mike', cards: '' }, HJ: { name: 'Sara', cards: '' },
        CO: { name: 'Dan', type: 'TAG', cards: 'JsJc', stack: 230 }, BTN: { name: 'You', cards: 'AhQh' },
        SB: { name: 'Lou', cards: '' }, BB: { name: 'Ray', type: 'FISH', cards: '9c8c', stack: 160 },
      },
    };
    this.draft = draft;
    this.saveDraft();
    const { setup } = this.buildSetup();
    this.setup = setup;
    this.events = [
      { t: 'a', type: 'fold' }, { t: 'a', type: 'fold' },
      { t: 'a', type: 'raise', amount: 6 }, { t: 'a', type: 'call' },
      { t: 'a', type: 'fold' }, { t: 'a', type: 'call' },
      { t: 'b', cards: C2('Qd9h4h') },
      { t: 'a', type: 'check' }, { t: 'a', type: 'raise', amount: 10 }, { t: 'a', type: 'raise', amount: 32 },
      { t: 'a', type: 'call' }, { t: 'a', type: 'call' },
      { t: 'b', cards: C2('2c') },
      { t: 'a', type: 'check' }, { t: 'a', type: 'check' }, { t: 'a', type: 'raise', amount: 60 },
      { t: 'a', type: 'fold' }, { t: 'a', type: 'call' },
      { t: 'b', cards: C2('Ks') },
      { t: 'a', type: 'check' }, { t: 'a', type: 'raise', amount: 90 }, { t: 'a', type: 'fold' },
    ];
    this.savedId = null;
    this.renderSetup();
    this.recompute();
    this.setMode(this.st.done ? 'replay' : 'enter');
  },
};
