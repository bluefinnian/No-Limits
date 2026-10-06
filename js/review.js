'use strict';
/* Hand Review panel: step through each hero decision of a finished hand. */

const Review = {
  hands: [],     // [{ h, helper, analysis }]
  current: -1,   // index into hands
  step: 0,

  init() {
    this.panel = $('#review-panel');
    $('#rv-close').onclick = () => this.close();
    $('#rv-deal').onclick = () => { this.close(); Arena.deal(); };
    $('#rv-hand').onchange = e => this.open(+e.target.value);
    document.addEventListener('keydown', e => {
      if (this.panel.hidden || !document.body.classList.contains('on-arena')) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); this.go(this.step + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(this.step - 1); }
    });
  },

  reset() {
    this.hands = [];
    this.current = -1;
    this.close();
  },

  addHand(h, helper) {
    if (!h) return;
    this.hands.push({ h, helper: helper ? { ...helper } : null, analysis: null });
    if (this.hands.length > 30) this.hands.shift();
  },

  get latestIndex() { return this.hands.length - 1; },
  isOpen() { return !this.panel.hidden; },

  close() {
    this.panel.hidden = true;
    $('#btn-review').classList.remove('active');
  },

  open(i = this.latestIndex) {
    if (i < 0 || !this.hands[i]) return;
    clearTimeout(Arena.autoTimer); // don't auto-deal while reviewing
    this.current = i;
    this.step = 0;
    this.panel.hidden = false;
    $('#btn-review').classList.add('active');
    $('#rv-hand').innerHTML = this.hands.map((x, k) => {
      const hero = x.h.players.find(p => p.isHero);
      const net = hero.net / x.h.bb;
      return `<option value="${k}">Hand #${x.h.handNum} · ${Cards.handCode(hero.cards[0], hero.cards[1])} · ${net >= 0 ? '+' : ''}${net.toFixed(1)}bb</option>`;
    }).reverse().join('');
    $('#rv-hand').value = i;
    const entry = this.hands[i];
    if (!entry.analysis) {
      setHTML($('#rv-body'), '<div class="rv-loading">Analyzing your decisions…</div>');
      setTimeout(() => {
        entry.analysis = Analysis.analyzeHand(entry.h, entry.helper);
        if (this.current === i) this.render();
      }, 30);
    } else {
      this.render();
    }
    this.panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  go(step) {
    const entry = this.hands[this.current];
    if (!entry || !entry.analysis) return;
    const n = entry.analysis.steps.length;
    if (!n) return;
    this.step = Math.max(0, Math.min(n - 1, step));
    this.renderStep();
  },

  fmt(x) { return Analysis.bbs(x, this.hands[this.current].h.bb); },

  badge(v) { return `<span class="verdict v-${v}">${VERDICT_LABEL[v]}</span>`; },

  playerLabel(h, p) {
    const prof = PROFILES[p.profile];
    return `${esc(p.name)} ${p.isHero ? '' : `<span class="type-badge" style="background:${prof.color}">${prof.label}</span>`}`;
  },

  /* ---------- whole-hand view ---------- */
  render() {
    const { h, analysis } = this.hands[this.current];
    const hero = analysis.hero;
    const net = hero.net / h.bb;
    const c = analysis.counts;
    const foldStreet = id => {
      const f = h.actions.find(a => a.pid === id && a.type === 'fold');
      return f ? STREET_NAMES[f.street] : null;
    };
    const winners = new Map(h.results.map(r => [r.id, r]));
    const fullBoard = [...h.board, ...(h.runout || [])];

    const players = h.players.map(p => {
      const fs = foldStreet(p.id);
      const w = winners.get(p.id);
      const shown = fullBoard.length === 5 ? describeHand(evaluateHand([...p.cards, ...fullBoard])) : '';
      const status = w ? `<span class="good">Won ${this.fmt(w.amount)}</span>${w.hand ? ' · ' + w.hand : ''}`
        : fs ? `Folded ${fs.toLowerCase()}` : h.showdown ? '<span class="bad">Lost at showdown</span>' : '';
      return `<div class="rv-player ${p.isHero ? 'is-hero' : ''} ${fs ? 'is-folded' : ''} ${w ? 'is-winner' : ''}">
        <div class="rv-player-head"><span class="pos-badge">${p.position}</span>${this.playerLabel(h, p)}</div>
        <div class="board-row">${cardsHtml(p.cards, 'sm')}</div>
        <div class="rv-player-status">${status}</div>
        ${shown && fs ? `<div class="rv-player-would">Would have made: ${shown}</div>` : ''}
      </div>`;
    }).join('');

    const board = h.board.map(c => Cards.html(c, 'sm')).join('') +
      (h.runout || []).map(c => Cards.html(c, 'sm', 'undealt')).join('');

    const pills = analysis.steps.map((s, k) => `
      <button class="rv-pill v-${s.verdict}" data-step="${k}">
        <span>${STREET_NAMES[s.street]}</span><b>${Analysis.actionLabel(s.action, h.bb)}</b>
      </button>`).join('');

    setHTML($('#rv-body'), `
      <div class="rv-summary">
        <div class="rv-result ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${net.toFixed(1)} bb</div>
        <div class="rv-counts">
          <span class="verdict v-good">${c.good} good</span>
          <span class="verdict v-ok">${c.ok} okay</span>
          <span class="verdict v-mistake">${c.mistake} mistake${c.mistake === 1 ? '' : 's'}</span>
        </div>
        <div class="rv-board"><span class="label">Board${h.runout && h.runout.length ? ' (faded = not dealt)' : ''}</span><div class="board-row">${board || '<span class="muted">No flop</span>'}</div></div>
      </div>
      <div class="rv-players">${players}</div>
      ${analysis.steps.length ? `
        <div class="rv-nav">
          <button class="btn btn-sm" id="rv-prev">← Prev</button>
          <div class="rv-pills">${pills}</div>
          <button class="btn btn-sm" id="rv-next">Next →</button>
        </div>
        <div id="rv-step"></div>` : '<p class="hint">You had no decisions this hand (everyone folded to you, or you were out of chips).</p>'}
      <details class="rv-timeline"><summary>Full action timeline</summary><div id="rv-timeline"></div></details>`);

    $$('.rv-pill', this.panel).forEach(b => (b.onclick = () => this.go(+b.dataset.step)));
    if (analysis.steps.length) {
      $('#rv-prev').onclick = () => this.go(this.step - 1);
      $('#rv-next').onclick = () => this.go(this.step + 1);
      this.renderStep();
    }
    this.renderTimeline();
  },

  renderTimeline() {
    const { h, analysis } = this.hands[this.current];
    const stepByIdx = new Map(analysis.steps.map((s, k) => [s.idx, k]));
    let html = '';
    let street = -1;
    h.actions.forEach((a, i) => {
      if (a.street !== street) {
        street = a.street;
        html += `<div class="tl-street">${STREET_NAMES[street]} ${a.board.length ? a.board.map(Cards.inline).join(' ') : ''} <span class="muted">· pot ${this.fmt(a.pot)}</span></div>`;
      }
      const p = h.players[a.pid];
      const k = stepByIdx.get(i);
      html += `<div class="tl-line ${p.isHero ? 'tl-hero' : ''}" ${k !== undefined ? `data-step="${k}"` : ''}>
        <span class="pos-badge">${p.position}</span> ${esc(p.name)} — ${Analysis.actionLabel(a, h.bb)}
        ${k !== undefined ? this.badge(analysis.steps[k].verdict) : ''}</div>`;
      for (const t of (h.tells || []).filter(t => t.actionIdx === i)) {
        html += `<div class="tl-tell">👁 ${esc(t.text)} <span class="${t.honest === null ? 'muted' : t.honest ? 'good' : 'bad'}">${LiveTells.verdictLabel(t)} (${esc(t.truth.label)})</span></div>`;
      }
    });
    setHTML($('#rv-timeline'), html);
    $$('#rv-timeline [data-step]').forEach(el => (el.onclick = () => this.go(+el.dataset.step)));
  },

  /* ---------- single decision view ---------- */
  renderStep() {
    const { h, analysis } = this.hands[this.current];
    const s = analysis.steps[this.step];
    const a = s.action;
    const hero = analysis.hero;
    $$('.rv-pill', this.panel).forEach(b => b.classList.toggle('active', +b.dataset.step === this.step));
    $('#rv-prev').disabled = this.step === 0;
    $('#rv-next').disabled = this.step === analysis.steps.length - 1;

    // Action leading up to this decision on the same street.
    const before = h.actions.slice(0, s.idx).filter(x => x.street === a.street)
      .map(x => `<li><span class="pos-badge">${h.players[x.pid].position}</span> ${esc(h.players[x.pid].name)} ${Analysis.actionLabel(x, h.bb).toLowerCase()}</li>`).join('');

    const opp = s.villains.map(v => `
      <div class="rv-opp">
        <div><span class="pos-badge">${v.position}</span> ${this.playerLabel(h, h.players[v.id])}</div>
        <div class="board-row">${cardsHtml(v.cards, 'xs')}</div>
        <div class="muted small">${esc(v.est.desc)}</div>
      </div>`).join('');

    const eqBar = (label, val, cls) => `
      <div class="rv-eq-row"><span>${label}</span>
        <div class="rv-eq-bar ${cls}"><div style="width:${val * 100}%"></div>${s.eq.need ? `<i style="left:${s.eq.need * 100}%" title="Equity needed"></i>` : ''}</div>
        <b>${Analysis.pct(val)}</b></div>`;

    const better = s.decision.verdict !== 'good'
      ? `<div class="rv-better">Better: <b>${Analysis.recLabel({ ...this.ctxFor(s, h), a }, s.decision.rec)}</b>${s.decision.ok.length ? ` <span class="muted">(also fine: ${s.decision.ok.filter(x => x !== s.decision.rec).join(', ') || '—'})</span>` : ''}</div>`
      : `<div class="rv-better good">✓ This was the recommended play.</div>`;

    const card = (title, obj, extra = '', cls = '') => obj ? `
      <div class="rv-card ${cls}">
        <div class="rv-card-head"><h4>${title}</h4>${obj.verdict ? this.badge(obj.verdict) : ''}</div>
        ${extra}
        ${obj.text ? obj.text.map(t => `<p>${t}</p>`).join('') : obj.reasons.map(t => `<p>${t}</p>`).join('')}
      </div>` : '';

    const rangeExtra = s.range.freq ? freqBarHtml(s.range.freq) : '';

    setHTML($('#rv-step'), `
      <div class="rv-step">
        <div class="rv-spot">
          <div class="rv-spot-head">
            <span class="tag">${STREET_NAMES[a.street]}</span>
            <span>Decision ${this.step + 1} of ${analysis.steps.length}</span>
            ${this.badge(s.verdict)}
          </div>
          <div class="rv-mini-table">
            <div><span class="label">Your hand</span><div class="board-row">${cardsHtml(hero.cards, 'sm')}</div></div>
            <div><span class="label">Board</span><div class="board-row">${a.board.length ? cardsHtml(a.board, 'sm') : '<span class="muted">Preflop</span>'}</div></div>
          </div>
          <div class="stats-grid rv-facts">
            <div><span>Position</span><b>${hero.position} · ${a.street === 0 ? 'preflop' : s.ip ? 'IP' : 'OOP'}</b></div>
            <div><span>Pot</span><b>${this.fmt(a.pot)}</b></div>
            <div><span>To call</span><b>${a.toCall ? this.fmt(a.toCall) : '—'}</b></div>
            <div><span>Your stack</span><b>${this.fmt(a.stackBefore)}</b></div>
            ${s.spr !== null ? `<div><span>SPR</span><b>${s.spr.toFixed(1)}</b></div>` : ''}
            ${a.board.length ? `<div class="wide"><span>Texture</span><b>${s.texture.desc}</b></div>` : ''}
          </div>
          ${before ? `<div class="rv-before"><span class="label">Action before you</span><ul>${before}</ul></div>` : ''}
          <div class="rv-you">You: <b>${Analysis.actionLabel(a, h.bb)}</b></div>
          ${better}
          ${s.villains.length ? `<div class="rv-opps"><span class="label">Opponents in the hand (cards revealed)</span>${opp}</div>` : ''}
          <div class="rv-eq">
            ${eqBar('Equity vs estimated range', s.eq.est, 'est')}
            ${eqBar('Equity vs actual cards', s.eq.actual, 'actual')}
            ${s.eq.need ? `<div class="rv-need">Marker = equity needed to call (${Analysis.pct(s.eq.need)})</div>` : ''}
          </div>
        </div>
        <div class="rv-cards">
          ${card('Decision', s.decision)}
          ${card('Sizing', s.sizing)}
          ${card('Range', s.range, rangeExtra)}
          ${card('Position', s.position)}
          ${s.tells ? card('Tells', s.tells, '', 'rv-tells') : ''}
          ${s.hindsight ? `<div class="rv-card rv-hindsight"><div class="rv-card-head"><h4>Hindsight</h4></div><p>${s.hindsight}</p></div>` : ''}
        </div>
      </div>`);
  },

  /** Minimal context needed by Analysis.recLabel / suggestedSize. */
  ctxFor(s, h) {
    const hero = h.players.find(p => p.isHero);
    const hs = Math.pow(s.eq.est, 1 / Math.max(1, s.villains.length));
    return { a: s.action, bb: h.bb, hs, texture: s.texture, pos: hero.position, ip: s.ip, prior: h.actions.slice(0, s.idx) };
  },
};
