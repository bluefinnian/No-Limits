'use strict';
/* AI opponent profiles and decision making. */

const PROFILES = {
  TAG: {
    label: 'TAG', name: 'Tight-Aggressive', color: '#3b82f6',
    vpip: 0.22, pfr: 0.18, threeBet: 0.07, limps: false,
    aggression: 0.65, bluff: 0.15, sticky: 0.0, sizing: [0.5, 0.75], openSize: 2.5,
    stats: 'VPIP ~20-24 · PFR ~17-20 · AF ~3',
    description: 'Solid, selective and aggressive. Plays few hands but plays them hard. Rarely limps, c-bets often and folds to heavy resistance without a strong hand.',
    spot: 'Opens and 3-bets a reasonable range, rarely cold-calls weak hands, bets are usually backed by value or good draws.',
    exploit: 'Steal their blinds, float flops in position and fold to big turn/river aggression unless you have a strong hand. Their big bets are rarely bluffs.',
  },
  LAG: {
    label: 'LAG', name: 'Loose-Aggressive', color: '#f97316',
    vpip: 0.32, pfr: 0.26, threeBet: 0.11, limps: false,
    aggression: 0.75, bluff: 0.3, sticky: 0.03, sizing: [0.6, 0.9], openSize: 2.5,
    stats: 'VPIP ~28-35 · PFR ~24-30 · AF ~3.5+',
    description: 'Plays lots of hands and applies constant pressure with raises, 3-bets and barrels. Dangerous when they know when to slow down.',
    spot: 'Frequent 3-bets, double-barrels on scary turns, wide stealing from late position.',
    exploit: 'Widen your value range and call down lighter, 4-bet bluff occasionally, trap with strong hands and let them bluff.',
  },
  NIT: {
    label: 'Nit', name: 'Nit / Rock', color: '#64748b',
    vpip: 0.12, pfr: 0.09, threeBet: 0.03, limps: false,
    aggression: 0.45, bluff: 0.05, sticky: -0.05, sizing: [0.5, 0.66], openSize: 3,
    stats: 'VPIP < 14 · PFR < 11 · AF ~2',
    description: 'Extremely tight and risk-averse. Waits for premium hands and rarely bluffs.',
    spot: 'Folds most hands, a 3-bet from them is usually QQ+/AK. Big river bets almost always mean the nuts.',
    exploit: 'Steal relentlessly, fold to their aggression, and don\'t pay off big bets. Bet small for thin value — they fold too much.',
  },
  FISH: {
    label: 'Fish', name: 'Loose-Passive Fish', color: '#22c55e',
    vpip: 0.45, pfr: 0.08, threeBet: 0.02, limps: true,
    aggression: 0.25, bluff: 0.08, sticky: 0.15, sizing: [0.33, 0.5], openSize: 4,
    stats: 'VPIP 40+ · PFR < 10 · AF < 1',
    description: 'Recreational player who limps and calls far too often, chasing draws and any piece of the board.',
    spot: 'Open-limps, calls raises with weak hands, small "blocking" bets, rarely raises without a monster.',
    exploit: 'Isolate their limps, value-bet relentlessly with big sizings, avoid bluffing. When they suddenly raise, believe them.',
  },
  STATION: {
    label: 'Station', name: 'Calling Station', color: '#14b8a6',
    vpip: 0.55, pfr: 0.05, threeBet: 0.01, limps: true,
    aggression: 0.15, bluff: 0.03, sticky: 0.25, sizing: [0.33, 0.5], openSize: 3,
    stats: 'VPIP 50+ · PFR < 6 · AF < 0.7',
    description: 'Calls with almost anything and almost never folds a pair (or a draw). Very passive.',
    spot: 'Check-calls down with second/third pair. Raises only with very strong hands.',
    exploit: 'Never bluff. Bet bigger for value with any decent made hand, and fold when they finally show aggression.',
  },
  MANIAC: {
    label: 'Maniac', name: 'Maniac', color: '#ef4444',
    vpip: 0.65, pfr: 0.5, threeBet: 0.25, limps: false,
    aggression: 0.9, bluff: 0.5, sticky: 0.1, sizing: [0.75, 1.3], openSize: 3.5,
    stats: 'VPIP 60+ · PFR 45+ · AF 5+',
    description: 'Hyper-aggressive. Raises and re-raises constantly with any two cards and fires big bluffs.',
    spot: 'Huge pot sizes, frequent overbets, 3-bets and shoves with marginal hands.',
    exploit: 'Tighten up, let them bluff into your strong hands and call down wider. Avoid fancy bluffs — they won\'t fold.',
  },
  REG: {
    label: 'Reg', name: 'Balanced Regular', color: '#a855f7',
    vpip: 0.25, pfr: 0.2, threeBet: 0.09, limps: false,
    aggression: 0.6, bluff: 0.22, sticky: 0.03, sizing: [0.33, 0.75], openSize: 2.5,
    stats: 'VPIP ~24-27 · PFR ~20-22 · AF ~2.5-3',
    description: 'A thinking regular aiming for balance: mixes bluffs and value, varies bet sizes.',
    spot: 'Standard open sizes, small c-bets on dry boards, bigger bets on wet boards, balanced rivers.',
    exploit: 'Hard to exploit directly. Focus on solid fundamentals, pick spots where they over-fold or over-bluff.',
  },
};

const PROFILE_KEYS = Object.keys(PROFILES);

/* How much to widen/narrow a profile's range by position. */
const POSITION_FACTOR = { UTG: 0.7, HJ: 0.85, CO: 1.1, BTN: 1.5, SB: 1.0, BB: 1.0 };

const AI = {
  rand: () => Math.random(),

  /** Returns { type: 'fold'|'check'|'call'|'raise', amount } where amount is the raise-to total. */
  decide(game, p) {
    const prof = PROFILES[p.profile] || PROFILES.TAG;
    const ctx = game.decisionContext(p);
    let d = game.street === 0 ? this.preflop(game, p, prof, ctx) : this.postflop(game, p, prof, ctx);
    return this.sanitize(d, ctx);
  },

  sanitize(d, ctx) {
    if (d.type === 'raise') {
      if (!ctx.canRaise) d = ctx.toCall > 0 ? { type: 'call' } : { type: 'check' };
      else {
        let amt = Math.round(d.amount);
        amt = Math.max(ctx.minRaiseTo, Math.min(ctx.maxRaiseTo, amt));
        // Round up to a jam when the raise would leave a tiny stack behind.
        if (ctx.maxRaiseTo - amt < ctx.maxRaiseTo * 0.2) amt = ctx.maxRaiseTo;
        d.amount = amt;
      }
    }
    if (d.type === 'check' && ctx.toCall > 0) d = { type: 'fold' };
    if (d.type === 'fold' && ctx.toCall === 0) d = { type: 'check' };
    if (d.type === 'call' && ctx.toCall === 0) d = { type: 'check' };
    return d;
  },

  preflop(game, p, prof, ctx) {
    const code = Cards.handCode(p.cards[0], p.cards[1]);
    // Add some noise so the AI isn't perfectly predictable.
    const pct = HAND_PERCENTILE[code] * (0.85 + this.rand() * 0.3);
    // Short-handed tables play wider ranges.
    const posF = (POSITION_FACTOR[p.position] || 1) * Math.sqrt(6 / game.players.length);
    const bb = game.bb;
    const level = game.raiseLevel;
    const curBB = game.currentBet / bb;
    const stackBB = (p.stack + p.bet) / bb;

    if (level === 0) {
      const limpers = game.players.filter(x => !x.folded && x !== p && x.bet === game.currentBet && x.position !== 'BB' && x.position !== 'SB').length;
      if (pct < prof.pfr * posF * (limpers ? 0.85 : 1)) {
        const size = (prof.openSize + (p.profile === 'FISH' ? this.rand() * 1.5 : 0) + limpers) * bb;
        return { type: 'raise', amount: size };
      }
      if (ctx.toCall === 0) return { type: 'check' };
      const limpTh = prof.limps ? prof.vpip * posF : (p.position === 'SB' ? prof.vpip * 0.25 : 0);
      if (pct < limpTh) return { type: 'call' };
      return { type: 'fold' };
    }

    const sizePenalty = Math.pow(3 / Math.max(3, curBB), 0.55);
    const blindDiscount = p.position === 'BB' ? 1.5 : p.position === 'SB' ? 0.8 : 1;
    const potOdds = ctx.toCall / (ctx.pot + ctx.toCall);
    const jamDecision = ctx.toCall >= (p.stack) * 0.45;

    if (jamDecision) {
      const th = level >= 2 ? Math.max(0.035, prof.threeBet * 0.4) : Math.max(0.06, prof.threeBet * 0.9);
      if (pct < th * (1 + prof.sticky * 2) * (potOdds < 0.35 ? 1.6 : 1)) return { type: ctx.canRaise && pct < th * 0.5 ? 'raise' : 'call', amount: ctx.maxRaiseTo };
      return { type: 'fold' };
    }

    if (level === 1) {
      const threeTh = prof.threeBet * (posF > 1 ? 1.15 : 1);
      if (pct < threeTh) {
        const ip = ['BTN', 'CO'].includes(p.position);
        return { type: 'raise', amount: game.currentBet * (ip ? 3 : 3.6) + (ctx.callersCount * game.currentBet) };
      }
      const callTh = (prof.vpip - prof.pfr * 0.4) * 0.9 * sizePenalty * blindDiscount * (1 + prof.sticky * 2);
      if (pct < Math.max(callTh, threeTh)) return { type: 'call' };
      return { type: 'fold' };
    }

    if (level === 2) {
      const fourTh = prof.threeBet * 0.3;
      if (pct < fourTh) return { type: 'raise', amount: stackBB < 60 ? ctx.maxRaiseTo : game.currentBet * 2.3 };
      const callTh = prof.threeBet * 1.1 * (1 + prof.sticky * 3) * sizePenalty * 1.6;
      if (pct < callTh) return { type: 'call' };
      return { type: 'fold' };
    }

    // 4-bet and beyond: only the very top.
    const top = Math.max(0.025, prof.threeBet * 0.18);
    if (pct < top * 0.6) return { type: 'raise', amount: ctx.maxRaiseTo };
    if (pct < top * (1 + prof.sticky * 3)) return { type: 'call' };
    return { type: 'fold' };
  },

  postflop(game, p, prof, ctx) {
    const opps = Math.max(1, ctx.activeOpponents);
    const eq = equityVsRandom(p.cards, game.board, opps, 260);
    // Per-opponent strength: comparable across multiway pots.
    const hs = Math.pow(eq, 1 / opps);
    const r = this.rand();
    const pot = ctx.pot;
    const isRiver = game.street === 3;
    const wasAggressor = game.preflopAggressor === p.id;

    const betSize = (mult = 1) => {
      const [lo, hi] = prof.sizing;
      const frac = (lo + this.rand() * (hi - lo)) * mult;
      return game.currentBet + Math.max(game.bb, pot * frac);
    };

    if (ctx.toCall === 0) {
      if (hs > 0.78) return r < prof.aggression + 0.1 ? { type: 'raise', amount: betSize(hs > 0.9 ? 1.15 : 1) } : { type: 'check' };
      if (hs > 0.6) return r < prof.aggression * 0.65 ? { type: 'raise', amount: betSize() } : { type: 'check' };
      // C-bet as the preflop aggressor on the flop.
      if (game.street === 1 && wasAggressor && r < prof.aggression * 0.75) return { type: 'raise', amount: betSize(0.8) };
      if (!isRiver && hs > 0.4 && r < prof.bluff * 1.2) return { type: 'raise', amount: betSize() }; // semi-bluff
      if (r < prof.bluff * (isRiver ? 0.7 : 0.5)) return { type: 'raise', amount: betSize() };
      return { type: 'check' };
    }

    const potOdds = ctx.toCall / (pot + ctx.toCall);
    // Opponents' betting ranges are stronger than random: discount equity by aggression faced.
    const betRatio = ctx.toCall / Math.max(1, pot - ctx.toCall);
    const discount = 0.06 * game.raiseLevel + (betRatio > 0.9 ? 0.05 : 0) + (isRiver ? 0.04 : 0);
    const eqAdj = eq - discount + prof.sticky;

    if (hs > 0.85 && r < prof.aggression) return { type: 'raise', amount: game.currentBet * (2.5 + this.rand()) + pot * 0.2 };
    if (eqAdj > potOdds + 0.02) {
      if (!isRiver && hs > 0.45 && hs < 0.65 && r < prof.bluff * 0.25) return { type: 'raise', amount: game.currentBet * 3 };
      return { type: 'call' };
    }
    if (r < prof.bluff * 0.1 && game.raiseLevel < 2) return { type: 'raise', amount: game.currentBet * 3 };
    return { type: 'fold' };
  },
};
