'use strict';
/* Tournament Style: a single-table, WSOP-style freezeout. No rebuys — run out of chips and you're
 * eliminated. Blinds rise every N orbits of the button. Opponents are modeled on famous pros. */

/* Opponent roster. Styles are simplified caricatures based on each player's public reputation
 * (TV coverage, interviews and poker media) — a tribute, not real player data. */
const PRO_ROSTER = [
  { name: 'Phil Ivey', short: 'Ivey', type: 'LAG', note: 'Elite all-rounder who can play any two cards.', tune: { vpip: 0.3, pfr: 0.25, aggression: 0.75, bluff: 0.28 } },
  { name: 'Daniel Negreanu', short: 'Negreanu', type: 'LAG', note: '"Kid Poker" — small-ball: plays lots of pots with small bets and reads.', tune: { vpip: 0.34, pfr: 0.24, sizing: [0.3, 0.5], openSize: 2.2, bluff: 0.24, sticky: 0.05 } },
  { name: 'Phil Hellmuth', short: 'Hellmuth', type: 'TAG', note: '"The Poker Brat" — record WSOP bracelet holder, patient and tight.', tune: { vpip: 0.19, pfr: 0.15, bluff: 0.12, sticky: -0.02 } },
  { name: 'Tom Dwan', short: 'Dwan', type: 'LAG', note: '"durrrr" — fearless high-stakes aggression and big bluffs.', tune: { vpip: 0.36, pfr: 0.3, threeBet: 0.13, bluff: 0.35, sizing: [0.6, 1.2] } },
  { name: 'Gus Hansen', short: 'Hansen', type: 'MANIAC', note: '"The Great Dane" — pioneered the loose, unpredictable TV style.', tune: { vpip: 0.55, pfr: 0.42, bluff: 0.42 } },
  { name: 'Viktor Blom', short: 'Isildur1', type: 'MANIAC', note: '"Isildur1" — hyper-aggressive, huge bets and bluffs.', tune: { vpip: 0.6, pfr: 0.48, bluff: 0.5, sizing: [0.8, 1.4] } },
  { name: 'Vanessa Selbst', short: 'Selbst', type: 'LAG', note: 'Hyper-aggressive pressure and fearless 3-betting (~40% of hands).', tune: { vpip: 0.4, pfr: 0.33, threeBet: 0.16, bluff: 0.36 } },
  { name: 'Johnny Chan', short: 'Chan', type: 'TAG', note: '"The Orient Express" — back-to-back Main Event champ, aggressive with sharp reads.', tune: { aggression: 0.72, bluff: 0.18 } },
  { name: 'Dan Harrington', short: 'Harrington', type: 'NIT', note: '"Action Dan" — the nickname is ironic: famously tight, solid starting standards.', tune: { vpip: 0.14, pfr: 0.11, bluff: 0.07 } },
  { name: 'Fedor Holz', short: 'Holz', type: 'REG', note: 'High-roller technician — balanced, ICM-aware tournament play.', tune: {} },
  { name: 'Doyle Brunson', short: 'Brunson', type: 'LAG', note: '"Texas Dolly" — Super/System author and godfather of aggressive poker.', tune: { vpip: 0.3, pfr: 0.24, sizing: [0.6, 1.0], bluff: 0.25 } },
  { name: 'Mike Matusow', short: 'Matusow', type: 'TAG', note: '"The Mouth" — loud table talk, says he plays tight-aggressive, prone to blow-ups.', tune: { vpip: 0.23, pfr: 0.18, bluff: 0.2, sticky: 0.04 } },
  { name: 'Erik Seidel', short: 'Seidel', type: 'TAG', note: 'Quiet, precise tournament legend.', tune: { vpip: 0.21, pfr: 0.17 } },
  { name: 'Stu Ungar', short: 'Ungar', type: 'LAG', note: 'Three-time Main Event champ known for aggression and uncanny reads.', tune: { vpip: 0.33, pfr: 0.27, aggression: 0.82 } },
];

/* Fictional amateurs for a "mixed field" — the satellite qualifiers every big event has. */
const AMATEUR_ROSTER = [
  { name: 'Satellite Sam', short: 'Sat. Sam', type: 'FISH', note: 'Won his seat in a $50 satellite. Loves to limp.', tune: {} },
  { name: 'Calling Carla', short: 'Carla', type: 'STATION', note: '"I just want to see one more card."', tune: {} },
  { name: 'Lucky Lou', short: 'Lucky Lou', type: 'FISH', note: 'Any two suited cards can win!', tune: {} },
  { name: 'Weekend Warren', short: 'Warren', type: 'STATION', note: 'Plays every Saturday, never folds a pair.', tune: {} },
  { name: 'Online Ollie', short: 'Ollie', type: 'MANIAC', note: 'Grinds turbos online, shoves a lot.', tune: {} },
];

/* Blind multipliers per level relative to the starting blinds. */
const BLIND_FACTORS = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 30, 40, 50, 60, 80, 100, 120, 160, 200, 250, 300, 400, 500, 600, 800, 1000];
const PAYOUTS = { 2: [1], 3: [1], 4: [0.65, 0.35], 5: [0.65, 0.35], 6: [0.65, 0.35], 7: [0.5, 0.3, 0.2], 8: [0.5, 0.3, 0.2], 9: [0.5, 0.3, 0.2] };
const BUY_IN = 1000;

const TOURNEY_DEFAULTS = {
  players: 6, chips: 10000, blinds: '50/100', orbits: 2, field: 'pros', speed: 'normal',
  showTypes: true, showCards: false, showEquity: true, inBB: true, autoDeal: true, autoReview: false, fourColor: false,
  rangeSel: 'auto', showSuggestion: true, tellFreq: 'normal', tellHints: true,
};

const Tournament = Object.assign(Object.create(Arena), {
  tabClass: 'on-tournament',
  settingsKey: 'nlh.tourney.settings',
  defaults: TOURNEY_DEFAULTS,

  /** Clones the Practice Arena's table UI into the Tournament tab (must run before Arena.init). */
  prepareDom() {
    const section = $('#tab-tournament');
    const layout = $('#tab-arena .arena-layout').cloneNode(true);
    section.appendChild(layout);
    this.root = section;

    const setup = this.$('#arena-setup');
    setup.hidden = false;
    setup.innerHTML = `
      <div class="setup-grid">
        <label>Players <b id="t-players-val"></b><input type="range" id="t-players" min="2" max="9" step="1"></label>
        <label>Starting chips
          <select id="t-chips"><option value="5000">5,000</option><option value="10000">10,000</option><option value="20000">20,000</option><option value="40000">40,000</option></select>
        </label>
        <label>Starting blinds
          <select id="t-blinds"><option value="25/50">25 / 50</option><option value="50/100">50 / 100</option><option value="100/200">100 / 200</option><option value="200/400">200 / 400</option></select>
        </label>
        <label>Blinds go up every
          <select id="t-orbits"><option value="1">1 orbit (turbo)</option><option value="2">2 orbits</option><option value="3">3 orbits</option><option value="4">4 orbits</option><option value="5">5 orbits (deep)</option></select>
        </label>
        <label>Field
          <select id="t-field"><option value="pros">Famous pros only</option><option value="mixed">Mixed (pros + amateur qualifiers)</option></select>
        </label>
        <label>AI speed
          <select id="set-speed"><option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option><option value="instant">Instant</option></select>
        </label>
      </div>
      <p class="hint" id="t-structure"></p>
      <h4>Display &amp; training</h4>
      <div class="toggle-grid">
        <label><input type="checkbox" id="set-show-types"> Show opponent styles</label>
        <label><input type="checkbox" id="set-show-cards"> Reveal all hole cards (training)</label>
        <label><input type="checkbox" id="set-show-equity"> Show my equity &amp; pot odds</label>
        <label><input type="checkbox" id="set-in-bb"> Show amounts in big blinds</label>
        <label><input type="checkbox" id="set-auto-deal"> Auto-deal next hand</label>
        <label><input type="checkbox" id="set-auto-review"> Open hand review after each hand</label>
        <label><input type="checkbox" id="set-tell-hints"> Show what each tell usually means</label>
        <label><input type="checkbox" id="set-four-color"> Four-color deck</label>
        <label class="select-toggle">Opponent tells
          <select id="set-tell-freq"><option value="off">Off</option><option value="low">Rare</option><option value="normal">Normal</option><option value="high">Frequent</option></select>
        </label>
      </div>
      <div class="btn-row"><button class="btn btn-primary" id="set-apply">Start new tournament</button></div>`;
    this.$('#arena-setup-toggle').textContent = '⚙ Tournament Setup';
    this.$('#arena-new-session').textContent = 'Restart';

    // Final standings panel (shown when the hero busts or wins).
    const final = document.createElement('div');
    final.className = 'panel t-final';
    final.id = 't-final';
    final.hidden = true;
    this.$('.table-wrap').before(final);

    // Tournament status + live leaderboard at the top of the side column.
    const side = this.$('.arena-side');
    side.insertAdjacentHTML('afterbegin', `
      <div class="panel" id="t-status-panel"><div class="panel-head"><h3>Tournament</h3></div><div id="t-status"></div></div>
      <div class="panel" id="t-board-panel"><div class="panel-head"><h3>Leaderboard</h3></div><div id="t-board"></div></div>`);
  },

  init() {
    this.root = $('#tab-tournament');
    // Own instance state (otherwise these would be read from Arena through the prototype chain).
    Object.assign(this, {
      game: null, t: null, stats: null, handState: null, helper: null, lastDiscipline: null, ctx: null,
      eqCache: {}, handTells: [], tellStats: {}, hiddenTypes: new Set(), revealed: new Set(), autoTimer: null,
    });
    Arena.init.call(this);
  },

  /* =================== Setup =================== */
  bindSetup() {
    const s = this.settings;
    this.$('#arena-setup-toggle').onclick = () => { this.$('#arena-setup').hidden = !this.$('#arena-setup').hidden; };
    const pl = this.$('#t-players');
    pl.value = s.players;
    const showPlayers = () => { this.$('#t-players-val').textContent = `${pl.value}${+pl.value === 9 ? ' (full table)' : +pl.value === 2 ? ' (heads-up)' : ''}`; };
    pl.oninput = () => { showPlayers(); this.renderStructure(); };
    showPlayers();
    this.$('#t-chips').value = s.chips;
    this.$('#t-blinds').value = s.blinds;
    this.$('#t-orbits').value = s.orbits;
    this.$('#t-field').value = s.field;
    this.$('#set-speed').value = s.speed;
    for (const id of ['#t-chips', '#t-blinds', '#t-orbits']) this.$(id).onchange = () => this.renderStructure();
    const toggles = { 'set-show-types': 'showTypes', 'set-show-cards': 'showCards', 'set-show-equity': 'showEquity', 'set-in-bb': 'inBB', 'set-auto-deal': 'autoDeal', 'set-auto-review': 'autoReview', 'set-four-color': 'fourColor' };
    for (const [id, key] of Object.entries(toggles)) {
      const box = this.$('#' + id);
      box.checked = !!s[key];
      box.onchange = () => { s[key] = box.checked; this.saveSettings(); this.applyDisplaySettings(); };
    }
    this.$('#set-tell-freq').value = s.tellFreq;
    this.$('#set-tell-freq').onchange = e => { s.tellFreq = e.target.value; this.saveSettings(); };
    this.$('#set-tell-hints').checked = s.tellHints;
    this.$('#set-tell-hints').onchange = e => { s.tellHints = e.target.checked; this.saveSettings(); this.renderReads(); };
    this.$('#set-speed').onchange = e => { s.speed = e.target.value; this.saveSettings(); if (this.game) this.game.speed = s.speed; };
    this.$('#set-apply').onclick = () => {
      Object.assign(s, {
        players: +pl.value, chips: +this.$('#t-chips').value, blinds: this.$('#t-blinds').value,
        orbits: +this.$('#t-orbits').value, field: this.$('#t-field').value,
      });
      this.saveSettings();
      this.$('#arena-setup').hidden = true;
      this.startSession();
    };
    this.$('#arena-new-session').onclick = () => {
      showModal('Restart the tournament?', '<p>Your current tournament will be abandoned.</p>', [
        { label: 'Cancel' },
        { label: 'Restart', cls: 'btn-primary', onClick: () => this.startSession() },
      ]);
    };
    this.renderStructure();
    this.applyDisplaySettings();
  },

  renderStructure() {
    const [sb, bb] = this.$('#t-blinds').value.split('/').map(Number);
    const chips = +this.$('#t-chips').value;
    const orbits = +this.$('#t-orbits').value;
    const lv = BLIND_FACTORS.slice(0, 6).map(f => `${sb * f}/${bb * f}`).join(' → ');
    this.$('#t-structure').innerHTML = `Starting stack <b>${(chips / bb).toFixed(0)}bb</b>. Levels: ${lv} → … Blinds rise every <b>${orbits}</b> orbit${orbits > 1 ? 's' : ''} of the button (≈${orbits * +this.$('#t-players').value} hands at a full table).`;
  },

  /* =================== Session =================== */
  createGame() {
    const s = this.settings;
    const [sb, bb] = s.blinds.split('/').map(Number);
    const pros = Cards.shuffle(PRO_ROSTER.slice());
    const ams = Cards.shuffle(AMATEUR_ROSTER.slice());
    const picks = [];
    for (let i = 0; i < s.players - 1; i++) {
      const amateur = s.field === 'mixed' && ams.length && (Math.random() < 0.35 || (i === s.players - 2 && !picks.some(p => AMATEUR_ROSTER.includes(p))));
      picks.push(amateur ? ams.pop() : pros.pop() || ams.pop());
    }
    const seats = [{ name: 'You', isHero: true }, ...picks.map(r => ({ name: r.short, profile: r.type }))];
    const g = new PokerGame({ seats, sb, bb, stack: s.chips, speed: s.speed, rebuy: false });
    picks.forEach((r, i) => {
      const p = g.players[i + 1];
      p.roster = r;
      p.fullName = r.name;
      p.styleProfile = Object.assign({}, PROFILES[r.type], r.tune);
    });
    g.players[0].fullName = 'You';
    this.base = { sb, bb };
    this.t = {
      level: 0, handsInLevel: 0, levelHands: s.orbits * s.players, finish: [], over: false,
      field: s.players, peak: s.chips, prizePool: s.players * BUY_IN,
    };
    this.sessionIntro = `Tournament: ${s.players} players, ${s.chips.toLocaleString()} chips, blinds ${sb}/${bb}, up every ${s.orbits} orbit${s.orbits > 1 ? 's' : ''}.`;
    return g;
  },

  startSession() {
    Arena.startSession.call(this);
    this.$('#t-final').hidden = true;
    this.$('#t-final').innerHTML = '';
    this.setMessage('Shuffle up and deal! Press <b>Deal</b> (or N) to start.');
    this.render();
  },

  blindsFor(level) {
    const f = BLIND_FACTORS[Math.min(level, BLIND_FACTORS.length - 1)];
    return { sb: this.base.sb * f, bb: this.base.bb * f };
  },

  remaining() { return this.game.players.filter(p => !p.place); },

  /** Raises the blinds when the level's hands are used up. */
  levelCheck(silent = false) {
    const t = this.t, g = this.game;
    if (t.handsInLevel >= t.levelHands) {
      t.level++;
      const { sb, bb } = this.blindsFor(t.level);
      g.sb = sb;
      g.bb = bb;
      g.minRaise = bb;
      t.handsInLevel = 0;
      t.levelHands = this.settings.orbits * this.remaining().length;
      if (!silent) this.addLog(`⏫ Level ${t.level + 1}: blinds ${sb.toLocaleString()} / ${bb.toLocaleString()}`, 'hand-sep');
    }
    t.handsInLevel++;
  },

  deal() {
    if (!this.t || this.t.over || !this.game.handOver) return;
    this.levelCheck();
    Arena.deal.call(this);
  },

  onHandEnd(e) {
    Arena.onHandEnd.call(this, e);
    const hero = this.game.hero;
    this.t.peak = Math.max(this.t.peak, hero.stack);
    this.eliminate(e, false);
    this.render();
  },

  /** Marks busted players out, assigns finishing places and checks for the end of the tournament. */
  eliminate(e, silent) {
    const g = this.game, t = this.t;
    const busted = g.players.filter(p => !p.place && p.stack <= 0);
    if (busted.length) {
      const before = this.remaining().length;
      const startStack = id => (e.history ? e.history.players[id].startStack : 0);
      busted.sort((a, b) => startStack(a.id) - startStack(b.id));
      const top = e.results.slice().sort((a, b) => b.amount - a.amount)[0];
      busted.forEach((p, i) => {
        p.place = before - i;
        p.out = true;
        const by = top ? top.player.fullName || top.player.name : '';
        t.finish.push({ id: p.id, name: p.fullName || p.name, profile: p.profile, place: p.place, hand: g.handNum, level: t.level + 1, by });
        if (!silent) this.addLog(`💀 ${p.isHero ? 'You are' : (p.fullName || p.name) + ' is'} eliminated in ${ordinal(p.place)} place${by ? ` by ${by}` : ''}.`, p.isHero ? 'bad' : 'info');
      });
    }
    const left = this.remaining();
    if (left.length === 1) {
      const w = left[0];
      w.place = 1;
      t.finish.push({ id: w.id, name: w.fullName || w.name, profile: w.profile, place: 1, hand: g.handNum, level: t.level + 1, by: '' });
    }
    if (silent) return;
    if (g.hero.place) this.endTournament();
  },

  endTournament() {
    const t = this.t;
    t.over = true;
    clearTimeout(this.autoTimer);
    this.setActionsEnabled(false);
    // The hero is out: play out the rest of the tournament instantly to settle every place.
    if (this.remaining().length > 1) this.simulateRest();
    this.showFinal();
  },

  simulateRest() {
    const g = this.game;
    const saved = g.handlers;
    const savedLater = g.later;
    const savedHook = g.tellHook;
    const queue = [];
    g.gen++;
    g.timers.forEach(clearTimeout);
    g.timers = [];
    g.handlers = { handEnd: [e => this.eliminate(e, true)] };
    g.tellHook = null;
    g.later = fn => queue.push(fn);
    let guard = 0;
    while (this.remaining().length > 1 && guard++ < 5000) {
      this.levelCheck(true);
      g.startHand();
      let steps = 0;
      while (queue.length && steps++ < 5000) queue.shift()();
    }
    g.handlers = saved;
    g.later = savedLater;
    g.tellHook = savedHook;
    this.render();
  },

  showFinal() {
    const t = this.t, g = this.game;
    const heroPlace = g.hero.place;
    const payouts = PAYOUTS[t.field] || [1];
    const prize = place => (place <= payouts.length ? Math.round(t.prizePool * payouts[place - 1]) : 0);
    const heroRow = t.finish.find(f => f.id === g.hero.id);
    const rows = t.finish.slice().sort((a, b) => a.place - b.place).map(f => {
      const p = g.players[f.id];
      const prof = PROFILES[f.profile];
      const money = prize(f.place);
      return `<tr class="${p.isHero ? 'lb-hero' : ''}">
        <td class="lb-place">${f.place === 1 ? '🏆' : ordinal(f.place)}</td>
        <td><b>${esc(f.name)}</b>${p.roster ? `<div class="muted small">${esc(p.roster.note)}</div>` : ''}</td>
        <td>${p.isHero ? '—' : `<span class="type-badge" style="background:${prof.color}">${prof.label}</span>`}</td>
        <td>${f.place === 1 ? '<span class="good">Winner</span>' : f.by ? esc(f.by) : '—'}</td>
        <td>#${f.hand} · L${f.level}</td>
        <td>${money ? `<b class="good">$${money.toLocaleString()}</b>` : '<span class="muted">—</span>'}</td>
      </tr>`;
    }).join('');
    const won = heroPlace === 1;
    const itm = prize(heroPlace) > 0;
    const st = this.stats;
    const p = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
    const panel = this.$('#t-final');
    panel.innerHTML = `
      <div class="t-final-head ${won ? 'won' : itm ? 'itm' : 'lost'}">
        <div class="t-final-place">${won ? '🏆' : ordinal(heroPlace)}</div>
        <div>
          <h2>${won ? 'You won the tournament!' : itm ? `You finished ${ordinal(heroPlace)} — in the money!` : `You finished ${ordinal(heroPlace)} of ${t.field}`}</h2>
          <p>${won ? `You outlasted all ${t.field - 1} opponents and took down $${prize(1).toLocaleString()}.` : `Eliminated by <b>${esc(heroRow.by || 'the field')}</b> on hand #${heroRow.hand} (level ${heroRow.level}).`}
          ${itm && !won ? ` You win $${prize(heroPlace).toLocaleString()}.` : ''}</p>
        </div>
      </div>
      <div class="stats-grid t-final-stats">
        <div><span>Hands played</span><b>${st.hands}</b></div>
        <div><span>Peak chips</span><b>${t.peak.toLocaleString()}</b></div>
        <div><span>Level reached</span><b>${heroRow.level}</b></div>
        <div><span>VPIP / PFR</span><b>${p(st.vpip, st.hands)} / ${p(st.pfr, st.hands)}</b></div>
        <div><span>Showdowns won</span><b>${st.wsd}/${st.wtsd}</b></div>
        <div><span>Prize pool</span><b>$${t.prizePool.toLocaleString()}</b></div>
      </div>
      <h3>Final standings</h3>
      <div class="lb-wrap"><table class="data-table leaderboard">
        <tr><th>Place</th><th>Player</th><th>Style</th><th>Knocked out by</th><th>Hand</th><th>Prize</th></tr>${rows}
      </table></div>
      <p class="hint">Places after your elimination were played out instantly by the remaining AI players. Pros' names are used as a tribute; their styles are simplified caricatures based on public reputation.</p>
      <div class="btn-row">
        <button class="btn btn-primary" id="t-again">▶ Play again</button>
        <button class="btn" id="t-change">⚙ Change setup</button>
      </div>`;
    panel.hidden = false;
    this.$('#t-again').onclick = () => this.startSession();
    this.$('#t-change').onclick = () => { this.$('#arena-setup').hidden = false; this.$('#arena-setup').scrollIntoView({ behavior: 'smooth' }); };
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.setMessage(won ? '🏆 Champion!' : `Eliminated — ${ordinal(heroPlace)} place`);
  },

  /* =================== Rendering =================== */
  render() {
    Arena.render.call(this);
    if (!this.game || !this.t) return;
    for (const p of this.game.players) {
      const badge = this.$('#seat-' + p.id + ' .type-badge');
      if (badge && p.roster && !badge.classList.contains('unknown')) badge.title = `${p.fullName} — ${p.roster.note}`;
    }
    this.renderTourney();
  },

  renderToolbar() {
    const g = this.game, t = this.t;
    if (!t) return;
    const hero = g.hero;
    const left = this.remaining();
    const rank = left.slice().sort((a, b) => b.stack - a.stack).indexOf(hero) + 1;
    this.$('#arena-info').innerHTML = `
      <span>Hand <b>#${g.handNum}</b></span>
      <span>Level <b>${t.level + 1}</b> · <b>${g.sb.toLocaleString()}/${g.bb.toLocaleString()}</b></span>
      <span>Players <b>${left.length}/${t.field}</b></span>
      <span>Your chips <b>${hero.place && hero.place > 1 ? 'Out' : hero.stack.toLocaleString()}</b>${rank ? ` (${ordinal(rank)})` : ''}</span>`;
  },

  renderTourney() {
    const g = this.game, t = this.t;
    const left = this.remaining();
    const hero = g.hero;
    const handsToGo = Math.max(0, t.levelHands - t.handsInLevel);
    const next = this.blindsFor(t.level + 1);
    const avg = left.reduce((s, p) => s + p.stack, 0) / Math.max(1, left.length);
    const heroIn = !hero.place || hero.place === 1;
    const m = heroIn ? hero.stack / (g.sb + g.bb) : 0;
    setHTML(this.$('#t-status'), `
      <div class="stats-grid">
        <div><span>Level</span><b>${t.level + 1}</b></div>
        <div><span>Blinds</span><b>${g.sb.toLocaleString()}/${g.bb.toLocaleString()}</b></div>
        <div><span>Next level</span><b>${t.over ? '—' : `${handsToGo} hand${handsToGo === 1 ? '' : 's'}`}</b><small>${next.sb.toLocaleString()}/${next.bb.toLocaleString()}</small></div>
        <div><span>Players left</span><b>${left.length} / ${t.field}</b></div>
        <div><span>Avg stack</span><b>${(avg / g.bb).toFixed(0)}bb</b></div>
        <div><span>Your stack</span><b>${heroIn ? (hero.stack / g.bb).toFixed(1) + 'bb' : 'Out'}</b><small>${heroIn ? `M = ${m.toFixed(1)}` : ''}</small></div>
      </div>
      ${heroIn && !t.over && m < 10 ? `<p class="hint ${m < 6 ? 'bad' : ''}">${m < 6 ? 'Danger zone (M < 6): it\'s push-or-fold time.' : 'Short stack (M < 10): look for good spots to shove or re-shove.'}</p>` : ''}`);
    const ranked = g.players.filter(p => !p.place || p.place === 1).sort((a, b) => b.stack - a.stack);
    const out = t.finish.filter(f => f.place > 1).sort((a, b) => a.place - b.place);
    const nameOf = p => esc(p.fullName || p.name);
    setHTML(this.$('#t-board'), `
      <ol class="t-board">${ranked.map((p, i) => `<li class="${p.isHero ? 'lb-hero' : ''}"><span class="t-rank">${i + 1}</span><span class="t-name">${nameOf(p)}</span><span class="t-chips">${p.stack.toLocaleString()} <small>${(p.stack / g.bb).toFixed(0)}bb</small></span></li>`).join('')}</ol>
      ${out.length ? `<div class="t-out"><span class="label">Eliminated</span>${out.map(f => `<div class="${g.players[f.id].isHero ? 'lb-hero' : ''}"><span>${ordinal(f.place)}</span> ${esc(f.name)} <span class="muted">— by ${esc(f.by)}</span></div>`).join('')}</div>` : ''}`);
  },

  renderStats() {
    const st = this.stats;
    if (!st) return;
    const p = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
    setHTML(this.$('#session-stats'), `
      <div><span>Hands</span><b>${st.hands}</b></div>
      <div><span>Peak chips</span><b>${this.t ? this.t.peak.toLocaleString() : '—'}</b></div>
      <div><span>VPIP</span><b>${p(st.vpip, st.hands)}</b></div>
      <div><span>PFR</span><b>${p(st.pfr, st.hands)}</b></div>
      <div><span>WTSD</span><b>${st.wtsd}</b></div>
      <div><span>W$SD</span><b>${p(st.wsd, st.wtsd)}</b></div>
      <div class="wide"><span>Range discipline</span><b>${st.decisions ? `${st.followed}/${st.decisions} (${p(st.followed, st.decisions)})` : '—'}</b></div>`);
  },

  layoutSeats() {
    if (!this.game) return;
    const table = this.$('#poker-table');
    const portrait = table.clientWidth < 640;
    table.classList.toggle('portrait', portrait);
    const n = this.game.players.length;
    table.classList.toggle('many', n > 6);
    const coords = HandLab.seatCoords(n, portrait);
    this.game.players.forEach((p, i) => {
      const [x, y] = coords[i];
      const seat = this.$('#seat-' + p.id);
      seat.style.left = x + '%';
      seat.style.top = y + '%';
      seat.dataset.side = y > 50 ? 'bottom' : 'top';
      seat.dataset.h = x > 70 ? 'right' : x < 30 ? 'left' : 'center';
      const chip = this.$('#bet-' + p.id);
      chip.style.left = x + (50 - x) * 0.42 + '%';
      chip.style.top = y + (48 - y) * 0.42 + '%';
    });
  },
});
