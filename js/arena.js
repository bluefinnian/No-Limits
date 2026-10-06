'use strict';
/* Practice Arena: table rendering, hero controls, range helper and session stats. */

const OPPONENT_NAMES = ['Alex', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Harper', 'Jordan', 'Kai', 'Logan', 'Morgan', 'Quinn', 'Riley', 'Sage', 'Taylor', 'Rowan', 'Skyler', 'Avery'];

/* Visual slots, clockwise from the hero at the bottom. [x%, y%] */
const SLOT_COORDS = {
  landscape: [[50, 87], [9, 64], [17, 15], [50, 7], [83, 15], [91, 64]],
  portrait: [[50, 90], [12, 67], [13, 27], [50, 8], [87, 27], [88, 67]],
};
const SLOTS_FOR_COUNT = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 5], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };

const DEFAULT_SETTINGS = {
  opponents: 5, blinds: '1/2', stack: 100, speed: 'normal',
  seatTypes: ['TAG', 'FISH', 'LAG', 'STATION', 'MANIAC'],
  showTypes: true, showCards: false, showEquity: true, inBB: true, autoDeal: true, autoReview: true, fourColor: false,
  rangeSel: 'auto', showSuggestion: true, tellFreq: 'normal', tellHints: true,
};

const Arena = {
  game: null,
  settings: null,
  revealed: new Set(),

  init() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, Store.get('nlh.arena.settings', {}));
    this.bindSetup();
    this.bindActions();
    this.bindRangeHelper();
    $('#log-clear').onclick = () => { $('#hand-log').innerHTML = ''; };
    new ResizeObserver(() => this.layoutSeats()).observe($('#poker-table'));
    RangeStore.onChange(() => this.renderRangeHelperOptions());
    this.startSession();
  },

  saveSettings() { Store.set('nlh.arena.settings', this.settings); },

  fmt(chips) {
    if (!this.game) return chips;
    if (this.settings.inBB) return `${+(chips / this.game.bb).toFixed(1)} bb`;
    return '$' + (+chips.toFixed(2)).toLocaleString();
  },

  /* =================== Setup =================== */
  bindSetup() {
    const s = this.settings;
    $('#arena-setup-toggle').onclick = () => { $('#arena-setup').hidden = !$('#arena-setup').hidden; };
    $('#set-opponents').value = s.opponents;
    $('#set-blinds').value = s.blinds;
    $('#set-stack').value = s.stack;
    $('#set-speed').value = s.speed;
    const toggles = { 'set-show-types': 'showTypes', 'set-show-cards': 'showCards', 'set-show-equity': 'showEquity', 'set-in-bb': 'inBB', 'set-auto-deal': 'autoDeal', 'set-auto-review': 'autoReview', 'set-four-color': 'fourColor' };
    for (const [id, key] of Object.entries(toggles)) {
      const box = $('#' + id);
      box.checked = !!s[key];
      // Display toggles apply immediately; no new session needed.
      box.onchange = () => { s[key] = box.checked; this.saveSettings(); this.applyDisplaySettings(); };
    }
    $('#set-tell-freq').value = s.tellFreq;
    $('#set-tell-freq').onchange = e => { s.tellFreq = e.target.value; this.saveSettings(); };
    $('#set-tell-hints').checked = s.tellHints;
    $('#set-tell-hints').onchange = e => { s.tellHints = e.target.checked; this.saveSettings(); this.renderReads(); };
    $('#set-speed').onchange = e => { s.speed = e.target.value; this.saveSettings(); if (this.game) this.game.speed = s.speed; };
    $('#set-opponents').onchange = () => { this.readSeatTypes(); s.opponents = +$('#set-opponents').value; this.renderSeatTypeInputs(); };
    $$('[data-preset-types]').forEach(b => (b.onclick = () => {
      const v = b.dataset.presetTypes;
      const mixed = Cards.shuffle(['TAG', 'FISH', 'LAG', 'STATION', 'MANIAC', 'NIT', 'REG']);
      s.seatTypes = Array.from({ length: 5 }, (_, i) => (v === 'random' ? 'RANDOM' : v === 'mixed' ? mixed[i] : v));
      this.renderSeatTypeInputs();
    }));
    $('#set-apply').onclick = () => {
      this.readSeatTypes();
      s.opponents = +$('#set-opponents').value;
      s.blinds = $('#set-blinds').value;
      s.stack = +$('#set-stack').value;
      this.saveSettings();
      $('#arena-setup').hidden = true;
      this.startSession();
    };
    $('#arena-new-session').onclick = () => {
      showModal('Start a new session?', '<p>Stacks and session stats will reset.</p>', [
        { label: 'Cancel' },
        { label: 'New session', cls: 'btn-primary', onClick: () => this.startSession() },
      ]);
    };
    this.renderSeatTypeInputs();
    this.applyDisplaySettings();
  },

  renderSeatTypeInputs() {
    const s = this.settings;
    const n = +$('#set-opponents').value;
    const opts = `<option value="RANDOM">Random (hidden)</option>` + PROFILE_KEYS.map(k => `<option value="${k}">${PROFILES[k].label} — ${PROFILES[k].name}</option>`).join('');
    $('#set-seat-types').innerHTML = Array.from({ length: n }, (_, i) => `
      <label>Seat ${i + 1}<select data-seat="${i}">${opts}</select></label>`).join('');
    $$('#set-seat-types select').forEach((sel, i) => { sel.value = s.seatTypes[i] || 'TAG'; });
  },

  readSeatTypes() {
    $$('#set-seat-types select').forEach((sel, i) => { this.settings.seatTypes[i] = sel.value; });
  },

  applyDisplaySettings() {
    document.body.classList.toggle('four-color', !!this.settings.fourColor);
    $('#hand-helper').hidden = !this.settings.showEquity;
    if (this.game) this.render();
  },

  /* =================== Session =================== */
  startSession() {
    if (this.game) this.game.destroy();
    clearTimeout(this.autoTimer);
    const s = this.settings;
    const [sb, bb] = s.blinds.split('/').map(Number);
    const names = Cards.shuffle(OPPONENT_NAMES.slice());
    const seats = [{ name: 'You', isHero: true }];
    this.hiddenTypes = new Set();
    for (let i = 0; i < s.opponents; i++) {
      let type = s.seatTypes[i] || 'TAG';
      if (type === 'RANDOM') { type = PROFILE_KEYS[Math.floor(Math.random() * PROFILE_KEYS.length)]; this.hiddenTypes.add(i + 1); }
      seats.push({ name: names[i], profile: type });
    }
    this.revealed = new Set();
    this.game = new PokerGame({ seats, sb, bb, stack: s.stack * bb, speed: s.speed });
    this.stats = { hands: 0, net: 0, vpip: 0, pfr: 0, wtsd: 0, wsd: 0, followed: 0, decisions: 0 };
    this.handState = null;
    this.helper = null;
    this.lastDiscipline = null;
    this.eqCache = {};
    this.handTells = [];
    this.tellStats = {};

    const g = this.game;
    LiveTells.assignPersonalities(g.players);
    g.tellHook = (p, decision) => LiveTells.maybeGenerate(g, p, decision, { freq: this.settings.tellFreq });
    g.on('tell', t => this.onTell(t));
    g.on('update', () => this.render());
    g.on('log', e => this.addLog(e.msg, e.cls));
    g.on('heroTurn', ctx => this.onHeroTurn(ctx));
    g.on('action', e => this.onAction(e));
    g.on('handStart', () => this.onHandStart());
    g.on('handEnd', e => this.onHandEnd(e));

    $('#hand-log').innerHTML = '';
    Review.reset();
    this.addLog(`New session: ${seats.length}-handed, blinds ${sb}/${bb}, ${s.stack}bb stacks.`, 'info');
    this.buildSeats();
    this.render();
    this.renderReads();
    this.setMessage('Press <b>Deal</b> (or N) to start your session.');
    this.setActionsEnabled(false);
  },

  deal() {
    clearTimeout(this.autoTimer);
    if (!this.game.handOver) return;
    Review.close();
    this.setMessage('');
    this.game.startHand();
  },

  /* =================== Table rendering =================== */
  buildSeats() {
    const g = this.game;
    const wrap = $('#seats');
    wrap.innerHTML = g.players.map(p => `
      <div class="seat ${p.isHero ? 'hero' : ''}" id="seat-${p.id}">
        <div class="seat-cards"></div>
        <div class="seat-box">
          <div class="seat-top"><span class="seat-name">${esc(p.name)}</span><span class="pos-badge"></span></div>
          <div class="seat-stack"></div>
          ${p.isHero ? '' : '<button class="type-badge" title="Player type"></button>'}
          <div class="dealer-btn" hidden>D</div>
        </div>
        <div class="seat-action"></div>
        <div class="seat-tell" hidden></div>
      </div>
      <div class="bet-chip" id="bet-${p.id}" hidden></div>`).join('');
    $$('.type-badge', wrap).forEach(b => b.addEventListener('click', () => {
      const id = +b.closest('.seat').id.split('-')[1];
      if (this.revealed.has(id)) this.revealed.delete(id); else this.revealed.add(id);
      this.render();
    }));
    setHTML($('#board'), Array.from({ length: 5 }, (_, i) => `<div class="board-slot" id="board-${i}"></div>`).join(''));
    this.layoutSeats();
  },

  layoutSeats() {
    if (!this.game) return;
    const table = $('#poker-table');
    const portrait = table.clientWidth < 640;
    table.classList.toggle('portrait', portrait);
    const coords = SLOT_COORDS[portrait ? 'portrait' : 'landscape'];
    const slots = SLOTS_FOR_COUNT[this.game.players.length];
    this.game.players.forEach((p, i) => {
      const [x, y] = coords[slots[i]];
      const seat = $('#seat-' + p.id);
      seat.style.left = x + '%';
      seat.style.top = y + '%';
      seat.dataset.side = y > 50 ? 'bottom' : 'top';
      seat.dataset.h = x > 70 ? 'right' : x < 30 ? 'left' : 'center';
      const bx = x + (50 - x) * (portrait ? 0.42 : 0.45);
      const by = y + (48 - y) * (portrait ? 0.38 : 0.45);
      const chip = $('#bet-' + p.id);
      chip.style.left = bx + '%';
      chip.style.top = by + '%';
    });
  },

  render() {
    const g = this.game;
    if (!g) return;
    const s = this.settings;
    const handActive = !g.handOver;
    const toAct = g.players[g.toAct];
    const activeId = handActive && toAct && g.canAct(toAct) && !g.roundComplete() ? toAct.id : -1;

    for (const p of g.players) {
      const seat = $('#seat-' + p.id);
      // Once the hand is over, every opponent's cards are revealed for review.
      const handDone = g.handOver && g.handNum > 0;
      const reveal = p.isHero || p.showCards || handDone || (s.showCards && p.cards.length);
      let cards = '';
      if (p.cards.length && !(p.folded && !p.isHero && !s.showCards && !handDone)) {
        cards = p.cards.map(c => (reveal ? Cards.html(c, p.isHero ? 'lg' : '') : Cards.backHtml(''))).join('');
      }
      setHTML($('.seat-cards', seat), cards);
      $('.pos-badge', seat).textContent = p.position || '';
      $('.seat-stack', seat).textContent = this.fmt(p.stack);
      $('.dealer-btn', seat).hidden = !(p.position === 'BTN' && g.handNum > 0);
      setHTML($('.seat-action', seat), p.lastAction ? esc(p.lastAction.replace(/[\d.]+$/, m => this.fmt(+m))) : '');
      seat.classList.toggle('active', p.id === activeId && !p.isHero);
      seat.classList.toggle('hero-turn', p.id === activeId && p.isHero);
      seat.classList.toggle('folded', p.folded);
      seat.classList.toggle('allin', p.allIn && handActive);
      seat.classList.toggle('winner', g.handOver && g.winners && g.winners.includes(p.id));
      seat.classList.toggle('reveal-cards', !!reveal && !p.isHero);
      seat.classList.toggle('thinking', !!p.thinking && handActive);
      const tellEl = $('.seat-tell', seat);
      const lastTell = handActive || g.handOver ? [...this.handTells].reverse().find(t => t.pid === p.id) : null;
      if (p.thinking && handActive) {
        tellEl.hidden = false;
        setHTML(tellEl, '🤔 Thinking…');
        tellEl.className = 'seat-tell thinking';
      } else if (lastTell && g.handNum === lastTell.handNum) {
        tellEl.hidden = false;
        const stale = lastTell.street !== g.street && handActive;
        const reveal = g.handOver ? (lastTell.honest === null ? ' ?' : lastTell.honest ? ' ✓' : ' ✗') : '';
        tellEl.className = `seat-tell sig-${lastTell.signal}${stale ? ' stale' : ''}${g.handOver ? (lastTell.honest ? ' was-honest' : lastTell.honest === false ? ' was-false' : '') : ''}`;
        tellEl.title = lastTell.text;
        setHTML(tellEl, `👁 ${esc(lastTell.short)}${reveal}`);
      } else {
        tellEl.hidden = true;
      }

      const badge = $('.type-badge', seat);
      if (badge) {
        const prof = PROFILES[p.profile];
        const known = (s.showTypes && !this.hiddenTypes.has(p.id)) || this.revealed.has(p.id);
        badge.textContent = known ? prof.label : '?';
        badge.style.background = known ? prof.color : '';
        badge.classList.toggle('unknown', !known);
        badge.title = known ? `${prof.name} — click to hide` : 'Unknown type — click to reveal';
      }

      const chip = $('#bet-' + p.id);
      chip.hidden = !(p.bet > 0);
      if (p.bet > 0) setHTML(chip, `<span class="chip-icon"></span>${this.fmt(p.bet)}`);
    }

    for (let i = 0; i < 5; i++) setHTML($('#board-' + i), g.board[i] !== undefined ? Cards.html(g.board[i]) : '');
    const potNow = g.handNum ? g.pot - g.players.reduce((a, p) => a + p.bet, 0) : 0;
    setHTML($('#pot'), g.handNum && (handActive || g.pot) ? `Pot <b>${this.fmt(handActive ? g.pot : potNow)}</b>` : '');

    this.renderToolbar();
    this.renderRangeHelper();
    this.renderHandHelper();
    this.renderStats();
    $('#btn-deal').hidden = !g.handOver;
    $('#btn-review').hidden = !g.handOver || !Review.hands.length;
  },

  renderToolbar() {
    const g = this.game, s = this.settings;
    const net = this.stats.net / g.bb;
    $('#arena-info').innerHTML = `
      <span>Hand <b>#${g.handNum}</b></span>
      <span>Blinds <b>$${g.sb}/$${g.bb}</b></span>
      <span>${g.players.length}-handed</span>
      <span>Net <b class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${net.toFixed(1)} bb</b></span>`;
  },

  setMessage(html) { setHTML($('#table-msg'), html); },

  addLog(msg, cls = '') {
    const log = $('#hand-log');
    const div = document.createElement('div');
    div.className = 'log-line ' + cls;
    div.textContent = msg;
    log.appendChild(div);
    while (log.children.length > 400) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  },

  /* =================== Hero actions =================== */
  bindActions() {
    $('#btn-fold').onclick = () => this.heroAction('fold');
    $('#btn-call').onclick = () => this.heroAction('call');
    $('#btn-raise').onclick = () => this.heroAction('raise');
    $('#btn-deal').onclick = () => this.deal();
    $('#btn-review').onclick = () => (Review.isOpen() ? Review.close() : Review.open());
    const slider = $('#raise-slider'), input = $('#raise-input');
    slider.oninput = () => { input.value = slider.value; this.updateRaiseLabel(); };
    input.oninput = () => { slider.value = input.value; this.updateRaiseLabel(); };
    document.addEventListener('keydown', e => {
      if (!document.body.classList.contains('on-arena')) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) && document.activeElement.id !== 'raise-slider') return;
      if (!$('#modal').hidden) return;
      const k = e.key.toLowerCase();
      if (k === 'f') this.heroAction('fold');
      else if (k === 'c' || k === 'k') this.heroAction('call');
      else if (k === 'r' || k === 'b') this.heroAction('raise');
      else if (k === 'n' || (k === ' ' && this.game.handOver)) { e.preventDefault(); this.deal(); }
      else if (k === 'v' && this.game.handOver && Review.hands.length) { if (Review.isOpen()) Review.close(); else Review.open(); }
    });
  },

  setActionsEnabled(on) {
    ['#btn-fold', '#btn-call', '#btn-raise'].forEach(id => { $(id).disabled = !on; });
    $('#sizing').classList.toggle('disabled', !on);
    $('#action-bar').classList.toggle('your-turn', on);
  },

  onHeroTurn(ctx) {
    const g = this.game;
    this.ctx = ctx;
    this.setActionsEnabled(true);
    $('#btn-fold').hidden = ctx.toCall === 0;
    $('#btn-call').innerHTML = (ctx.toCall === 0 ? 'Check' : `Call ${this.fmt(ctx.toCall)}${ctx.toCall >= g.hero.stack ? ' (all-in)' : ''}`) + ' <kbd>C</kbd>';
    $('#btn-raise').hidden = !ctx.canRaise;
    $('#sizing').hidden = !ctx.canRaise;
    if (ctx.canRaise) {
      const slider = $('#raise-slider'), input = $('#raise-input');
      const step = g.sb < 1 ? g.sb : 1;
      for (const el of [slider, input]) { el.min = ctx.minRaiseTo; el.max = ctx.maxRaiseTo; el.step = step; }
      this.renderSizePresets(ctx);
      const def = g.street === 0 ? (g.raiseLevel === 0 ? g.bb * 2.5 : g.currentBet * 3) : g.currentBet === 0 ? ctx.pot * 0.5 : g.currentBet * 3;
      this.setRaise(def);
    }
    const info = ctx.toCall > 0
      ? `Your turn — <b>${this.fmt(ctx.toCall)}</b> to call into a pot of <b>${this.fmt(ctx.pot)}</b> (need ${pct(ctx.toCall / (ctx.pot + ctx.toCall), 0)} equity).`
      : `Your turn — pot is <b>${this.fmt(ctx.pot)}</b>.`;
    setHTML($('#action-info'), info);
    this.renderRangeHelper();
  },

  renderSizePresets(ctx) {
    const g = this.game;
    let presets;
    if (g.street === 0) {
      presets = g.raiseLevel === 0
        ? [['2x', g.bb * 2], ['2.5x', g.bb * 2.5], ['3x', g.bb * 3], ['4x', g.bb * 4]]
        : [['2.5x', g.currentBet * 2.5], ['3x', g.currentBet * 3], ['4x', g.currentBet * 4], ['Pot', g.currentBet + ctx.pot + ctx.toCall]];
    } else {
      const fr = [['⅓', 0.33], ['½', 0.5], ['⅔', 0.66], ['¾', 0.75], ['Pot', 1], ['1.5x', 1.5]];
      presets = fr.map(([l, f]) => [l, g.currentBet === 0 ? ctx.pot * f : g.currentBet + (ctx.pot + ctx.toCall) * f]);
    }
    presets.push(['All-in', ctx.maxRaiseTo]);
    $('#size-presets').innerHTML = presets.map(([l, v]) => `<button class="btn btn-xs" data-v="${v}">${l}</button>`).join('');
    $$('#size-presets button').forEach(b => (b.onclick = () => this.setRaise(+b.dataset.v)));
  },

  setRaise(v) {
    const ctx = this.ctx, g = this.game;
    const step = g.sb < 1 ? g.sb : 1;
    v = Math.round(v / step) * step;
    v = Math.max(ctx.minRaiseTo, Math.min(ctx.maxRaiseTo, v));
    $('#raise-slider').value = v;
    $('#raise-input').value = +v.toFixed(2);
    this.updateRaiseLabel();
  },

  updateRaiseLabel() {
    const ctx = this.ctx;
    if (!ctx) return;
    const v = +$('#raise-input').value;
    const allIn = v >= ctx.maxRaiseTo;
    const word = allIn ? 'All-in' : this.game.currentBet === 0 ? 'Bet' : 'Raise to';
    $('#btn-raise').innerHTML = `${word} ${this.fmt(Math.min(v, ctx.maxRaiseTo))} <kbd>R</kbd>`;
  },

  heroAction(type) {
    const g = this.game;
    if (!g || !g.waitingForHero) return;
    const ctx = this.ctx;
    if (type === 'fold' && ctx.toCall === 0) type = 'check';
    if (type === 'call' && ctx.toCall === 0) type = 'check';
    if (type === 'raise' && !ctx.canRaise) return;
    let amount = 0;
    if (type === 'raise') {
      amount = +$('#raise-input').value || ctx.minRaiseTo;
      amount = Math.max(ctx.minRaiseTo, Math.min(ctx.maxRaiseTo, amount));
    }
    this.setActionsEnabled(false);
    setHTML($('#action-info'), 'Waiting for opponents…');
    g.heroAct({ type, amount });
  },

  /* =================== Hand lifecycle & stats =================== */
  onHandStart() {
    const g = this.game, hero = g.hero;
    this.handState = { startStack: hero.stack + hero.contrib, vpip: false, pfr: false, firstPreflop: true };
    this.handTells = [];
    this.renderReads();
    const code = Cards.handCode(hero.cards[0], hero.cards[1]);
    this.helper = { code, roll: Math.floor(Math.random() * 100), range: this.resolveRange(hero.position) };
    this.lastDiscipline = null;
    this.setActionsEnabled(false);
    setHTML($('#action-info'), 'Dealing…');
  },

  resolveRange(position) {
    const sel = this.settings.rangeSel;
    if (!sel) return null;
    if (sel === 'auto') return RangeStore.byPosition(position);
    return RangeStore.get(sel);
  },

  onAction(e) {
    if (!e.player.isHero || !this.handState) return;
    const hs = this.handState;
    if (e.street === 0) {
      if ((e.type === 'call' && e.toCall > 0) || e.type === 'raise') hs.vpip = true;
      if (e.type === 'raise') hs.pfr = true;
      if (hs.firstPreflop) {
        hs.firstPreflop = false;
        this.checkDiscipline(e);
      }
    }
  },

  checkDiscipline(e) {
    const h = this.helper;
    if (!h || !h.range) return;
    const f = handFreq(h.range, h.code);
    const target = actionForRoll(f, h.roll);
    const did = e.type === 'raise' ? 'raise' : e.type === 'fold' ? 'fold' : 'call';
    // Checking for free when the range says fold is fine (e.g. BB option).
    const followed = did === target || (target === 'fold' && e.type === 'check');
    this.stats.decisions++;
    if (followed) this.stats.followed++;
    this.lastDiscipline = { followed, target, did: e.type === 'check' ? 'check' : did };
    this.addLog(followed ? `✓ Range followed (${target.toUpperCase()} on roll ${h.roll})` : `✗ Deviated: range said ${target.toUpperCase()} on roll ${h.roll}, you chose ${did.toUpperCase()}`, followed ? 'good' : 'bad');
  },

  onHandEnd(e) {
    const g = this.game, hero = g.hero, hs = this.handState;
    this.setActionsEnabled(false);
    this.ctx = null;
    if (hs) {
      const delta = hero.stack - hs.startStack;
      this.stats.hands++;
      this.stats.net += delta;
      if (hs.vpip) this.stats.vpip++;
      if (hs.pfr) this.stats.pfr++;
      if (e.showdown && !hero.folded) {
        this.stats.wtsd++;
        if (e.results.some(r => r.player.isHero)) this.stats.wsd++;
      }
    }
    const msg = e.results.map(r => {
      const who = r.player.isHero ? 'You win' : `${esc(r.player.name)} wins`;
      return `<div class="${r.player.isHero ? 'win-hero' : ''}">${who} ${this.fmt(r.amount)}${r.hand ? ` — ${r.hand}` : ''}</div>`;
    }).join('');
    this.setMessage(msg);
    Review.addHand(e.history, this.helper);
    for (const t of this.handTells) {
      const st = this.tellStats[t.pid] = this.tellStats[t.pid] || { shown: 0, honest: 0, false: 0, unclear: 0 };
      st.shown++;
      if (t.honest === null) st.unclear++; else if (t.honest) st.honest++; else st.false++;
    }
    this.renderReads();
    const heroActed = e.history && e.history.actions.some(x => x.pid === hero.id);
    const reviewing = this.settings.autoReview && heroActed;
    setHTML($('#action-info'), reviewing ? 'Hand over — review your decisions below, then deal the next hand.'
      : this.settings.autoDeal ? 'Next hand coming up… (press N to deal now, V to review)' : 'Hand over — press <b>Deal</b> for the next hand or <b>Review hand</b>.');
    this.render();
    if (reviewing) Review.open();
    else if (this.settings.autoDeal) {
      const wait = Math.max(1600, g.delay * 3.2);
      this.autoTimer = setTimeout(() => this.deal(), wait);
    }
  },

  /* =================== Tells =================== */
  onTell(t) {
    this.handTells.push(t);
    this.addLog(`👁 ${t.text}`, 'tell');
    this.renderReads();
    this.render();
  },

  renderReads() {
    const body = $('#reads-body');
    if (!body || !this.game) return;
    const g = this.game, s = this.settings;
    if (s.tellFreq === 'off') { setHTML(body, '<p class="hint">Opponent tells are turned off in Table Setup.</p>'); return; }
    const done = g.handOver;
    const items = this.handTells.map(t => {
      const p = g.players[t.pid];
      const prof = PROFILES[p.profile];
      const known = (s.showTypes && !this.hiddenTypes.has(p.id)) || this.revealed.has(p.id);
      const hint = s.tellHints ? `<div class="read-hint">${LiveTells.meaningLabel(t.signal)} · reliability ${t.reliability}</div>` : '';
      const outcome = done ? `<div class="read-outcome ${t.honest === null ? 'muted' : t.honest ? 'good' : 'bad'}">${t.honest === null ? '?' : t.honest ? '✓' : '✗'} ${LiveTells.verdictLabel(t)} — held ${esc(t.truth.label)}</div>` : '';
      return `<div class="read-item sig-${t.signal}">
        <div class="read-head"><span class="tag">${STREET_NAMES[t.street]}</span><b>${esc(p.name)}</b>${known ? `<span class="type-badge" style="background:${prof.color}">${prof.label}</span>` : ''}</div>
        <div class="read-text">${esc(t.text)}</div>${hint}${outcome}</div>`;
    }).join('');
    const record = g.players.filter(p => !p.isHero && this.tellStats[p.id]).map(p => {
      const st = this.tellStats[p.id];
      return `<div class="read-record"><span>${esc(p.name)}</span><span><b class="good">${st.honest}</b> honest · <b class="bad">${st.false}</b> false${st.unclear ? ` · ${st.unclear} unclear` : ''}</span></div>`;
    }).join('');
    setHTML(body, `
      ${items || `<p class="hint">${done ? 'No tells this hand.' : 'Watch for tells as opponents act. They\'re randomized — sometimes honest, sometimes not — so weigh them against range, position and bet sizing.'}</p>`}
      ${record ? `<div class="read-records"><span class="label">Tell record (completed hands)</span>${record}</div>` : ''}`);
  },

  renderStats() {
    const st = this.stats, g = this.game;
    if (!st) return;
    const bbNet = st.net / g.bb;
    const p = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
    setHTML($('#session-stats'), `
      <div><span>Hands</span><b>${st.hands}</b></div>
      <div><span>Net</span><b class="${bbNet >= 0 ? 'pos' : 'neg'}">${bbNet >= 0 ? '+' : ''}${bbNet.toFixed(1)} bb</b></div>
      <div><span>bb / 100</span><b>${st.hands ? ((bbNet / st.hands) * 100).toFixed(1) : '—'}</b></div>
      <div><span>Buy-ins</span><b>${g.hero.buyins}</b></div>
      <div><span>VPIP</span><b>${p(st.vpip, st.hands)}</b></div>
      <div><span>PFR</span><b>${p(st.pfr, st.hands)}</b></div>
      <div><span>WTSD</span><b>${st.wtsd}</b></div>
      <div><span>W$SD</span><b>${p(st.wsd, st.wtsd)}</b></div>
      <div class="wide"><span>Range discipline</span><b>${st.decisions ? `${st.followed}/${st.decisions} (${p(st.followed, st.decisions)})` : '—'}</b></div>`);
  },

  /* =================== Range helper =================== */
  bindRangeHelper() {
    $('#rh-select').onchange = e => {
      this.settings.rangeSel = e.target.value;
      this.saveSettings();
      if (this.helper && this.game) this.helper.range = this.resolveRange(this.game.hero.position);
      this.renderRangeHelper();
    };
    const sug = $('#rh-show-suggestion');
    sug.checked = this.settings.showSuggestion;
    sug.onchange = () => { this.settings.showSuggestion = sug.checked; this.saveSettings(); this.renderRangeHelper(); };
    this.renderRangeHelperOptions();
  },

  renderRangeHelperOptions() {
    const sel = $('#rh-select');
    sel.innerHTML = `<option value="">Off</option><option value="auto">Auto — match my position</option>` +
      RangeStore.ranges.map(r => `<option value="${r.id}">${esc(r.name)}${r.position ? ' (' + r.position + ')' : ''}</option>`).join('');
    const v = this.settings.rangeSel;
    sel.value = [...sel.options].some(o => o.value === v) ? v : 'auto';
    if (this.helper && this.game) this.helper.range = this.resolveRange(this.game.hero.position);
    this.renderRangeHelper();
  },

  renderRangeHelper() {
    const body = $('#rh-body');
    const g = this.game, h = this.helper;
    if (!this.settings.rangeSel) { setHTML(body, '<p class="hint">Pick a range to see your hand\'s frequencies and an RNG roll every hand.</p>'); return; }
    if (!g || !h || !g.handNum) { setHTML(body, '<p class="hint">Your range info appears here once cards are dealt.</p>'); return; }
    const pos = g.hero.position;
    if (!h.range) {
      setHTML(body, `<div class="rh-hand"><b>${h.code}</b><span class="pos-badge">${pos}</span></div><p class="hint">No saved range tagged <b>${pos}</b>. Tag one in the Range Builder or pick a range above.</p>`);
      return;
    }
    const f = handFreq(h.range, h.code);
    const target = actionForRoll(f, h.roll);
    const show = this.settings.showSuggestion;
    const d = this.lastDiscipline;
    setHTML(body, `
      <div class="rh-range-name">${esc(h.range.name)}</div>
      <div class="rh-hand">
        <div class="rh-code"><b>${h.code}</b><span class="pos-badge">${pos}</span></div>
        <div class="rh-roll" title="Random number 0-99. Raise if below raise %, then call, then fold."><span>RNG</span><b>${h.roll}</b></div>
      </div>
      ${freqBarHtml(f)}
      ${show ? `<div class="rh-suggest act-${target}">RNG says: <b>${target === 'call' ? (pos === 'SB' && h.range.position === 'SB' ? 'CALL / LIMP' : 'CALL') : target.toUpperCase()}</b></div>` : ''}
      ${d ? `<div class="rh-result ${d.followed ? 'good' : 'bad'}">${d.followed ? '✓ You followed your range' : `✗ You ${d.did === 'check' ? 'checked' : d.did === 'raise' ? 'raised' : d.did === 'call' ? 'called' : 'folded'}; range said ${d.target}`}</div>` : ''}
      <div class="range-grid mini" id="rh-grid"></div>`);
    renderRangeGrid($('#rh-grid'), h.range.hands, { mini: true, highlight: h.code });
  },

  /* =================== Hand helper =================== */
  renderHandHelper() {
    if (!this.settings.showEquity) return;
    const g = this.game, hero = g.hero;
    const body = $('#hh-body');
    if (!g.handNum || !hero.cards.length) { setHTML(body, '<p class="hint">Equity and pot odds show here during a hand.</p>'); return; }
    const opps = g.players.filter(p => !p.folded && !p.isHero).length;
    let html = '';
    if (g.board.length >= 3) {
      html += `<div class="hh-made">${describeHand(evaluateHand([...hero.cards, ...g.board]))}</div>`;
    } else {
      html += `<div class="hh-made">${Cards.handCode(hero.cards[0], hero.cards[1])} · top ${pct(HAND_PERCENTILE[Cards.handCode(hero.cards[0], hero.cards[1])], 0)} of hands</div>`;
    }
    if (!hero.folded && opps > 0) {
      const key = hero.cards.join() + '|' + g.board.join() + '|' + opps;
      if (this.eqCache[key] === undefined) {
        this.eqCache = { [key]: equityVsRandom(hero.cards, g.board, opps, 1500) };
      }
      const eq = this.eqCache[key];
      html += `<div class="hh-row"><span>Equity vs ${opps} random hand${opps > 1 ? 's' : ''}</span><b>${pct(eq)}</b></div>
        <div class="eq-bar"><div style="width:${eq * 100}%"></div></div>`;
      if (this.ctx && this.ctx.toCall > 0 && g.waitingForHero) {
        const need = this.ctx.toCall / (this.ctx.pot + this.ctx.toCall);
        html += `<div class="hh-row"><span>Pot odds — equity needed</span><b>${pct(need)}</b></div>`;
      }
      if (g.street >= 1) {
        const eff = Math.min(hero.stack, Math.max(...g.players.filter(p => !p.folded && !p.isHero).map(p => p.stack)));
        html += `<div class="hh-row"><span>SPR</span><b>${(eff / Math.max(1, g.pot)).toFixed(1)}</b></div>`;
      }
      html += '<p class="hint">Real opponents\' ranges are stronger than random, especially when they bet or raise.</p>';
    } else if (hero.folded) {
      html += '<p class="hint">You folded this hand.</p>';
    }
    setHTML(body, html);
  },
};
