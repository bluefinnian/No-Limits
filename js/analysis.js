'use strict';
/* Post-hand decision analysis for the Practice Arena.
 * Grades every hero decision on action, sizing, range and position, using
 * equity against opponents' estimated ranges (built from their player type
 * and actions) plus hindsight equity against their actual cards. */

const VERDICT_RANK = { good: 0, ok: 1, mistake: 2 };
const VERDICT_LABEL = { good: 'Good', ok: 'Okay', mistake: 'Mistake', info: 'Info' };

/* Standard 6-max raise-first-in frequencies. */
const RFI = { UTG: 0.15, 'UTG+1': 0.12, MP: 0.14, LJ: 0.17, HJ: 0.19, CO: 0.27, BTN: 0.45, SB: 0.40, BB: 0 };

const Analysis = {
  /* ---------- small helpers ---------- */
  bbs(x, bb) { return `${+(x / bb).toFixed(1)}bb`; },
  worst(...vs) { return vs.filter(v => v && v in VERDICT_RANK).sort((a, b) => VERDICT_RANK[b] - VERDICT_RANK[a])[0] || 'good'; },
  pct(x) { return Math.round(x * 100) + '%'; },

  rfiFor(pos, n) {
    if (n === 2) return pos === 'BTN' ? 0.8 : 0;
    if (n === 3 && pos === 'BTN') return 0.5;
    if (n >= 7 && pos === 'UTG') return 0.11;
    return RFI[pos] || 0.2;
  },

  /** Postflop acting order (0 = first to act). */
  order(h, id) {
    const n = h.players.length;
    return (id - h.dealer - 1 + n) % n;
  },

  isPair: code => code.length === 2,
  isSuited: code => code[2] === 's',

  boardTexture(board) {
    if (board.length < 3) return { wet: false, desc: '' };
    const suits = [0, 0, 0, 0];
    let mask = 0;
    for (const c of board) { suits[c & 3]++; mask |= 1 << (c >> 2); }
    const maxSuit = Math.max(...suits);
    const m = (mask << 1) | ((mask >> 12) & 1);
    let connected = 0;
    for (let lo = 0; lo <= 9; lo++) {
      let cnt = 0;
      for (let k = 0; k < 5; k++) if (m & (1 << (lo + k))) cnt++;
      connected = Math.max(connected, cnt);
    }
    const paired = new Set(board.map(c => c >> 2)).size < board.length;
    const flushy = maxSuit >= (board.length >= 4 ? 3 : 2);
    const wet = flushy || connected >= 3;
    const parts = [];
    if (maxSuit >= 3) parts.push(maxSuit >= 4 ? 'four-flush' : 'flush possible');
    else if (maxSuit === 2) parts.push('flush draw possible');
    if (connected >= 4) parts.push('four to a straight');
    else if (connected === 3) parts.push('connected');
    if (paired) parts.push('paired');
    return { wet, desc: (wet ? 'Wet' : 'Dry') + (parts.length ? ` (${parts.join(', ')})` : '') };
  },

  /** True if the hole cards make a flush draw or a 4-card straight draw on this board. */
  hasDraw(hole, board) {
    if (board.length < 3 || board.length >= 5) return false;
    const all = [...hole, ...board];
    for (let s = 0; s < 4; s++) {
      const n = all.filter(c => (c & 3) === s).length;
      if (n === 4 && hole.some(c => (c & 3) === s)) return true;
    }
    let mask = 0, holeMask = 0;
    for (const c of all) mask |= 1 << (c >> 2);
    for (const c of hole) holeMask |= 1 << (c >> 2);
    const ext = x => (x << 1) | ((x >> 12) & 1);
    const m = ext(mask), hm = ext(holeMask);
    for (let lo = 0; lo <= 9; lo++) {
      const win = 31 << lo;
      let cnt = 0;
      for (let k = 0; k < 5; k++) if (m & (1 << (lo + k))) cnt++;
      if (cnt === 4 && (hm & win)) return true;
    }
    return false;
  },

  /* ---------- opponent range estimation ---------- */
  preflopKeep(prof, pos, nPlayers, type, levelBefore, isBB) {
    const posF = (POSITION_FACTOR[pos] || 1) * Math.sqrt(6 / nPlayers);
    let keep;
    if (type === 'raise') {
      keep = levelBefore === 0 ? prof.pfr * posF : levelBefore === 1 ? prof.threeBet * 1.15 : levelBefore === 2 ? prof.threeBet * 0.3 : 0.03;
    } else if (type === 'call') {
      if (levelBefore === 0) keep = prof.limps ? prof.vpip * posF : prof.vpip * 0.35;
      else if (levelBefore === 1) keep = Math.max(prof.threeBet, (prof.vpip - prof.pfr * 0.4) * 0.9) * (isBB ? 1.5 : 1);
      else if (levelBefore === 2) keep = prof.threeBet * 1.8;
      else keep = 0.04;
    } else {
      keep = 1;
    }
    // Slack for the AI's randomness.
    return Math.min(1, Math.max(0.025, keep * 1.2));
  },

  /** Estimated combos for an opponent at the moment of action index `upto`. */
  estimateRange(h, oppId, upto, dead) {
    const opp = h.players[oppId];
    const prof = PROFILES[opp.profile] || PROFILES.TAG;
    const n = h.players.filter(p => !p.out).length;
    let keep = 1;
    const desc = [];
    const acts = h.actions.slice(0, upto).filter(a => a.pid === oppId);

    for (const a of acts.filter(a => a.street === 0)) {
      if (a.type === 'fold' || a.type === 'check') continue;
      const k = this.preflopKeep(prof, opp.position, n, a.type, a.raiseLevel, opp.position === 'BB');
      keep = Math.min(keep, k);
      desc.push(a.type === 'raise' ? (a.raiseLevel === 0 ? 'opened' : a.raiseLevel === 1 ? '3-bet' : `${a.raiseLevel + 2}-bet`) : a.toCall === 0 ? 'checked' : a.raiseLevel === 0 ? 'limped' : 'called');
    }
    if (!acts.some(a => a.street === 0) && opp.position !== 'BB') {
      // Hasn't acted yet: assume their normal voluntary range.
      keep = Math.min(keep, Math.min(1, prof.vpip * 1.2));
    }

    let combos = [];
    for (const code of ALL_CODES) {
      if (HAND_PERCENTILE[code] > keep) continue;
      for (const c of Cards.combosForCode(code)) if (!dead.has(c[0]) && !dead.has(c[1])) combos.push(c);
    }

    // Postflop: narrow by the strongest action taken on each street.
    for (let s = 1; s <= 3; s++) {
      const streetActs = acts.filter(a => a.street === s);
      if (!streetActs.length) continue;
      const board = streetActs[0].board;
      const strongest = streetActs.some(a => a.type === 'raise') ? (streetActs.some(a => a.type === 'raise' && a.currentBet > 0) ? 'raise' : 'bet')
        : streetActs.some(a => a.type === 'call') ? 'call' : 'check';
      const scored = combos.map(c => ({ c, s: evaluateHand([...c, ...board]), d: this.hasDraw(c, board) }));
      scored.sort((a, b) => a.s - b.s);
      const len = scored.length;
      const ranked = scored.map((x, i) => ({ ...x, r: x.d ? Math.max(i / len, 0.65) : i / len }));
      let filtered;
      if (strongest === 'raise') {
        const valueFrac = 0.18, bluffFrac = prof.bluff * 0.15;
        filtered = ranked.filter(x => x.r >= 1 - valueFrac || x.r < bluffFrac);
      } else if (strongest === 'bet') {
        const valueFrac = 0.35 + prof.aggression * 0.1, bluffFrac = prof.bluff * 0.35;
        filtered = ranked.filter(x => x.r >= 1 - valueFrac || x.r < bluffFrac);
      } else if (strongest === 'call') {
        filtered = ranked.filter(x => x.r >= Math.max(0.05, 0.3 - prof.sticky));
      } else {
        filtered = prof.aggression < 0.4 ? ranked : ranked.filter(x => x.r <= 0.92);
      }
      if (filtered.length >= 3) combos = filtered.map(x => x.c);
      desc.push(`${strongest === 'raise' ? 'raised' : strongest === 'bet' ? 'bet' : strongest === 'call' ? 'called' : 'checked'} the ${STREET_NAMES[s].toLowerCase()}`);
    }
    return { combos, desc: desc.join(', ') || 'no action yet', keep };
  },

  /* ---------- main entry ---------- */
  analyzeHand(h, helper) {
    const hero = h.players.find(p => p.isHero);
    const steps = [];
    h.actions.forEach((a, i) => { if (a.pid === hero.id) steps.push(this.analyzeStep(h, i, helper)); });
    const counts = { good: 0, ok: 0, mistake: 0 };
    steps.forEach(s => counts[s.verdict]++);
    return { steps, counts, hero };
  },

  analyzeStep(h, idx, helper) {
    const a = h.actions[idx];
    const bb = h.bb;
    const hero = h.players.find(p => p.isHero);
    const heroCards = hero.cards;
    const code = Cards.handCode(heroCards[0], heroCards[1]);
    const n = h.players.filter(p => !p.out).length;
    const board = a.board;
    const dead = new Set([...heroCards, ...board]);
    const need = a.toCall > 0 ? a.toCall / (a.pot + a.toCall) : 0;
    const prior = h.actions.slice(0, idx);

    // Opponents relevant to this decision.
    let opps = a.live.filter(id => id !== hero.id);
    if (a.street === 0) {
      const entered = new Set(prior.filter(x => x.street === 0 && (x.type === 'raise' || x.type === 'call')).map(x => x.pid));
      const bigBlindLive = h.players.find(p => p.position === 'BB' && p.id !== hero.id && a.live.includes(p.id));
      opps = opps.filter(id => entered.has(id));
      if (!opps.length && bigBlindLive) opps = [bigBlindLive.id];
    }
    const villains = opps.map(id => {
      const est = this.estimateRange(h, id, idx, dead);
      return { id, name: h.players[id].name, profile: h.players[id].profile, position: h.players[id].position, cards: h.players[id].cards, est };
    });

    const iters = 1400;
    const estEq = villains.length ? calcEquity([heroCards, ...villains.map(v => (v.est.combos.length ? { combos: v.est.combos } : null))], board, iters)[0] : 1;
    // Opponents' cards may be unknown (e.g. hands entered from live sessions).
    const allKnown = villains.every(v => Array.isArray(v.cards) && v.cards.length === 2);
    const actualEq = !allKnown ? null : villains.length ? calcEquity([heroCards, ...villains.map(v => v.cards)], board, iters)[0] : 1;

    const nOpp = Math.max(1, villains.length);
    const hs = Math.pow(estEq, 1 / nOpp);
    const lastAggressor = [...prior].reverse().find(x => x.street === a.street && x.type === 'raise');
    const aggressor = lastAggressor ? h.players[lastAggressor.pid] : null;
    const effStack = Math.min(a.stackBefore + a.betBefore, Math.max(...villains.map(v => a.stacks[v.id] + (prior.filter(x => x.pid === v.id && x.street === a.street).pop()?.amount || 0)), 0) || Infinity);
    const isAllInCall = a.toCall >= a.stackBefore;
    const heroOrder = this.order(h, hero.id);
    const ip = villains.every(v => this.order(h, v.id) < heroOrder);

    const ctx = {
      h, a, idx, bb, hero, code, n, board, need, prior, villains, estEq, actualEq, hs, aggressor,
      effStack, isAllInCall, ip, pct: HAND_PERCENTILE[code], helper, pos: hero.position,
      texture: this.boardTexture(board), nOpp,
    };

    const decision = a.type === 'fold' && a.toCall === 0
      ? { verdict: 'mistake', rec: 'check', ok: [], reasons: ['You folded when you could check for free. Never fold when checking is an option — you give up all your equity for nothing.'] }
      : a.street === 0 ? this.preflopDecision(ctx) : this.postflopDecision(ctx);
    const sizing = this.sizing(ctx, decision);
    const range = this.rangeCard(ctx);
    const position = this.positionCard(ctx, decision);
    const tells = this.tellsCard(ctx);
    const verdict = this.worst(decision.verdict, sizing && sizing.verdict, range.verdict === 'mistake' ? 'mistake' : null);

    return {
      idx, street: a.street, action: a, verdict, decision, sizing, range, position, villains,
      eq: { est: estEq, actual: actualEq, need },
      hindsight: this.hindsight(ctx),
      tells,
      texture: ctx.texture, ip, spr: a.street > 0 && a.pot ? Math.min(effStack, a.stackBefore) / a.pot : null,
    };
  },

  heroDid(a) {
    if (a.type === 'raise') return 'raise';
    if (a.type === 'call') return 'call';
    if (a.type === 'check') return 'check';
    return 'fold';
  },

  actionLabel(a, bb) {
    if (a.type === 'fold') return 'Fold';
    if (a.type === 'check') return 'Check';
    if (a.type === 'call') return `Call ${this.bbs(a.added, bb)}${a.allIn ? ' (all-in)' : ''}`;
    return `${a.allIn ? 'All-in' : a.currentBet === 0 ? 'Bet' : 'Raise to'} ${this.bbs(a.amount, bb)}`;
  },

  /** Builds a verdict from a recommended action and acceptable alternatives. */
  grade(did, rec, ok, reasons) {
    const norm = x => (x === 'check' ? 'call' : x);
    let verdict;
    if (did === rec || (norm(did) === norm(rec) && did !== 'fold')) verdict = 'good';
    else if (ok.includes(did) || ok.includes(norm(did))) verdict = 'ok';
    else verdict = 'mistake';
    return { verdict, rec, ok, reasons };
  },

  suggestedSize(ctx, rec) {
    const { a, bb, hs, texture, pos } = ctx;
    if (rec !== 'raise') return null;
    let to;
    if (a.street === 0) {
      const limpers = ctx.prior.filter(x => x.street === 0 && x.type === 'call' && x.raiseLevel === 0).length;
      if (a.raiseLevel === 0) to = bb * ((pos === 'SB' ? 3 : 2.5) + limpers);
      else if (a.raiseLevel === 1) to = a.currentBet * (ctx.ip ? 3 : 4) + ctx.prior.filter(x => x.street === 0 && x.type === 'call' && x.raiseLevel === 1).length * a.currentBet;
      else to = a.currentBet * 2.3;
    } else if (a.currentBet === 0) {
      const frac = hs > 0.68 ? (texture.wet ? 0.75 : 0.66) : hs > 0.5 ? 0.4 : texture.wet ? 0.6 : 0.33;
      to = a.pot * frac;
    } else {
      to = a.currentBet * 3 + (a.pot - a.currentBet) * 0.3;
    }
    to = Math.min(to, a.maxRaiseTo);
    if (to > a.maxRaiseTo * 0.7) to = a.maxRaiseTo;
    return to;
  },

  recLabel(ctx, rec) {
    const { a, bb } = ctx;
    if (rec === 'fold') return 'Fold';
    if (rec === 'check') return 'Check';
    if (rec === 'call') return a.toCall > 0 ? `Call ${this.bbs(a.toCall, bb)}` : 'Check';
    const to = this.suggestedSize(ctx, rec);
    if (to >= a.maxRaiseTo) return `All-in ${this.bbs(a.maxRaiseTo, bb)}`;
    if (a.street > 0 && a.currentBet === 0) return `Bet ${this.bbs(to, bb)} (~${this.pct(to / a.pot)} pot)`;
    return `Raise to ${this.bbs(to, bb)}`;
  },

  typeMod(profile) {
    return { MANIAC: 1.7, LAG: 1.35, FISH: 1.2, STATION: 1.2, REG: 1, TAG: 0.9, NIT: 0.6 }[profile] || 1;
  },

  /* ---------- preflop ---------- */
  preflopDecision(ctx) {
    const { a, pct, pos, n, code, bb, aggressor, estEq, need, isAllInCall } = ctx;
    const did = this.heroDid(a);
    const r = [];
    const top = this.pct(pct);
    const stackBB = (a.stackBefore + a.betBefore) / bb;

    // Facing an all-in (or a call that commits us): pure equity decision.
    if (a.toCall > 0 && (isAllInCall || a.toCall >= a.stackBefore * 0.6)) {
      r.push(`This is effectively an all-in decision: you need <b>${this.pct(need)}</b> equity and have about <b>${this.pct(estEq)}</b> against their estimated range.`);
      const rec = estEq >= need ? 'call' : 'fold';
      const ok = Math.abs(estEq - need) < 0.04 ? ['call', 'fold'] : [];
      r.push(rec === 'call' ? 'The price is good enough — continue.' : 'You\'re not getting the right price — fold.');
      return this.grade(did, rec, ok, r);
    }

    if (a.raiseLevel === 0) {
      const limpers = ctx.prior.filter(x => x.street === 0 && x.type === 'call' && x.raiseLevel === 0).length;
      if (pos === 'BB' && a.toCall === 0) {
        const rec = pct < (limpers ? 0.1 : 0.15) ? 'raise' : 'check';
        r.push(limpers ? `${limpers} limper${limpers > 1 ? 's' : ''} and you have the option in the big blind.` : 'Everyone limped to you in the big blind.');
        r.push(rec === 'raise' ? `${code} (top ${top}) is strong enough to raise for value and take the initiative.` : `${code} (top ${top}) plays fine as a free check — no need to build a pot out of position.`);
        return this.grade(did, rec, pct < 0.3 ? ['raise', 'check'] : ['check'], r);
      }
      const th = this.rfiFor(pos, n);
      if (!limpers) {
        r.push(`Folded to you in the <b>${pos}</b>. A standard ${pos} opening range is about <b>${this.pct(th)}</b> of hands; ${code} is in the top <b>${top}</b>.`);
        if (pct < th) {
          r.push('Raise first in — open-raising wins the blinds often and builds a pot with the initiative.');
          return this.grade(did, 'raise', pos === 'SB' && did === 'call' ? ['call'] : [], r.concat(did === 'call' ? ['Open-limping gives up fold equity and the initiative.'] : []));
        }
        r.push(pct < th * 1.2 ? 'It\'s a borderline hand: folding is standard, raising occasionally is fine.' : 'This hand is outside the range — fold.');
        const ok = pct < th * 1.2 ? ['raise'] : pos === 'SB' && pct < 0.6 ? ['call'] : [];
        return this.grade(did, 'fold', ok, r);
      }
      const iso = (th || 0.15) * 0.7;
      r.push(`${limpers} player${limpers > 1 ? 's' : ''} limped in front of you. ${code} is in the top ${top}.`);
      if (pct < iso) {
        r.push('Isolate: raise to about 2.5bb plus 1bb per limper to play a bigger pot against weak limpers with position or a better hand.');
        return this.grade(did, 'raise', pct < iso * 0.5 ? [] : ['call'], r);
      }
      const speculative = this.isPair(code) || this.isSuited(code);
      if (pct < (th || 0.2) * 1.3 && speculative) {
        r.push('Over-limping with a speculative hand (pairs, suited hands) is fine — you get a good multiway price.');
        return this.grade(did, 'call', ['raise', 'fold'], r);
      }
      r.push('Not strong enough to isolate and not speculative enough to over-limp — fold.');
      return this.grade(did, 'fold', pct < th ? ['call'] : [], r);
    }

    const raiser = aggressor || { position: '?', profile: 'TAG', name: 'Villain' };
    const mod = this.typeMod(raiser.profile);
    const late = ['CO', 'BTN', 'SB'].includes(raiser.position);
    const raiseBB = a.currentBet / bb;
    const typeName = PROFILES[raiser.profile] ? PROFILES[raiser.profile].name : 'player';

    if (a.raiseLevel === 1) {
      const sizeAdj = raiseBB <= 2.6 ? 1 : raiseBB <= 3.6 ? 0.85 : 0.65;
      const tb = (late ? 0.06 : 0.04) * mod;
      let call = pos === 'BB' ? (late ? 0.38 : 0.25) * sizeAdj * mod
        : pos === 'SB' ? 0.05 * mod
          : (late ? 0.14 : 0.1) * sizeAdj * mod;
      r.push(`${raiser.name} (${typeName}) opened to <b>${this.bbs(a.currentBet, bb)}</b> from the ${raiser.position}. ${code} is in the top <b>${top}</b>.`);
      if (stackBB < 25) {
        const jam = 0.12 * mod;
        r.push(`With only ${stackBB.toFixed(0)}bb, flatting is awkward — it's a shove-or-fold spot (shove roughly the top ${this.pct(jam)}).`);
        return this.grade(did, pct < jam ? 'raise' : 'fold', pct < jam * 1.2 ? ['call'] : [], r);
      }
      if (mod > 1.2) r.push(`${typeName}s open wide, so you can 3-bet and defend wider than normal.`);
      if (mod < 0.8) r.push(`${typeName}s open very tight — tighten up your continuing range.`);
      if (pct < tb) {
        r.push(`Strong enough to <b>3-bet for value</b> (about the top ${this.pct(tb)} vs this opener).`);
        return this.grade(did, 'raise', pct < 0.02 || pos !== 'SB' ? ['call'] : [], r);
      }
      if (pct < call) {
        if (pos === 'BB') r.push(`In the big blind you're getting ${this.pct(need)} pot odds, so defend wide by calling.`);
        else r.push(`Good enough to <b>call</b>${ctx.ip ? ' in position' : ''} — 3-betting would fold out worse hands and get called by better.`);
        const ok = ['raise'];
        if (this.isSuited(code) && code[0] === 'A') r.push('Suited aces also make good 3-bet bluffs.');
        return this.grade(did, 'call', ok, r);
      }
      if (pos === 'SB' && pct < 0.12 * mod) r.push('From the small blind, prefer 3-bet-or-fold: flatting invites a squeeze and you\'ll play out of position.');
      r.push(`Too weak to continue against this open — <b>fold</b>.`);
      const ok = pct < call * 1.3 ? ['call'] : [];
      if (this.isSuited(code) && code[0] === 'A' && late) ok.push('raise');
      return this.grade(did, 'fold', ok, r);
    }

    if (a.raiseLevel === 2) {
      const four = 0.025 * mod, call = (ctx.ip ? 0.07 : 0.05) * mod;
      r.push(`Facing a 3-bet to <b>${this.bbs(a.currentBet, bb)}</b> from ${raiser.name} (${typeName}). ${code} is in the top <b>${top}</b>.`);
      if (pct < four) { r.push('This is a <b>4-bet for value</b> hand.'); return this.grade(did, 'raise', ['call'], r); }
      if (pct < call) { r.push(`Strong enough to <b>call</b>${ctx.ip ? ' in position' : ''}, but not to 4-bet for value.`); return this.grade(did, 'call', ['raise'], r); }
      r.push('Against a 3-bet, continue only with the top few percent of hands — fold.');
      return this.grade(did, 'fold', pct < call * 1.4 ? ['call'] : [], r);
    }

    const cont = 0.022 * mod;
    r.push(`Facing a ${a.raiseLevel + 2}-bet. Ranges are very narrow here; ${code} is in the top <b>${top}</b>.`);
    if (pct < cont) { r.push('Get it in.'); return this.grade(did, 'raise', ['call'], r); }
    r.push('Only premium hands continue at this point — fold.');
    return this.grade(did, 'fold', [], r);
  },

  /* ---------- postflop ---------- */
  postflopDecision(ctx) {
    const { a, estEq, need, hs, villains, ip, h, hero, nOpp, isAllInCall, texture, bb } = ctx;
    const did = this.heroDid(a);
    const r = [];
    const street = STREET_NAMES[a.street].toLowerCase();
    const madeHand = describeHand(evaluateHand([...hero.cards, ...a.board]));
    const draw = this.hasDraw(hero.cards, a.board);
    const types = villains.map(v => v.profile);
    const vsStation = types.some(t => t === 'STATION' || t === 'FISH');
    const wasAggressor = h.actions.filter(x => x.street === 0 && x.type === 'raise').pop()?.pid === hero.id;

    r.push(`On the ${street} you have <b>${madeHand}</b>${draw ? ' plus a draw' : ''}. Against ${nOpp > 1 ? 'your opponents\'' : `${villains[0]?.name || 'the'}'s`} estimated range${nOpp > 1 ? 's' : ''} you have about <b>${this.pct(estEq)}</b> equity.`);

    if (a.toCall > 0) {
      r.push(`You need <b>${this.pct(need)}</b> to call ${this.bbs(a.toCall, bb)} into ${this.bbs(a.pot, bb)}.`);
      if (hs > 0.72 && a.canRaise && !isAllInCall) {
        r.push('You\'re well ahead of their betting range — <b>raise for value</b> to build the pot.');
        if (a.street === 3) r.push('On the river, a raise only gets called by worse if they\'re loose; calling is also reasonable.');
        return this.grade(did, 'raise', ['call'], r);
      }
      if (estEq >= need + 0.03) {
        r.push(estEq >= need + 0.15 ? 'You have comfortably more equity than you need — <b>call</b>.' : 'You have enough equity to <b>call</b>.');
        const ok = hs > 0.55 && a.street < 3 && a.canRaise ? ['raise'] : [];
        return this.grade(did, 'call', ok, r);
      }
      if (estEq >= need - 0.06 && a.street < 3 && !isAllInCall) {
        r.push('Slightly short on direct odds, but <b>implied odds</b> (winning more when you hit) make a call acceptable.');
        return this.grade(did, 'call', ['fold'], r);
      }
      r.push('Your equity is below the price you\'re being offered — <b>fold</b>.');
      if (draw && a.street < 3 && a.canRaise && nOpp === 1) r.push('A semi-bluff raise is possible against players who fold a lot, but calling is a mistake at this price.');
      return this.grade(did, 'fold', estEq >= need - 0.03 ? ['call'] : (draw && nOpp === 1 && !vsStation ? ['raise'] : []), r);
    }

    // No bet in front of us.
    if (hs > 0.68) {
      r.push(`Your hand is strong relative to their range — <b>bet for value</b>${texture.wet ? ', especially on this wet board where draws can outrun you' : ''}.`);
      const trap = hs > 0.85 || types.some(t => t === 'MANIAC' || t === 'LAG');
      const ok = trap || hs < 0.78 ? ['check'] : [];
      if (trap) r.push('Checking to trap is acceptable against aggressive players or with a near-lock.');
      else if (ok.length) r.push('Checking isn\'t terrible, but it gives up value and lets draws see a free card.');
      return this.grade(did, 'raise', ok, r);
    }
    if (hs > 0.5) {
      if (vsStation) {
        r.push('Medium strength against a calling station — <b>bet for thin value</b>; they call with worse.');
        return this.grade(did, 'raise', ['check'], r);
      }
      r.push(`A medium-strength hand: ${ip ? 'betting for thin value or checking back for showdown are both fine' : '<b>check</b> to control the pot out of position'}.`);
      return this.grade(did, ip ? 'raise' : 'check', ['raise', 'check'], r);
    }
    if (wasAggressor && a.street === 1 && nOpp === 1 && !vsStation) {
      r.push(`You were the preflop raiser heads-up — a small <b>c-bet</b> works well${texture.wet ? ', though this board hits the caller more' : ' on this dry board'}.`);
      return this.grade(did, 'raise', ['check'], r);
    }
    if (nOpp >= 2) {
      r.push('Weak hand in a multiway pot — bluffs rarely get through multiple players. <b>Check</b>.');
      return this.grade(did, 'check', estEq > 0.3 ? ['raise'] : [], r);
    }
    if (vsStation) {
      r.push('Don\'t bluff calling stations — they won\'t fold. <b>Check</b> and give up or take a free card.');
      return this.grade(did, 'check', [], r);
    }
    r.push(`Weak hand heads-up: <b>check</b>${draw ? ', or semi-bluff with your draw' : ''}${ip ? '; an occasional bluff in position is fine' : ''}.`);
    return this.grade(did, 'check', draw || ip || estEq > 0.3 ? ['raise'] : [], r);
  },

  /* ---------- sizing ---------- */
  sizing(ctx, decision) {
    const { a, bb, hs, texture, pos } = ctx;
    if (a.type !== 'raise') return null;
    const r = [];
    let verdict = 'good';
    const jam = a.allIn;
    if (a.street === 0) {
      const limpers = ctx.prior.filter(x => x.street === 0 && x.type === 'call' && x.raiseLevel === 0).length;
      if (a.raiseLevel === 0) {
        const sizeBB = a.amount / bb - limpers;
        const ideal = pos === 'SB' ? [2.5, 3.5] : [2, 3.2];
        r.push(`You raised to ${this.bbs(a.amount, bb)}${limpers ? ` with ${limpers} limper${limpers > 1 ? 's' : ''} (≈${sizeBB.toFixed(1)}bb + 1bb each)` : ''}.`);
        if (jam && a.amount / bb > 25) { verdict = 'mistake'; r.push('Open-shoving deep risks a lot to win the blinds and only gets called by better hands.'); }
        else if (sizeBB < ideal[0] - 0.01) { verdict = 'ok'; r.push('That\'s a small open — fine in some spots, but standard is 2–3bb (3bb from the SB).'); }
        else if (sizeBB > ideal[1] + 1) { verdict = sizeBB > 6 ? 'mistake' : 'ok'; r.push(`Larger than standard (${ideal[0]}–${ideal[1]}bb${limpers ? ' + 1bb per limper' : ''}). Big opens risk more to win the same blinds.`); }
        else r.push(`Standard sizing (${ideal[0]}–${ideal[1]}bb${limpers ? ' + 1bb per limper' : ''}).`);
      } else {
        const ratio = a.amount / a.currentBet;
        const ideal = a.raiseLevel === 1 ? (ctx.ip ? [2.6, 3.6] : [3.2, 4.6]) : [2, 2.8];
        const what = a.raiseLevel === 1 ? '3-bet' : `${a.raiseLevel + 2}-bet`;
        r.push(`Your ${what} was ${ratio.toFixed(1)}x the previous bet.`);
        if (jam && (a.stackBefore + a.betBefore) / bb <= 40) r.push('Shoving is a fine size with this stack depth.');
        else if (ratio < ideal[0] - 0.2) { verdict = 'ok'; r.push(`On the small side — standard is ${ideal[0]}–${ideal[1]}x ${ctx.ip ? 'in position' : 'out of position'}. Small re-raises give great odds to call.`); }
        else if (ratio > ideal[1] + 1.2) { verdict = jam ? 'ok' : 'mistake'; r.push(`Much bigger than needed (standard ${ideal[0]}–${ideal[1]}x). You risk too much and only get called by strong hands.`); }
        else r.push(`Good sizing (standard ${ideal[0]}–${ideal[1]}x ${ctx.ip ? 'in position' : 'out of position'}).`);
      }
      return { verdict, text: r };
    }

    const potBefore = a.pot; // pot before our bet (includes earlier bets this street)
    if (a.currentBet === 0) {
      const f = a.amount / potBefore;
      r.push(`You bet ${this.bbs(a.amount, bb)} into ${this.bbs(potBefore, bb)} (${this.pct(f)} pot) on a ${texture.desc.toLowerCase()} board.`);
      const spr = a.stackBefore / Math.max(1, potBefore);
      if (jam && spr < 1.6) { r.push('With a low stack-to-pot ratio, shoving is a natural size.'); return { verdict, text: r }; }
      if (hs > 0.68) {
        const lo = texture.wet ? 0.5 : 0.4;
        if (f < 0.3) { verdict = 'ok'; r.push(`Too small for a strong hand — bet ${texture.wet ? '60–80%' : '50–75%'} to get value${texture.wet ? ' and charge draws' : ''}.`); }
        else if (f < lo && texture.wet) { verdict = 'ok'; r.push('On a wet board, bet bigger to charge draws.'); }
        else if (f > 1.6) { verdict = 'ok'; r.push('An overbet can work with a very strong hand, but it narrows the hands that call you.'); }
        else r.push('Good value sizing.');
      } else if (hs > 0.5) {
        if (f > 1.0) { verdict = 'mistake'; r.push('Too big for a medium hand — worse hands fold and better hands call. Use ~25–50% pot or check.'); }
        else if (f > 0.75) { verdict = 'ok'; r.push('Medium hands prefer smaller bets (~25–50% pot) for thin value and protection.'); }
        else r.push('Sensible thin-value / protection sizing.');
      } else {
        if (f < 0.25) { verdict = 'ok'; r.push('Tiny bluffs rarely fold anyone out. Use ~33% on dry boards, 50–75% on wet boards.'); }
        else if (f > 1.3) { verdict = 'ok'; r.push('Big bluffs need to work very often — make sure the story is believable.'); }
        else r.push(`Reasonable bluff / c-bet sizing (a bluff at this size needs to work ${this.pct(a.amount / (potBefore + a.amount))} of the time).`);
      }
      return { verdict, text: r };
    }

    const ratio = a.amount / a.currentBet;
    r.push(`You raised to ${ratio.toFixed(1)}x their bet.`);
    if (jam && a.stackBefore / Math.max(1, a.pot) < 2) r.push('Shoving is fine with this little behind.');
    else if (ratio < 2.2) { verdict = 'ok'; r.push('A min-raise gives them a great price to continue. Raise to 2.5–3.5x.'); }
    else if (ratio > 5 && !jam) { verdict = 'ok'; r.push('Larger than needed — 2.5–3.5x usually achieves the same thing.'); }
    else r.push('Good raise sizing (2.5–3.5x).');
    return { verdict, text: r };
  },

  /* ---------- range ---------- */
  rangeCard(ctx) {
    const { a, code, pct, pos, helper, villains, hero, bb } = ctx;
    const r = [];
    let verdict = 'info';
    let freq = null;
    const firstPreflop = a.street === 0 && !ctx.prior.some(x => x.pid === hero.id && x.street === 0);
    if (firstPreflop && helper && helper.range && helper.roll == null) {
      freq = handFreq(helper.range, code);
      const did = this.heroDid(a);
      const f = did === 'raise' ? freq.r : did === 'fold' ? freq.f : a.toCall === 0 ? 100 : freq.c;
      const best = Math.max(freq.r, freq.c, freq.f);
      r.push(`Your range <b>${esc(helper.range.name)}</b>: ${code} is raise ${freq.r}% / call ${freq.c}% / fold ${freq.f}%.`);
      verdict = f === 0 ? 'mistake' : f === best ? 'good' : 'ok';
      r.push(f === 0 ? `<b>${did.toUpperCase()}</b> isn't part of your range for this hand.` : f === best ? `<b>${did.toUpperCase()}</b> is your range's main action here.` : `<b>${did.toUpperCase()}</b> is in your range ${f}% of the time.`);
    } else if (firstPreflop && helper && helper.range) {
      freq = handFreq(helper.range, code);
      const target = actionForRoll(freq, helper.roll);
      const did = this.heroDid(a);
      const didNorm = did === 'check' ? (target === 'fold' ? 'fold' : 'call') : did;
      const inRange = (did === 'raise' && freq.r > 0) || ((did === 'call' || did === 'check') && (freq.c > 0 || a.toCall === 0)) || (did === 'fold' && freq.f > 0);
      r.push(`Your range <b>${esc(helper.range.name)}</b>: ${code} is raise ${freq.r}% / call ${freq.c}% / fold ${freq.f}%.`);
      r.push(`RNG roll <b>${helper.roll}</b> said <b>${target.toUpperCase()}</b>; you chose <b>${did.toUpperCase()}</b>.`);
      if (didNorm === target) { verdict = 'good'; r.push('✓ You followed your range and randomization.'); }
      else if (inRange) { verdict = 'ok'; r.push('That action is part of your range, but not what the roll called for — stick to the RNG to stay balanced.'); }
      else { verdict = 'mistake'; r.push('That action isn\'t in your range at all for this hand.'); }
    } else if (a.street === 0) {
      r.push(`${code} is in the top <b>${this.pct(pct)}</b> of starting hands (${HAND_ORDER.indexOf(code) + 1} of 169).`);
      if (firstPreflop && !(helper && helper.lab)) r.push(helper && !helper.range ? `No saved range for ${pos} — build one in the Range Builder to check your discipline here.` : 'Turn on the Range Helper to compare with your own ranges.');
    }
    if (a.street > 0 && villains.length) {
      const heroScore = evaluateHand([...hero.cards, ...a.board]);
      for (const v of villains) {
        const combos = v.est.combos;
        if (!combos.length) continue;
        let beat = 0;
        for (const c of combos) if (evaluateHand([...c, ...a.board]) < heroScore) beat++;
        r.push(`Vs <b>${esc(v.name)}</b>'s estimated range (${esc(PROFILES[v.profile].label)}, ${v.est.desc}; ~${combos.length} combos) you currently beat <b>${this.pct(beat / combos.length)}</b> of hands.`);
      }
    } else if (a.street === 0 && villains.length && ctx.prior.some(x => x.street === 0 && x.type === 'raise')) {
      for (const v of villains) r.push(`${esc(v.name)} (${esc(PROFILES[v.profile].label)}) ${v.est.desc}: roughly the top ${this.pct(v.est.keep)} of hands.`);
    }
    return { verdict, text: r, freq, roll: helper && helper.roll, rangeName: helper && helper.range && helper.range.name };
  },

  /* ---------- position ---------- */
  positionCard(ctx, decision) {
    const { a, pos, ip, n, villains, estEq, need, pct } = ctx;
    const r = [];
    let verdict = 'good';
    const did = this.heroDid(a);
    if (a.street === 0) {
      const layout = POSITION_LAYOUTS[n] || POSITION_LAYOUTS[6];
      const preflopOrder = n === 2 ? ['BTN', 'BB'] : [...layout.slice(3), 'BTN', 'SB', 'BB'];
      const behind = n - 1 - preflopOrder.indexOf(pos);
      const notes = {
        UTG: 'First to act with the whole table behind you — play your tightest range.',
        'UTG+1': 'Early position with most of the table behind you — play tight.',
        MP: 'Middle position — still fairly tight with several players behind.',
        LJ: 'Lojack — early-middle position, starting to widen slightly.',
        HJ: 'Early-middle position — still fairly tight.',
        CO: 'Late position — you can open a lot wider.',
        BTN: 'The best seat: you act last on every postflop street. Play your widest range.',
        SB: 'You\'ll be out of position against everyone postflop — prefer raising or folding over calling.',
        BB: 'You close the action preflop and get a discount, so defend wide, but you\'ll be out of position postflop.',
      };
      r.push(`<b>${pos}</b>${behind > 0 ? ` — ${behind} player${behind > 1 ? 's' : ''} left to act behind you` : ''}. ${notes[pos] || ''}`);
      if ((did === 'raise' || did === 'call') && a.raiseLevel === 0 && pos !== 'BB') {
        const th = this.rfiFor(pos, n);
        if (th && pct > th * 1.6) { verdict = 'mistake'; r.push(`${ctx.code} is much too loose to play from ${pos}.`); }
        else if (th && pct > th * 1.15) { verdict = 'ok'; r.push(`${ctx.code} is a bit loose for ${pos}.`); }
      }
      if (did === 'call' && pos === 'SB' && a.raiseLevel >= 1) { verdict = 'ok'; r.push('Flat-calling from the SB invites squeezes and leaves you out of position.'); }
      if (did === 'fold' && a.raiseLevel === 0 && pos === 'BTN' && pct < 0.4) { verdict = 'ok'; r.push('That\'s tight for the button — steal more often.'); }
    } else {
      r.push(ip ? `You're <b>in position</b> — you act last, see their action first and control the pot size.`
        : `You're <b>out of position</b>${villains.length > 1 ? ' against at least one player' : ''} — you act first, so favour pot control with medium hands and check-raise your strongest hands and draws.`);
      if (!ip && did === 'call' && estEq - need < 0.06 && a.street < 3) { verdict = 'ok'; r.push('Marginal calls out of position realise less equity than the raw numbers suggest.'); }
      if (ip && did === 'check' && a.toCall === 0 && decision.rec === 'raise') r.push('In position you could have bet and still controlled the pot later.');
      if (villains.length > 1) r.push(`Multiway pot (${villains.length + 1} players): ranges are stronger and bluffs work less often.`);
    }
    return { verdict, text: r };
  },

  /* ---------- tells ---------- */
  tellsCard(ctx) {
    const { h, idx, villains, hero, a, estEq, need } = ctx;
    const ids = new Set(villains.map(v => v.id));
    const list = (h.tells || []).filter(t => t.actionIdx < idx && ids.has(t.pid));
    if (!list.length) return null;
    const did = this.heroDid(a);
    const heroScore = a.board.length ? evaluateHand([...hero.cards, ...a.board]) : 0;
    const r = [];
    for (const t of list) {
      const v = villains.find(x => x.id === t.pid);
      const meaning = t.signal === 'strong' ? 'strength' : t.signal === 'weak' ? 'weakness' : 'nothing reliable';
      r.push(`<b>${esc(t.name)}</b> on the ${STREET_NAMES[t.street].toLowerCase()}: <i>"${esc(t.text)}"</i> — conventionally <b>${meaning}</b> (${t.reliability.toLowerCase()} reliability).`);

      // What did range and action already say before the tell?
      if (t.signal !== 'unclear') {
        let prior;
        if (a.board.length && v.est.combos.length) {
          let ahead = 0;
          for (const c of v.est.combos) if (evaluateHand([...c, ...a.board]) > heroScore) ahead++;
          const share = ahead / v.est.combos.length;
          const agrees = (t.signal === 'strong') === (share >= 0.5);
          prior = `Their estimated range (${esc(v.est.desc)}) was ahead of your hand ${this.pct(share)} of the time, so the tell <b>${agrees ? 'agreed with' : 'contradicted'}</b> what their range and betting already suggested${agrees ? '' : ' — a contradicting tell deserves less weight'}.`;
        } else {
          prior = `Their estimated range (${esc(v.est.desc)}) was roughly the top ${this.pct(v.est.keep)} of hands — use that as your starting point before the tell.`;
        }
        r.push(prior);
      }

      // What was the truth?
      if (t.honest === null) r.push(`They actually held ${esc(t.truth.label)} (${t.truth.strong ? 'strong' : 'weak'}). Unclear tells like this shouldn't move you either way.`);
      else r.push(`${t.honest ? '<span class="good">✓ Honest tell</span>' : '<span class="bad">✗ False tell</span>'} — they actually held <b>${esc(t.truth.label)}</b> (${t.truth.strong ? 'strong' : 'weak'}).`);

      // Did the hero follow it, and was that right this time?
      if (t.signal !== 'unclear' && did !== 'check') {
        const followed = t.signal === 'weak' ? did === 'call' || did === 'raise' : did === 'fold';
        const actedOn = did === 'call' || did === 'raise' || did === 'fold';
        if (actedOn) {
          const right = followed === !!t.honest;
          r.push(`You ${followed ? 'acted as if the tell was true' : 'did not follow the tell'} — <b class="${right ? 'good' : 'bad'}">${right ? 'that worked out this time' : 'it cost you this time'}</b>.`);
        }
      }
    }
    if (a.toCall > 0) {
      const gap = estEq - need;
      r.push(Math.abs(gap) < 0.08
        ? `This was a <b>close</b> spot (${this.pct(estEq)} equity vs ${this.pct(need)} needed) — exactly where a tell can tip the balance.`
        : `This wasn't close (${this.pct(estEq)} equity vs ${this.pct(need)} needed) — a tell alone shouldn't flip a clear decision.`);
    } else {
      r.push('Use tells to adjust close decisions (thin value bets, bluffs, sizing) — not to override range, position and pot odds.');
    }
    return { verdict: 'info', text: r };
  },

  /* ---------- hindsight ---------- */
  hindsight(ctx) {
    const { h, a, hero, villains } = ctx;
    const full = [...h.board, ...(h.runout || [])];
    if (full.length < 5 || !villains.length || ctx.actualEq === null) return '';
    const heroScore = evaluateHand([...hero.cards, ...full]);
    let best = null;
    for (const v of villains) {
      const s = evaluateHand([...v.cards, ...full]);
      if (!best || s > best.s) best = { v, s };
    }
    const lines = [];
    lines.push(`At this point you had <b>${this.pct(ctx.actualEq)}</b> equity against their actual cards (${villains.map(v => `${esc(v.name)}: ${v.cards.map(Cards.inline).join('')}`).join(', ')}).`);
    if (a.type === 'fold') {
      const res = heroScore > best.s ? 'would have <b class="good">won</b>' : heroScore === best.s ? 'would have <b>split</b>' : 'would have <b class="bad">lost</b>';
      lines.push(`If the hand had gone to showdown on ${full.slice(a.board.length).map(Cards.inline).join(' ')}, your ${describeHand(heroScore)} ${res} against ${esc(best.v.name)}'s ${describeHand(best.s)}.`);
    }
    lines.push('<span class="muted">Hindsight shows the result, not whether the decision was right — judge decisions on the estimated-range equity.</span>');
    return lines.join(' ');
  },
};
