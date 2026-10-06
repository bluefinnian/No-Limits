'use strict';
/* Study tabs: Hands, Tells, Spots. */

const C = s => Cards.parseMany(s);

/* =====================================================================
 * HANDS
 * ===================================================================== */
const HAND_RANKINGS = [
  { name: 'Royal Flush', cards: 'AsKsQsJsTs', prob: 0.000032, desc: 'A, K, Q, J, 10 of the same suit. The unbeatable nuts.' },
  { name: 'Straight Flush', cards: '9h8h7h6h5h', prob: 0.000279, desc: 'Five consecutive cards of the same suit.' },
  { name: 'Four of a Kind', cards: 'QcQdQhQsKd', prob: 0.00168, desc: 'Four cards of the same rank (quads).' },
  { name: 'Full House', cards: 'JdJcJs4h4c', prob: 0.026, desc: 'Three of a kind plus a pair. Ranked by the trips first.' },
  { name: 'Flush', cards: 'Ad Jd 8d 6d 3d', prob: 0.0303, desc: 'Five cards of the same suit. Compared by highest card down.' },
  { name: 'Straight', cards: 'Tc9d8h7s6c', prob: 0.0462, desc: 'Five consecutive ranks. A-2-3-4-5 (the wheel) is the lowest.' },
  { name: 'Three of a Kind', cards: '7s7h7dKcQd', prob: 0.0483, desc: 'Three of the same rank. A "set" uses a pocket pair; "trips" uses one hole card.' },
  { name: 'Two Pair', cards: 'AhAc8s8dKh', prob: 0.235, desc: 'Two different pairs. Highest pair decides, then second pair, then kicker.' },
  { name: 'One Pair', cards: 'KdKsJh7c4s', prob: 0.438, desc: 'Two cards of the same rank. Kickers break ties.' },
  { name: 'High Card', cards: 'AdQc9h6s3c', prob: 0.174, desc: 'No made hand. The highest card plays.' },
];

const STARTING_CATEGORIES = [
  { name: 'Premium', hands: 'AA, KK, QQ, AKs, AKo', color: '#e05252', note: 'Raise and re-raise from any position. Happy to get stacks in preflop with AA/KK at 100bb.' },
  { name: 'Strong', hands: 'JJ, TT, AQs, AQo, AJs, KQs', color: '#f97316', note: 'Open from every seat. 3-bet for value vs late-position opens; be careful facing early-position 4-bets.' },
  { name: 'Playable Broadways', hands: 'ATs, KJs, QJs, KTs, AJo, KQo', color: '#eab308', note: 'Good in position. Offsuit versions are dominated often — fold them early, open them late.' },
  { name: 'Pocket Pairs', hands: '99 – 22', color: '#22c55e', note: 'Set-mining hands. You flop a set ~12% of the time, so you want ~15-20x the call in effective stacks.' },
  { name: 'Suited Aces', hands: 'A9s – A2s', color: '#14b8a6', note: 'Nut flush potential and great blockers. A5s–A2s are classic 3-bet bluffs.' },
  { name: 'Suited Connectors / Gappers', hands: 'T9s, 98s, 87s, 76s, 65s, J9s, T8s', color: '#3b82f6', note: 'Playable in position and deep-stacked. Make disguised straights and flushes.' },
  { name: 'Trash', hands: '72o, 83o, J4o, Q3o …', color: '#64748b', note: 'Fold. Even from the button most of these lose money.' },
];

const Hands = {
  init() {
    this.renderRankings();
    this.renderStarting();
    this.initShowdown();
    this.initRangeDrill();
    this.initEquity();
  },

  renderRankings() {
    const rows = HAND_RANKINGS.map((h, i) => `
      <div class="ranking-row">
        <div class="ranking-num">${i + 1}</div>
        <div class="ranking-cards">${cardsHtml(C(h.cards), 'sm')}</div>
        <div class="ranking-text"><h4>${h.name}</h4><p>${h.desc}</p></div>
        <div class="ranking-prob" title="Probability of making this hand with 7 cards (by the river)">
          <b>${h.prob < 0.001 ? (h.prob * 100).toFixed(4) : (h.prob * 100).toFixed(2)}%</b><span>by river</span>
        </div>
      </div>`).join('');
    $('#hands-rankings').innerHTML = `
      <div class="two-col">
        <div class="panel"><h3>Hand rankings (best to worst)</h3><div class="ranking-list">${rows}</div></div>
        <div class="panel">
          <h3>Rules that trip people up</h3>
          <ul class="tips">
            <li><b>Best five cards play.</b> You make the best 5-card hand from your 2 hole cards and the 5 board cards — you can use both, one or none of your hole cards.</li>
            <li><b>Kickers matter.</b> On <span class="inline-cards">${C('Kh9c4d2s7h').map(Cards.inline).join(' ')}</span>, A♠K♦ beats Q♠K♣ because the ace kicker plays.</li>
            <li><b>Suits never break ties.</b> Two identical flushes or straights split the pot.</li>
            <li><b>Counterfeiting.</b> Holding 6-6 on 9-9-4-4-K, your pair is counterfeited — the board's two pair with a K kicker plays, and any ace or queen beats you.</li>
            <li><b>The wheel.</b> A-2-3-4-5 is a straight with the ace playing low; it's the lowest straight. Q-K-A-2-3 is <i>not</i> a straight.</li>
            <li><b>Playing the board.</b> If the board is your best hand, every remaining player splits unless someone improves it.</li>
            <li><b>Full house ties</b> are decided by the three-of-a-kind first: 7-7-7-A-A loses to 8-8-8-2-2.</li>
          </ul>
        </div>
      </div>`;
  },

  renderStarting() {
    const color = code => {
      const p = HAND_PERCENTILE[code];
      const hue = Math.round(Math.max(0, 1 - p * 1.4) * 130);
      return `hsl(${hue} 65% ${30 + (1 - p) * 14}%)`;
    };
    const cats = STARTING_CATEGORIES.map(c => `
      <div class="cat-card" style="border-left-color:${c.color}">
        <h4>${c.name}</h4><div class="cat-hands">${c.hands}</div><p>${c.note}</p>
      </div>`).join('');
    $('#hands-starting').innerHTML = `
      <div class="two-col">
        <div class="panel">
          <h3>Starting hand strength</h3>
          <p class="hint">Coloured by preflop strength (Chen formula, combo-weighted). Upper-right = suited, lower-left = offsuit, diagonal = pairs. Click a hand for details.</p>
          <div class="range-grid" id="strength-grid"></div>
          <div class="legend-gradient"><span>Top 5%</span><div></div><span>Bottom</span></div>
          <div id="strength-detail" class="detail-box">Select a hand.</div>
        </div>
        <div class="panel"><h3>Hand categories</h3>${cats}
          <h3>Combinatorics</h3>
          <ul class="tips">
            <li>Each <b>pocket pair</b> has 6 combos, each <b>suited</b> hand 4, each <b>offsuit</b> hand 12. 1,326 combos in total.</li>
            <li>A card on the board removes combos: on an A-high flop, AK goes from 16 combos to 12.</li>
            <li>You're dealt a pocket pair 5.9% of the time, a suited hand 23.5%, and AA once every 221 hands.</li>
          </ul>
        </div>
      </div>`;
    const grid = $('#strength-grid');
    renderRangeGrid(grid, null, { cellStyle: color });
    grid.addEventListener('click', e => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      $$('.cell.hl', grid).forEach(c => c.classList.remove('hl'));
      cell.classList.add('hl');
      const code = cell.dataset.code;
      const combo = Cards.combosForCode(code)[0];
      const eq1 = calcEquity([combo, null], [], 4000)[0];
      const eq3 = calcEquity([combo, null, null, null], [], 3000)[0];
      const rank = HAND_ORDER.indexOf(code) + 1;
      $('#strength-detail').innerHTML = `
        <div class="detail-head">${cardsHtml(combo, 'sm')}<b>${code}</b></div>
        <div class="stats-grid">
          <div><span>Rank</span><b>${rank} / 169</b></div>
          <div><span>Top</span><b>${pct(HAND_PERCENTILE[code], 0)}</b></div>
          <div><span>Combos</span><b>${comboCount(code)}</b></div>
          <div><span>Chen score</span><b>${chenScore(code)}</b></div>
          <div><span>vs 1 random</span><b>${pct(eq1)}</b></div>
          <div><span>vs 3 random</span><b>${pct(eq3)}</b></div>
        </div>`;
    });
  },

  /* ----- Showdown drill ----- */
  initShowdown() {
    const root = $('#hands-showdown');
    root.innerHTML = `
      <div class="panel drill">
        <div class="panel-head"><h3>Who wins? Read the showdown</h3>
          <div class="btn-row">
            <label class="inline-label">Hands <select id="sd-count"><option>2</option><option>3</option><option>4</option></select></label>
            <span class="score" id="sd-score"></span>
          </div>
        </div>
        <div class="sd-board-wrap"><span class="label">Board</span><div class="board-row" id="sd-board"></div></div>
        <div class="sd-hands" id="sd-hands"></div>
        <div class="btn-row center" id="sd-choices"></div>
        <div class="feedback" id="sd-feedback"></div>
        <div class="btn-row center"><button class="btn btn-primary" id="sd-next">Next hand →</button></div>
      </div>`;
    this.sd = { correct: 0, total: 0, streak: 0 };
    $('#sd-next').onclick = () => this.newShowdown();
    $('#sd-count').onchange = () => this.newShowdown();
    this.newShowdown();
  },

  newShowdown() {
    const n = +$('#sd-count').value;
    // Bias towards interesting boards: re-deal if nobody has better than high card.
    let deck, board, hands, scores;
    for (let tries = 0; tries < 20; tries++) {
      deck = Cards.newDeck();
      hands = [];
      for (let i = 0; i < n; i++) hands.push([deck.pop(), deck.pop()]);
      board = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
      scores = hands.map(h => evaluateHand([...h, ...board]));
      if (scores.filter(s => handCategory(s) >= 1).length >= 2) break;
    }
    const best = Math.max(...scores);
    const winners = scores.map((s, i) => (s === best ? i : -1)).filter(i => i >= 0);
    this.sdState = { hands, board, scores, winners, answered: false };
    const letters = 'ABCD';
    setHTML($('#sd-board'), cardsHtml(board));
    setHTML($('#sd-hands'), hands.map((h, i) => `
      <div class="sd-hand" id="sd-hand-${i}"><div class="label">Hand ${letters[i]}</div><div class="board-row">${cardsHtml(h)}</div><div class="sd-desc"></div></div>`).join(''));
    const choices = hands.map((_, i) => `<button class="btn" data-ans="${i}">Hand ${letters[i]}</button>`).join('') +
      `<button class="btn" data-ans="split">Split pot</button>`;
    $('#sd-choices').innerHTML = choices;
    $$('#sd-choices button').forEach(b => (b.onclick = () => this.answerShowdown(b.dataset.ans)));
    $('#sd-feedback').innerHTML = '';
    this.renderSdScore();
  },

  answerShowdown(ans) {
    const st = this.sdState;
    if (st.answered) return;
    st.answered = true;
    const split = st.winners.length > 1;
    const ok = ans === 'split' ? split : !split && st.winners[0] === +ans;
    this.sd.total++;
    if (ok) { this.sd.correct++; this.sd.streak++; } else this.sd.streak = 0;
    st.hands.forEach((h, i) => {
      const elh = $('#sd-hand-' + i);
      elh.classList.add(st.winners.includes(i) ? 'win' : 'lose');
      $('.sd-desc', elh).textContent = describeHand(st.scores[i]);
    });
    const letters = 'ABCD';
    const truth = split ? `Split pot between ${st.winners.map(i => 'Hand ' + letters[i]).join(' & ')}` : `Hand ${letters[st.winners[0]]} wins`;
    $('#sd-feedback').innerHTML = `<div class="${ok ? 'good' : 'bad'}">${ok ? '✓ Correct!' : '✗ Not quite.'} ${truth} with ${describeHand(Math.max(...st.scores))}.</div>`;
    this.renderSdScore();
  },

  renderSdScore() {
    const s = this.sd;
    $('#sd-score').textContent = `${s.correct}/${s.total} correct · streak ${s.streak}`;
  },

  /* ----- Range drill ----- */
  initRangeDrill() {
    const root = $('#hands-rangedrill');
    root.innerHTML = `
      <div class="two-col drill-cols">
        <div class="panel drill">
          <div class="panel-head"><h3>Preflop Range Drill</h3><span class="score" id="rd-score"></span></div>
          <p class="hint">Test yourself against the ranges you built in the Range Builder. In <b>RNG mode</b> you get a random number (0–99) and must take the action it maps to — exactly like randomizing at the table: raise occupies the low numbers, then call, then fold.</p>
          <div class="drill-controls">
            <label>Range <select id="rd-range"></select></label>
            <label class="inline-label"><input type="checkbox" id="rd-rng"> RNG mode</label>
            <label class="inline-label"><input type="checkbox" id="rd-edge" checked> Focus on borderline hands</label>
          </div>
          <div class="rd-deal">
            <div class="rd-cards" id="rd-cards"></div>
            <div class="rd-meta"><div class="rd-code" id="rd-code"></div><div class="rd-roll" id="rd-roll"></div></div>
          </div>
          <div class="btn-row center">
            <button class="btn act act-raise" data-rd="raise">Raise</button>
            <button class="btn act act-call" data-rd="call">Call</button>
            <button class="btn act act-fold" data-rd="fold">Fold</button>
          </div>
          <div class="feedback" id="rd-feedback"></div>
          <div class="btn-row center"><button class="btn btn-primary" id="rd-next">Next hand →</button></div>
        </div>
        <div class="panel">
          <h3 id="rd-range-title">Range</h3>
          <div class="range-grid" id="rd-grid"></div>
          <p class="hint" id="rd-grid-hint">The chart is hidden until you answer.</p>
          <div class="legend"><span class="sw sw-raise"></span>Raise <span class="sw sw-call"></span>Call <span class="sw sw-fold"></span>Fold</div>
        </div>
      </div>`;
    this.rd = { correct: 0, total: 0, streak: 0 };
    $('#rd-next').onclick = () => this.newRangeDrill();
    $('#rd-range').onchange = () => this.newRangeDrill();
    $('#rd-rng').onchange = () => this.newRangeDrill();
    $$('[data-rd]', root).forEach(b => (b.onclick = () => this.answerRangeDrill(b.dataset.rd)));
    this.refreshRangeDrillOptions();
    RangeStore.onChange(() => this.refreshRangeDrillOptions());
    this.newRangeDrill();
  },

  refreshRangeDrillOptions() {
    const sel = $('#rd-range');
    const cur = sel.value;
    sel.innerHTML = `<option value="__any">Random range each hand</option>` +
      RangeStore.ranges.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  },

  borderlineCodes(range) {
    const action = code => {
      const f = handFreq(range, code);
      return f.r >= f.c && f.r >= f.f ? 'r' : f.c >= f.f ? 'c' : 'f';
    };
    const out = [];
    for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
      const code = GRID[i][j];
      const f = handFreq(range, code);
      const mixed = [f.r, f.c, f.f].filter(v => v > 0 && v < 100).length > 0;
      const a = action(code);
      const diffNeighbour = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => {
        const ni = i + di, nj = j + dj;
        return ni >= 0 && nj >= 0 && ni < 13 && nj < 13 && action(GRID[ni][nj]) !== a;
      });
      if (mixed || diffNeighbour) out.push(code);
    }
    return out;
  },

  newRangeDrill() {
    if (!RangeStore.ranges.length) {
      $('#rd-feedback').innerHTML = '<div class="bad">No ranges yet — create one in the Range Builder.</div>';
      return;
    }
    const sel = $('#rd-range').value;
    const range = sel === '__any' || !RangeStore.get(sel)
      ? RangeStore.ranges[Math.floor(Math.random() * RangeStore.ranges.length)]
      : RangeStore.get(sel);
    let code;
    const edge = $('#rd-edge').checked ? this.borderlineCodes(range) : [];
    if (edge.length && Math.random() < 0.8) {
      code = edge[Math.floor(Math.random() * edge.length)];
    } else {
      // Weighted by combos, like being dealt a real hand.
      const deck = Cards.newDeck();
      code = Cards.handCode(deck[0], deck[1]);
    }
    const combos = Cards.combosForCode(code);
    const cards = combos[Math.floor(Math.random() * combos.length)];
    const roll = Math.floor(Math.random() * 100);
    this.rdState = { range, code, roll, answered: false };
    setHTML($('#rd-cards'), cardsHtml(cards, 'lg'));
    $('#rd-code').innerHTML = `<b>${code}</b><span>${esc(range.name)}${range.position ? ' · ' + range.position : ''}</span>`;
    $('#rd-roll').innerHTML = $('#rd-rng').checked ? `<span>RNG</span><b>${roll}</b>` : '';
    $('#rd-feedback').innerHTML = '';
    $('#rd-range-title').textContent = range.name;
    $('#rd-grid-hint').textContent = 'The chart is hidden until you answer.';
    renderRangeGrid($('#rd-grid'), null, { cellStyle: () => 'var(--fold)' });
  },

  answerRangeDrill(action) {
    const st = this.rdState;
    if (!st || st.answered) return;
    st.answered = true;
    const f = handFreq(st.range, st.code);
    const freqOf = { raise: f.r, call: f.c, fold: f.f };
    const rng = $('#rd-rng').checked;
    let ok, msg;
    if (rng) {
      const target = actionForRoll(f, st.roll);
      ok = action === target;
      msg = ok ? `✓ Correct — roll ${st.roll} maps to <b>${target.toUpperCase()}</b>.`
        : `✗ Roll ${st.roll} maps to <b>${target.toUpperCase()}</b> (you chose ${action}).`;
    } else {
      const best = Object.entries(freqOf).sort((a, b) => b[1] - a[1])[0][0];
      ok = freqOf[action] > 0;
      msg = !ok ? `✗ ${st.code} is never a ${action} in this range. Best: <b>${best.toUpperCase()}</b>.`
        : freqOf[action] === 100 ? `✓ Correct — ${st.code} is a pure ${action}.`
          : `✓ Acceptable — ${action} is part of a mixed strategy (${freqOf[action]}%).`;
    }
    this.rd.total++;
    if (ok) { this.rd.correct++; this.rd.streak++; } else this.rd.streak = 0;
    $('#rd-feedback').innerHTML = `<div class="${ok ? 'good' : 'bad'}">${msg}</div>${freqBarHtml(f)}`;
    $('#rd-score').textContent = `${this.rd.correct}/${this.rd.total} · streak ${this.rd.streak}`;
    renderRangeGrid($('#rd-grid'), st.range.hands, { highlight: st.code });
    $('#rd-grid-hint').textContent = st.range.note || '';
  },

  /* ----- Equity calculator ----- */
  initEquity() {
    const root = $('#hands-equity');
    const playerRow = (i, ph) => `
      <div class="eq-row">
        <label>Player ${i + 1}</label>
        <input type="text" class="eq-input" data-i="${i}" placeholder="${ph}">
        <div class="eq-result" id="eq-res-${i}"></div>
      </div>`;
    root.innerHTML = `
      <div class="two-col">
        <div class="panel">
          <h3>Equity Calculator</h3>
          <p class="hint">Enter exact cards (<code>AhKh</code>), a range in notation (<code>QQ+, AKs, AKo</code>), or leave blank for a random hand. Board is optional (0, 3, 4 or 5 cards).</p>
          ${playerRow(0, 'e.g. AhKh')}${playerRow(1, 'e.g. QQ+, AKo or blank')}${playerRow(2, '(optional)')}${playerRow(3, '(optional)')}
          <div class="eq-row"><label>Board</label><input type="text" id="eq-board" placeholder="e.g. Kd7s2h"><div></div></div>
          <div class="btn-row"><button class="btn btn-primary" id="eq-run">Calculate</button><span class="hint" id="eq-status"></span></div>
        </div>
        <div class="panel">
          <h3>Classic matchups (preflop, approx.)</h3>
          <table class="data-table">
            <tr><th>Matchup</th><th>Example</th><th>Favourite</th></tr>
            <tr><td>Overpair vs underpair</td><td>KK vs 77</td><td>~80%</td></tr>
            <tr><td>Pair vs two overcards</td><td>77 vs AK</td><td>~55%</td></tr>
            <tr><td>Pair vs two undercards</td><td>JJ vs 87s</td><td>~80%</td></tr>
            <tr><td>Dominated hand</td><td>AK vs AQ</td><td>~74%</td></tr>
            <tr><td>Two overs vs two unders</td><td>AJ vs 76</td><td>~63%</td></tr>
            <tr><td>Pair vs one overcard</td><td>99 vs A8</td><td>~70%</td></tr>
            <tr><td>AA vs any 2 random</td><td>AA vs ??</td><td>~85%</td></tr>
          </table>
        </div>
      </div>`;
    $('#eq-run').onclick = () => this.runEquity();
    $$('.eq-input, #eq-board', root).forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') this.runEquity(); }));
    $$('.eq-input')[0].value = 'AhKh';
    $$('.eq-input')[1].value = 'QQ';
  },

  parsePlayerInput(text) {
    text = text.trim();
    if (!text) return { random: true };
    const cards = Cards.parseMany(text);
    if (cards && cards.length === 2) return { cards };
    const hands = {};
    const { errors } = applyNotation(hands, text);
    const codes = Object.keys(hands);
    if (errors.length || !codes.length) return { error: `Couldn't read "${text}"` };
    const combos = codes.flatMap(c => Cards.combosForCode(c));
    return { combos, codes };
  },

  runEquity() {
    const inputs = $$('.eq-input');
    const players = [], idx = [];
    for (let i = 0; i < inputs.length; i++) {
      $('#eq-res-' + i).innerHTML = '';
      const raw = inputs[i].value;
      if (!raw.trim() && i > 1) continue;
      const p = this.parsePlayerInput(raw);
      if (p.error) { $('#eq-res-' + i).innerHTML = `<span class="bad">${esc(p.error)}</span>`; return; }
      players.push(p.cards ? p.cards : p.combos ? { combos: p.combos } : null);
      idx.push(i);
    }
    const boardText = $('#eq-board').value;
    const board = boardText.trim() ? Cards.parseMany(boardText) : [];
    if (!board || ![0, 3, 4, 5].includes(board.length)) { $('#eq-status').textContent = 'Board must be 0, 3, 4 or 5 valid cards.'; return; }
    const all = [...board];
    for (const p of players) if (Array.isArray(p)) all.push(...p);
    if (new Set(all).size !== all.length) { $('#eq-status').textContent = 'Duplicate cards.'; return; }
    $('#eq-status').textContent = 'Calculating…';
    setTimeout(() => {
      const iters = board.length === 5 ? 3000 : 20000;
      const eq = calcEquity(players, board, iters);
      idx.forEach((i, k) => {
        $('#eq-res-' + i).innerHTML = `<div class="eq-bar"><div style="width:${eq[k] * 100}%"></div></div><b>${pct(eq[k])}</b>`;
      });
      $('#eq-status').textContent = `${iters.toLocaleString()} simulations`;
    }, 20);
  },
};

/* =====================================================================
 * TELLS
 * ===================================================================== */
const TELLS = [
  // Live physical
  { cat: 'Live', name: 'Shaking hands when betting', means: 'Strength', rel: 'High', desc: 'Trembling hands while putting chips in are usually caused by adrenaline from a big hand, not fear of being caught bluffing.', exploit: 'Give it a lot of weight, especially from inexperienced players. Fold marginal bluff-catchers.' },
  { cat: 'Live', name: 'Glancing at chips after the flop', means: 'Strength', rel: 'Medium', desc: 'A quick, involuntary look at their stack right after the flop often means they connected and are already planning to bet.', exploit: 'Be cautious bluffing into them; consider checking strong hands to let them bet.' },
  { cat: 'Live', name: 'Acting weak / sighing / shrugging', means: 'Strength', rel: 'Medium', desc: '"Weak means strong, strong means weak" (Caro). Players with big hands often put on a show of reluctance: "I guess I have to call…"', exploit: 'Theatrical weakness is usually a trap. Don\'t value-bet thinly into it.' },
  { cat: 'Live', name: 'Staring you down after betting', means: 'Unclear', rel: 'Low', desc: 'An intimidating stare is a deliberate act — and deliberate acts are unreliable. Some bluffers stare to look strong, others when they want a call.', exploit: 'Note how this particular player behaves at showdown before trusting it.' },
  { cat: 'Live', name: 'Freezing / holding breath after a bet', means: 'Weakness', rel: 'Medium', desc: 'Bluffers often go unnaturally still and quiet to avoid giving anything away. Relaxed, chatty players after a bet are more often strong.', exploit: 'Unusual stillness on a big river bet tilts toward a bluff — consider calling wider.' },
  { cat: 'Live', name: 'Reaching for chips out of turn', means: 'Weakness', rel: 'Medium', desc: 'Grabbing chips as if ready to call before you act is often an attempt to discourage a bet.', exploit: 'Go ahead and bet — they frequently fold to action.' },
  { cat: 'Live', name: 'Re-checking hole cards on a flush board', means: 'Weakness', rel: 'Medium', desc: 'Someone who checks their cards when the third flush card lands is looking for a suit — they usually don\'t have the flush already.', exploit: 'Their range is capped. Bet to represent the flush.' },
  { cat: 'Live', name: 'Sudden posture change (leaning in)', means: 'Strength', rel: 'Medium', desc: 'Sitting up and leaning forward signals interest. Players who slump back or disengage tend to be giving up.', exploit: 'Pay attention to changes relative to their baseline, not the posture itself.' },
  { cat: 'Live', name: 'Hand covering mouth after betting', means: 'Weakness', rel: 'Low', desc: 'Touching the face or covering the mouth can be a stress response associated with deception.', exploit: 'Weak on its own — combine with betting-pattern reads.' },
  { cat: 'Live', name: 'Forceful, splashy bet', means: 'Weakness', rel: 'Low', desc: 'Exaggerated, aggressive chip motions are an attempt to look strong; smooth, confident bets are more often for value.', exploit: 'Mild evidence of a bluff. Many experienced players are aware of this one.' },
  // Timing
  { cat: 'Timing', name: 'Snap-check', means: 'Weakness', rel: 'High', desc: 'An instant check usually means they never considered betting — a give-up or weak hand.', exploit: 'Bet or bluff more often in position after a snap-check.' },
  { cat: 'Timing', name: 'Snap-call on a wet board', means: 'Draw / medium', rel: 'Medium', desc: 'Instant calls on coordinated boards usually mean a draw or a one-pair hand. With a monster they\'d think about raising.', exploit: 'Their range is capped. Barrel scare cards, value-bet strong hands.' },
  { cat: 'Timing', name: 'Long tank, then small bet', means: 'Medium', rel: 'Medium', desc: 'A long pause followed by a small "blocking" bet is often a medium-strength hand trying to see a cheap showdown.', exploit: 'Raise with strong hands and good bluffs; they often fold or just call.' },
  { cat: 'Timing', name: 'Tank, then big raise', means: 'Strength', rel: 'Medium', desc: 'At low stakes, long thought followed by a big raise is usually a strong hand being "acted" out.', exploit: 'Respect it unless the player is known to be tricky.' },
  // Betting patterns
  { cat: 'Betting', name: 'Passive player suddenly raises', means: 'Strength', rel: 'High', desc: 'When a fish or calling station who has only called all session suddenly raises, it\'s almost always a very strong hand.', exploit: 'Fold everything but the nuts. This is one of the most reliable reads in poker.' },
  { cat: 'Betting', name: 'Limp-reraise', means: 'Strength', rel: 'High', desc: 'At low stakes, limping and then re-raising a raise is overwhelmingly AA or KK.', exploit: 'Fold all but your very best hands.' },
  { cat: 'Betting', name: 'Min-raise on the river', means: 'Strength', rel: 'Medium', desc: 'Recreational players min-raise with very strong hands — they want to get paid.', exploit: 'Call with strong hands, fold bluff-catchers.' },
  { cat: 'Betting', name: 'Bet size matches hand strength', means: 'Varies', rel: 'Medium', desc: 'Many players bet big with strong hands and small with draws or weak made hands. Watch for this pattern at showdown.', exploit: 'Once confirmed, fold to their big bets and attack their small ones.' },
  { cat: 'Betting', name: 'Donk bet into the preflop raiser', means: 'Medium / draw', rel: 'Low', desc: 'Leading into the aggressor at low stakes is often a weak made hand or draw looking to "set the price".', exploit: 'Raise to put them to a decision, especially on dry boards.' },
  // Online
  { cat: 'Online', name: 'Instant check-behind / auto-check', means: 'Weakness', rel: 'High', desc: 'Pre-selected checks or checks with zero delay mean they decided before seeing your action.', exploit: 'Bluff more often when they show disinterest.' },
  { cat: 'Online', name: 'Time-bank then raise', means: 'Strength', rel: 'Medium', desc: 'Using the time bank before raising is usually a strong hand weighing how to extract value (or a staged act from good players).', exploit: 'Lean toward folding marginal hands.' },
  { cat: 'Online', name: 'Big overbet from a recreational player', means: 'Strength', rel: 'Medium', desc: 'At micro-stakes, overbets from weaker players are heavily skewed toward the nuts.', exploit: 'Don\'t hero-call without a strong reason.' },
  { cat: 'Online', name: 'Tilt after a bad beat', means: 'Looser play', rel: 'Medium', desc: 'Chatting angrily or suddenly playing many hands right after losing a big pot signals tilt.', exploit: 'Widen value ranges and call down lighter against them for the next few orbits.' },
];

const TELL_QUIZ = [
  { q: 'A quiet player who hasn\'t raised in an hour suddenly check-raises the turn.', a: 'Strong', why: 'Passive players rarely bluff with raises. A sudden raise from them is very strong.' },
  { q: 'The river completes a flush. Your opponent looks back at their hole cards, then bets.', a: 'Weak', why: 'Checking hole cards for a suit means they didn\'t already know they had a flush.' },
  { q: 'After you bet, your opponent sighs loudly, mutters "ugh, fine" and makes a big raise.', a: 'Strong', why: 'Acting weak is a classic sign of strength — they\'re trying to induce action.' },
  { q: 'Your opponent\'s hands tremble as they push all-in on the river.', a: 'Strong', why: 'Shaking is usually from adrenaline with a big hand, not from bluffing nerves.' },
  { q: 'Online, your opponent checks instantly on the turn after calling the flop.', a: 'Weak', why: 'Snap-checks indicate a pre-decided give-up or weak hand.' },
  { q: 'Your opponent bets the river and then sits completely still, barely breathing.', a: 'Weak', why: 'Bluffers often freeze to avoid giving off information.' },
  { q: 'A recreational player limps under the gun, then re-raises your isolation raise.', a: 'Strong', why: 'Limp-reraise at low stakes is very often AA or KK.' },
  { q: 'Before you act, your opponent picks up chips as if to call.', a: 'Weak', why: 'Reaching for chips early is often designed to stop you from betting.' },
  { q: 'Your opponent glances at their stack immediately after the flop is dealt.', a: 'Strong', why: 'An involuntary glance at chips often means they hit and are planning to bet.' },
  { q: 'Your opponent stares you down after pushing chips in.', a: 'Unclear', why: 'Staring is a conscious act and highly player-dependent — treat it as unreliable.' },
  { q: 'A player who usually chats freely goes silent after making a big bet.', a: 'Weak', why: 'Changes from baseline matter. Going quiet under pressure often accompanies a bluff.' },
  { q: 'Facing your c-bet on a wet board, your opponent snap-calls.', a: 'Unclear', why: 'Snap-calls on wet boards usually mean a draw or medium pair — a capped but not weak range.' },
];

const Tells = {
  init() {
    this.renderLibrary();
    this.renderTypes();
    this.initQuiz();
  },

  renderLibrary() {
    const cats = ['All', ...new Set(TELLS.map(t => t.cat))];
    $('#tells-library').innerHTML = `
      <div class="chip-row" id="tell-filters">${cats.map((c, i) => `<button class="chip ${i ? '' : 'active'}" data-cat="${c}">${c}</button>`).join('')}</div>
      <div class="card-grid" id="tell-cards"></div>
      <div class="panel note"><b>Practice it live:</b> opponents in the Practice Arena show these tells as they act — but each one is randomized to be honest or false, weighted by its reliability and the player type. Combine tells with range, position and sizing, then check the Hand Review to see which were real.<br><br><b>Remember:</b> tells are evidence, not proof. Always compare to a player's <i>baseline</i> behaviour, weigh them less than betting patterns, and remember that experienced players may fake them.</div>`;
    const draw = cat => {
      $('#tell-cards').innerHTML = TELLS.filter(t => cat === 'All' || t.cat === cat).map(t => `
        <div class="info-card">
          <div class="info-card-head"><span class="tag">${t.cat}</span><span class="means means-${t.means.split(' ')[0].toLowerCase()}">${t.means}</span></div>
          <h4>${t.name}</h4>
          <p>${t.desc}</p>
          <p class="exploit"><b>Exploit:</b> ${t.exploit}</p>
          <div class="reliability">Reliability: <span class="rel rel-${t.rel.toLowerCase()}">${t.rel}</span></div>
        </div>`).join('');
    };
    $$('#tell-filters .chip').forEach(b => (b.onclick = () => {
      $$('#tell-filters .chip').forEach(x => x.classList.toggle('active', x === b));
      draw(b.dataset.cat);
    }));
    draw('All');
  },

  renderTypes() {
    $('#tells-types').innerHTML = `
      <p class="hint">These are the same profiles the AI opponents use in the Practice Arena. Learn to spot them from their stats and lines, then exploit them.</p>
      <div class="card-grid">${PROFILE_KEYS.map(k => {
        const p = PROFILES[k];
        return `<div class="info-card type-card" style="border-top-color:${p.color}">
          <div class="info-card-head"><span class="type-badge" style="background:${p.color}">${p.label}</span><span class="stats-line">${p.stats}</span></div>
          <h4>${p.name}</h4>
          <p>${p.description}</p>
          <p><b>How to spot:</b> ${p.spot}</p>
          <p class="exploit"><b>Exploit:</b> ${p.exploit}</p>
        </div>`;
      }).join('')}</div>
      <div class="panel">
        <h3>Reading the HUD stats</h3>
        <table class="data-table">
          <tr><th>Stat</th><th>Meaning</th><th>What it tells you</th></tr>
          <tr><td>VPIP</td><td>% of hands where they voluntarily put money in preflop</td><td>How loose they are. Over 35% is very loose; under 15% is tight.</td></tr>
          <tr><td>PFR</td><td>% of hands they raise preflop</td><td>A big VPIP–PFR gap means they call a lot (passive).</td></tr>
          <tr><td>3-Bet</td><td>% of opportunities they re-raise preflop</td><td>Under 4% = value-heavy; over 10% = lots of bluffs.</td></tr>
          <tr><td>AF</td><td>Aggression factor: (bets + raises) / calls postflop</td><td>Under 1 = passive, 2–3 = standard, 4+ = very aggressive.</td></tr>
          <tr><td>WTSD</td><td>% of flops seen that reach showdown</td><td>High WTSD = calling station; bluff less, value bet more.</td></tr>
        </table>
      </div>`;
  },

  initQuiz() {
    $('#tells-quiz').innerHTML = `
      <div class="panel drill quiz">
        <div class="panel-head"><h3>What does this tell most likely mean?</h3><span class="score" id="tq-score"></span></div>
        <div class="quiz-q" id="tq-q"></div>
        <div class="btn-row center" id="tq-choices">
          <button class="btn act act-raise" data-a="Strong">Strength</button>
          <button class="btn act act-fold" data-a="Weak">Weakness</button>
          <button class="btn" data-a="Unclear">Unreliable / unclear</button>
        </div>
        <div class="feedback" id="tq-feedback"></div>
        <div class="btn-row center"><button class="btn btn-primary" id="tq-next">Next →</button></div>
      </div>`;
    this.tq = { order: Cards.shuffle(TELL_QUIZ.map((_, i) => i)), i: 0, correct: 0, total: 0 };
    $$('#tq-choices button').forEach(b => (b.onclick = () => this.answerQuiz(b.dataset.a)));
    $('#tq-next').onclick = () => this.nextQuiz();
    this.showQuiz();
  },

  showQuiz() {
    const item = TELL_QUIZ[this.tq.order[this.tq.i % TELL_QUIZ.length]];
    this.tq.answered = false;
    $('#tq-q').textContent = item.q;
    $('#tq-feedback').innerHTML = '';
    $('#tq-score').textContent = `${this.tq.correct}/${this.tq.total}`;
  },

  nextQuiz() {
    this.tq.i++;
    if (this.tq.i % TELL_QUIZ.length === 0) this.tq.order = Cards.shuffle(this.tq.order);
    this.showQuiz();
  },

  answerQuiz(a) {
    if (this.tq.answered) return;
    this.tq.answered = true;
    const item = TELL_QUIZ[this.tq.order[this.tq.i % TELL_QUIZ.length]];
    const ok = a === item.a;
    this.tq.total++;
    if (ok) this.tq.correct++;
    $('#tq-feedback').innerHTML = `<div class="${ok ? 'good' : 'bad'}">${ok ? '✓ Correct' : '✗ Most likely: ' + item.a}. ${item.why}</div>`;
    $('#tq-score').textContent = `${this.tq.correct}/${this.tq.total}`;
  },
};

/* =====================================================================
 * SPOTS
 * ===================================================================== */
const SPOTS = [
  {
    street: 'Preflop', title: 'Folded to you on the button',
    setup: '6-max, 100bb effective. Action folds to you on the BTN.', hero: 'Ks8s', board: '', pot: 1.5,
    question: 'What\'s your play?',
    options: [
      { label: 'Fold', grade: 'bad', why: 'Far too tight. K8s is a profitable open from the button — you have position and only the blinds to get through.' },
      { label: 'Limp', grade: 'bad', why: 'Open-limping gives up the initiative and fold equity. Raise or fold when first in.' },
      { label: 'Raise to 2.5bb', grade: 'best', why: 'Standard. Suited kings play well in position and steal the blinds often enough on their own.' },
    ],
  },
  {
    street: 'Preflop', title: 'AJo facing an UTG open',
    setup: '6-max, 100bb. UTG (a TAG) opens to 2.5bb. Folds to you on the BTN.', hero: 'AdJc', board: '', pot: 4,
    question: 'How do you continue?',
    options: [
      { label: 'Fold', grade: 'best', why: 'AJo is dominated by much of a tight UTG range (AQ, AK, AJs…). Folding is fine and simplest.' },
      { label: 'Call', grade: 'ok', why: 'Playable in position but you\'ll often be dominated, and calls invite blind squeezes.' },
      { label: '3-bet to 8bb', grade: 'ok', why: 'A reasonable mix occasionally, but it folds out worse and gets called by better.' },
    ],
  },
  {
    street: 'Preflop', title: 'Pocket nines facing a 3-bet',
    setup: '6-max, 100bb. You open 99 from the CO to 2.5bb. BTN 3-bets to 8bb. Blinds fold.', hero: '9h9d', board: '', pot: 12,
    question: 'What do you do?',
    options: [
      { label: 'Fold', grade: 'bad', why: 'Too tight. 99 has solid equity against a button 3-betting range and plays fine as a call.' },
      { label: 'Call', grade: 'best', why: 'Call and play a pot with a decent hand. You\'re ahead of bluffs and can set-mine against the value part.' },
      { label: '4-bet to 20bb', grade: 'ok', why: 'Turns 99 into a bluff — better hands call, worse fold. Can work against a very loose 3-bettor.' },
    ],
  },
  {
    street: 'Preflop', title: 'Squeeze opportunity',
    setup: '6-max, 100bb. CO opens to 2.5bb, BTN calls. You\'re in the SB.', hero: 'AhQc', board: '', pot: 6.5,
    question: 'Your move?',
    options: [
      { label: 'Fold', grade: 'bad', why: 'AQo is far ahead of a CO open + BTN flat range.' },
      { label: 'Call', grade: 'bad', why: 'Calling out of position in a 3-way pot with a hand that wants to play heads-up is the worst option.' },
      { label: '3-bet (squeeze) to 12bb', grade: 'best', why: 'Squeeze! Dead money is in the pot, the caller is capped, and AQo plays well against the ranges that continue.' },
    ],
  },
  {
    street: 'Preflop', title: 'Set-mining short-stacked',
    setup: 'Effective stacks are 30bb. UTG opens to 3bb. Folds to you in the HJ.', hero: '4c4d', board: '', pot: 4.5,
    question: 'Should you call to set-mine?',
    options: [
      { label: 'Call', grade: 'bad', why: 'You flop a set ~12% of the time and need ~15–20x the call in implied odds. 30bb / 3bb is only 10x.' },
      { label: 'Fold', grade: 'best', why: 'Implied odds aren\'t there and UTG is strong. Small pairs need deep stacks.' },
      { label: 'Shove 30bb', grade: 'ok', why: 'Not terrible at 30bb, but against a tight UTG range you\'re mostly getting called by overpairs.' },
    ],
  },
  {
    street: 'Preflop', title: '10bb in the small blind',
    setup: 'Tournament, 10bb effective. Folds to you in the SB.', hero: 'Kd9s', board: '', pot: 1.5,
    question: 'What\'s the play?',
    options: [
      { label: 'Fold', grade: 'bad', why: 'K9o is well within a 10bb SB shoving range.' },
      { label: 'Limp', grade: 'ok', why: 'Limping can be part of a solver strategy, but it\'s hard to play well. Shoving is simpler and profitable.' },
      { label: 'Shove 10bb', grade: 'best', why: 'Push/fold: you have fold equity and decent equity when called. Easy jam.' },
    ],
  },
  {
    street: 'Flop', title: 'C-bet on a dry board',
    setup: 'You open BTN, BB calls. Pot 5.5bb, 97.5bb behind. BB checks.', hero: 'QsJs', board: 'Kh7d2c', pot: 5.5,
    question: 'How do you play your missed hand?',
    options: [
      { label: 'Check back', grade: 'ok', why: 'Fine with some hands, but you give up a lot of fold equity on a board that favours your range.' },
      { label: 'Bet 33% pot', grade: 'best', why: 'K-7-2 rainbow strongly favours the raiser. A small, high-frequency c-bet folds out tons of BB\'s range and you have backdoor draws.' },
      { label: 'Bet 100% pot', grade: 'bad', why: 'No need to bet big on a dry board. You risk more to achieve the same folds.' },
    ],
  },
  {
    street: 'Flop', title: 'Overpair on a wet board',
    setup: 'You open UTG, BTN calls. Pot 6bb, ~97bb behind. You\'re first to act.', hero: 'AhAd', board: '9s8s6d', pot: 6,
    question: 'How should you play AA here?',
    options: [
      { label: 'Check', grade: 'ok', why: 'You need some checks for balance, but with AA you\'re giving free cards to many draws.' },
      { label: 'Bet 25% pot', grade: 'bad', why: 'Too small — draws get a great price to continue.' },
      { label: 'Bet 66–75% pot', grade: 'best', why: 'Wet, connected board: charge the many draws and pairs. Bigger sizing on dynamic boards.' },
    ],
  },
  {
    street: 'Flop', title: 'Combo draw facing a c-bet',
    setup: 'BTN opens, you defend the BB. Pot 5.5bb. You check, BTN bets 2bb.', hero: '8s7s', board: '9s6d2s', pot: 7.5,
    question: 'What\'s your play with an open-ender + flush draw?',
    options: [
      { label: 'Fold', grade: 'bad', why: 'You have 15 outs — over 50% equity against many hands. Never fold.' },
      { label: 'Call', grade: 'ok', why: 'Fine, but you miss the chance to win the pot right now.' },
      { label: 'Check-raise to 7bb', grade: 'best', why: 'Huge equity + fold equity. Raising builds the pot when you\'re often a favourite even when called.' },
    ],
  },
  {
    street: 'Flop', title: 'Missed AK in a multiway pot',
    setup: 'You open CO, BTN and BB call. Pot 8bb. BB checks.', hero: 'AcKc', board: '8h7h6s', pot: 8,
    question: 'How do you proceed?',
    options: [
      { label: 'Bet 75% pot', grade: 'bad', why: 'Multiway on a board that smashes calling ranges — you\'ll rarely get two players to fold.' },
      { label: 'Bet 33% pot', grade: 'ok', why: 'A small stab isn\'t a disaster, but it gets called or raised a lot.' },
      { label: 'Check', grade: 'best', why: 'Ace-high with no draw on a low, connected board 3-way: check and give up cheaply.' },
    ],
  },
  {
    street: 'Turn', title: 'Nut flush draw facing a bet',
    setup: 'Heads-up, pot is 20bb. Villain bets 10bb on the turn. 80bb behind.', hero: 'AhTh', board: 'Kh8h3c2s', pot: 30,
    question: 'Call, fold or raise?',
    options: [
      { label: 'Fold', grade: 'bad', why: 'You need 25% equity (10 / 40). 9 flush outs ≈ 20% plus some ace outs, plus implied odds with the nuts.' },
      { label: 'Call', grade: 'best', why: 'Price + implied odds of the nut flush make this a clear call.' },
      { label: 'Raise all-in', grade: 'ok', why: 'A semi-bluff can work vs aggressive players, but you turn a profitable call into a high-variance shove.' },
    ],
  },
  {
    street: 'River', title: 'Value-betting a calling station',
    setup: 'Villain is a Calling Station. They called your flop and turn bets. Pot 30bb, they check.', hero: 'AsQd', board: 'Qh8c4d6s2h', pot: 30,
    question: 'How much should you bet?',
    options: [
      { label: 'Check', grade: 'bad', why: 'Missing value. Stations call down with worse queens and middle pairs.' },
      { label: 'Bet 33% pot', grade: 'ok', why: 'Gets called, but you leave money on the table.' },
      { label: 'Bet 75% pot', grade: 'best', why: 'Stations don\'t fold pairs. Bet big with your strong hands — they pay.' },
    ],
  },
  {
    street: 'River', title: 'Passive fish raises the river',
    setup: 'Villain is a loose-passive Fish who has only called all session. You bet 20bb into 30bb; they raise to 70bb.', hero: 'KsKc', board: 'Kd9h5c4h7s', pot: 120,
    question: 'You have top set. What now?',
    options: [
      { label: 'Fold', grade: 'ok', why: 'Too tight with top set — straights exist, but some fish raise sets or two pair.' },
      { label: 'Call', grade: 'best', why: 'A passive raise means strength, but top set beats sets and two pair. Call — don\'t re-raise into the straights (86, 63).' },
      { label: 'Re-raise all-in', grade: 'bad', why: 'You only get called by straights that beat you.' },
    ],
  },
  {
    street: 'River', title: 'Bluff-catching vs a nit',
    setup: 'Villain is a Nit. You have top pair. They check-raise the river big.', hero: 'AdJh', board: 'Jc8d5s3h2c', pot: 40,
    question: 'Call or fold?',
    options: [
      { label: 'Call', grade: 'bad', why: 'Nits almost never bluff-raise rivers. Top pair is just a bluff-catcher here.' },
      { label: 'Fold', grade: 'best', why: 'Exploit the type: their river raise is sets, two pair or 4-5 — fold.' },
      { label: 'Re-raise', grade: 'bad', why: 'You only get called by better hands.' },
    ],
  },
];

const CONCEPTS = [
  { t: 'Position', d: 'Acting last lets you see what opponents do before you decide. Play more hands in late position (CO, BTN) and fewer early (UTG, HJ). The button is the most profitable seat.' },
  { t: 'Pot odds', d: 'Required equity to call = <b>call ÷ (pot after your call)</b>. Facing a half-pot bet you need 25%; a pot-sized bet, 33%.' },
  { t: 'Implied odds', d: 'Money you expect to win on later streets when you hit. Drawing hands and small pairs depend on implied odds — which need deep stacks and opponents who pay off.' },
  { t: 'Minimum Defence Frequency', d: 'MDF = pot ÷ (pot + bet). Defend at least this often to stop an opponent profiting with any two cards. Facing a pot-sized bet, MDF is 50%.' },
  { t: 'Stack-to-Pot Ratio (SPR)', d: 'Effective stack ÷ pot on the flop. Low SPR (< 3): top pair is often good for stacks. High SPR (> 10): you need stronger hands to commit.' },
  { t: 'Range advantage', d: 'Who has more strong hands on this board? The preflop raiser usually has the advantage on high-card boards (A, K), the caller on low connected boards.' },
  { t: 'Fold equity', d: 'The extra value from opponents folding. Semi-bluffs (draws) combine fold equity with the chance to improve — that\'s why they make great bluffs.' },
  { t: 'Bet sizing', d: 'Small bets on dry boards with range advantage; big bets on wet boards, with polarized ranges (nuts or air), and against calling stations with value.' },
  { t: 'Blockers', d: 'Cards in your hand remove combos from your opponent. Holding the A♠ on a three-spade board means they can\'t have the nut flush — a good bluffing card.' },
  { t: 'Randomization & balance', d: 'Mixed strategies stay unexploitable. Use an RNG (like the Range Helper in the arena): roll 0–99, raise if the roll is below your raise %, else call/fold. This removes emotion from the decision.' },
  { t: 'Exploitative vs GTO', d: 'GTO is a defensive baseline. Against obvious leaks — stations who never fold, nits who never bluff — deviate to exploit them. That\'s what the arena player types are for.' },
  { t: 'Tilt control', d: 'Set a stop-loss, take breaks after big pots, and review hands rather than results. Track your range discipline to measure decisions, not outcomes.' },
];

const DRAWS = [
  { name: 'Open-ended straight + flush draw', outs: 15 },
  { name: 'Flush draw + overcard', outs: 12 },
  { name: 'Flush draw', outs: 9 },
  { name: 'Open-ended straight draw', outs: 8 },
  { name: 'Two overcards', outs: 6 },
  { name: 'Gutshot + overcard', outs: 7 },
  { name: 'Two pair → full house', outs: 4 },
  { name: 'Gutshot straight draw', outs: 4 },
  { name: 'Set → full house or better (turn)', outs: 7 },
  { name: 'Pocket pair → set', outs: 2 },
];

function chooseN(n, k) { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; }
const flopToRiver = outs => 1 - chooseN(47 - outs, 2) / chooseN(47, 2);
const oneCard = outs => outs / 46;

const Spots = {
  init() {
    this.initTrainer();
    this.renderOuts();
    this.renderMath();
    this.renderConcepts();
  },

  initTrainer() {
    const streets = ['All', 'Preflop', 'Flop', 'Turn', 'River'];
    $('#spots-trainer').innerHTML = `
      <div class="chip-row" id="spot-filters">${streets.map((s, i) => `<button class="chip ${i ? '' : 'active'}" data-st="${s}">${s}</button>`).join('')}
        <span class="score" id="spot-score"></span></div>
      <div class="panel drill spot">
        <div class="spot-head"><span class="tag" id="spot-street"></span><h3 id="spot-title"></h3><span class="spot-count" id="spot-count"></span></div>
        <p class="spot-setup" id="spot-setup"></p>
        <div class="spot-table">
          <div><span class="label">Your hand</span><div class="board-row" id="spot-hero"></div></div>
          <div id="spot-board-wrap"><span class="label">Board</span><div class="board-row" id="spot-board"></div></div>
          <div><span class="label">Pot</span><div class="spot-pot" id="spot-pot"></div></div>
        </div>
        <h4 id="spot-question"></h4>
        <div class="spot-options" id="spot-options"></div>
        <div class="feedback" id="spot-feedback"></div>
        <div class="btn-row center"><button class="btn" id="spot-prev">← Previous</button><button class="btn btn-primary" id="spot-next">Next spot →</button></div>
      </div>`;
    this.spot = { filter: 'All', i: 0, correct: 0, total: 0 };
    $$('#spot-filters .chip').forEach(b => (b.onclick = () => {
      $$('#spot-filters .chip').forEach(x => x.classList.toggle('active', x === b));
      this.spot.filter = b.dataset.st;
      this.spot.i = 0;
      this.showSpot();
    }));
    $('#spot-next').onclick = () => { this.spot.i++; this.showSpot(); };
    $('#spot-prev').onclick = () => { this.spot.i--; this.showSpot(); };
    this.showSpot();
  },

  filteredSpots() {
    return SPOTS.filter(s => this.spot.filter === 'All' || s.street === this.spot.filter);
  },

  showSpot() {
    const list = this.filteredSpots();
    const n = list.length;
    this.spot.i = ((this.spot.i % n) + n) % n;
    const s = list[this.spot.i];
    this.spot.answered = false;
    $('#spot-street').textContent = s.street;
    $('#spot-title').textContent = s.title;
    $('#spot-count').textContent = `${this.spot.i + 1} / ${n}`;
    $('#spot-setup').textContent = s.setup;
    $('#spot-hero').innerHTML = cardsHtml(C(s.hero));
    $('#spot-board-wrap').style.display = s.board ? '' : 'none';
    $('#spot-board').innerHTML = s.board ? cardsHtml(C(s.board)) : '';
    $('#spot-pot').textContent = s.pot + ' bb';
    $('#spot-question').textContent = s.question;
    $('#spot-options').innerHTML = s.options.map((o, i) => `<button class="spot-option" data-i="${i}"><span>${o.label}</span><div class="spot-why"></div></button>`).join('');
    $$('#spot-options .spot-option').forEach(b => (b.onclick = () => this.answerSpot(s, +b.dataset.i)));
    $('#spot-feedback').innerHTML = '';
    this.renderSpotScore();
  },

  answerSpot(s, idx) {
    if (this.spot.answered) return;
    this.spot.answered = true;
    const choice = s.options[idx];
    this.spot.total++;
    if (choice.grade === 'best') this.spot.correct++;
    $$('#spot-options .spot-option').forEach((b, i) => {
      const o = s.options[i];
      b.classList.add('grade-' + o.grade);
      if (i === idx) b.classList.add('chosen');
      $('.spot-why', b).innerHTML = `<b>${o.grade === 'best' ? 'Best' : o.grade === 'ok' ? 'Okay' : 'Mistake'}:</b> ${o.why}`;
    });
    const msg = choice.grade === 'best' ? '✓ Best play!' : choice.grade === 'ok' ? '◐ Reasonable, but there\'s a better option.' : '✗ That\'s a mistake.';
    $('#spot-feedback').innerHTML = `<div class="${choice.grade === 'best' ? 'good' : choice.grade === 'ok' ? 'meh' : 'bad'}">${msg}</div>`;
    this.renderSpotScore();
  },

  renderSpotScore() {
    $('#spot-score').textContent = `Best plays: ${this.spot.correct}/${this.spot.total}`;
  },

  renderOuts() {
    const rows = DRAWS.map(d => `<tr><td>${d.name}</td><td>${d.outs}</td><td>${pct(oneCard(d.outs))}</td><td>${pct(flopToRiver(d.outs))}</td><td class="muted">${d.outs * 2}% / ${d.outs * 4}%</td></tr>`).join('');
    $('#spots-outs').innerHTML = `
      <div class="two-col">
        <div class="panel">
          <h3>Common draws</h3>
          <table class="data-table">
            <tr><th>Draw</th><th>Outs</th><th>Next card</th><th>Flop → River</th><th>Rule of 2 / 4</th></tr>${rows}
          </table>
          <p class="hint">Rule of 2 and 4: multiply outs by 2 for one card to come, by 4 for two cards (flop all-in). It overestimates big draws slightly.</p>
        </div>
        <div class="panel">
          <h3>Outs calculator</h3>
          <div class="slider-row"><label>Outs <b id="outs-val">9</b></label><input type="range" id="outs-slider" min="1" max="20" value="9"></div>
          <div class="stats-grid" id="outs-stats"></div>
          <h3>Counting outs carefully</h3>
          <ul class="tips">
            <li><b>Discount tainted outs.</b> A flush card that pairs the board may give someone a full house.</li>
            <li><b>Don\'t double count.</b> With a flush draw + open-ender, two cards complete both — that\'s 15 outs, not 17.</li>
            <li><b>Overcards aren\'t clean.</b> Hitting top pair may still lose to two pair or a set.</li>
          </ul>
        </div>
      </div>`;
    const upd = () => {
      const o = +$('#outs-slider').value;
      $('#outs-val').textContent = o;
      const turn = oneCard(o), both = flopToRiver(o);
      $('#outs-stats').innerHTML = `
        <div><span>Turn or river (1 card)</span><b>${pct(turn)}</b></div>
        <div><span>Flop → river (2 cards)</span><b>${pct(both)}</b></div>
        <div><span>Odds against (1 card)</span><b>${((1 - turn) / turn).toFixed(1)} : 1</b></div>
        <div><span>Max bet you can call (% of pot)</span><b>${pct(turn / (1 - 2 * turn) > 0 && turn < 0.5 ? turn / (1 - 2 * turn) : 1, 0)}</b></div>`;
    };
    $('#outs-slider').oninput = upd;
    upd();
  },

  renderMath() {
    $('#spots-math').innerHTML = `
      <div class="card-grid">
        <div class="panel calc">
          <h3>Pot odds</h3>
          <label>Pot before bet <input type="number" id="po-pot" value="100" min="0"></label>
          <label>Bet to call <input type="number" id="po-bet" value="50" min="0"></label>
          <div class="calc-out" id="po-out"></div>
        </div>
        <div class="panel calc">
          <h3>Bluff break-even</h3>
          <label>Pot <input type="number" id="bl-pot" value="100" min="0"></label>
          <label>Your bluff size <input type="number" id="bl-bet" value="75" min="0"></label>
          <div class="calc-out" id="bl-out"></div>
        </div>
        <div class="panel calc">
          <h3>Stack-to-pot ratio</h3>
          <label>Effective stack <input type="number" id="spr-stack" value="95" min="0"></label>
          <label>Pot on the flop <input type="number" id="spr-pot" value="13" min="0"></label>
          <div class="calc-out" id="spr-out"></div>
        </div>
        <div class="panel calc">
          <h3>Implied odds needed</h3>
          <label>Pot before bet <input type="number" id="io-pot" value="20" min="0"></label>
          <label>Bet to call <input type="number" id="io-bet" value="10" min="0"></label>
          <label>Your equity % <input type="number" id="io-eq" value="18" min="0" max="100"></label>
          <div class="calc-out" id="io-out"></div>
        </div>
      </div>`;
    const v = id => Math.max(0, +$(id).value || 0);
    const upd = () => {
      const pot = v('#po-pot'), bet = v('#po-bet');
      const need = bet / (pot + 2 * bet || 1);
      $('#po-out').innerHTML = `Equity needed: <b>${pct(need)}</b><br>Pot odds: <b>${bet ? ((pot + bet) / bet).toFixed(2) : '∞'} : 1</b><br>MDF: <b>${pct(pot / (pot + bet || 1))}</b>`;
      const bp = v('#bl-pot'), bb = v('#bl-bet');
      $('#bl-out').innerHTML = `Must work <b>${pct(bb / (bp + bb || 1))}</b> of the time to break even.`;
      const ss = v('#spr-stack'), sp = v('#spr-pot');
      const spr = sp ? ss / sp : 0;
      $('#spr-out').innerHTML = `SPR: <b>${spr.toFixed(1)}</b><br><span class="muted">${spr < 3 ? 'Low — top pair+ is usually happy to stack off.' : spr < 8 ? 'Medium — two pair+ or strong top pair to commit.' : 'High — need very strong hands to play for stacks.'}</span>`;
      const ip = v('#io-pot'), ib = v('#io-bet'), ie = Math.min(100, v('#io-eq')) / 100;
      // EV = eq * (pot + bet + X) - (1 - eq) * bet >= 0  =>  X >= bet * (1 - eq) / eq - (pot + bet)
      const x = ie > 0 ? Math.max(0, ib * (1 - ie) / ie - (ip + ib)) : Infinity;
      $('#io-out').innerHTML = `Direct odds need <b>${pct(ib / (ip + 2 * ib || 1))}</b>.<br>You must win <b>${isFinite(x) ? x.toFixed(1) : '∞'}</b> more on later streets when you hit.`;
    };
    $$('#spots-math input').forEach(i => (i.oninput = upd));
    upd();
  },

  renderConcepts() {
    $('#spots-concepts').innerHTML = `<div class="card-grid">${CONCEPTS.map(c => `<div class="info-card"><h4>${c.t}</h4><p>${c.d}</p></div>`).join('')}</div>`;
  },
};
