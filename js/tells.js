'use strict';
/* Live tells in the Practice Arena.
 *
 * Opponents occasionally show a tell from the Tells library when they act. Each cue
 * has a conventional meaning (strength / weakness / unclear), but whether it is
 * honest is randomized: the chance depends on the tell's reliability, the player's
 * type and a hidden per-player honesty level. So tells nudge close decisions but
 * can't be followed blindly — combine them with range, position and bet sizing.
 */

const TELL_RELIABILITY = { High: 0.76, Medium: 0.64, Low: 0.52 };

/* How honest each player type's tells tend to be (added to the cue's reliability). */
const TYPE_HONESTY = { FISH: 0.1, STATION: 0.06, NIT: 0.06, TAG: 0, REG: -0.14, LAG: -0.1, MANIAC: -0.06 };

/*
 * Cues. `lib` links to the TELLS library entry. `signal` is what the tell
 * conventionally means. `when(ctx)` says whether it can happen in this spot.
 * `types` = player types that commonly show it (weight). `timing` changes how long
 * the AI takes to act: 'snap' (instant) or 'tank' (long think).
 */
const TELL_CUES = [
  // ----- conventionally STRONG -----
  {
    id: 'shaking', lib: 'Shaking hands when betting', signal: 'strong', short: 'Hands trembling',
    text: n => `${n}'s hands tremble slightly as the chips go in.`,
    when: c => c.aggressive, types: { FISH: 3, STATION: 2, NIT: 2, TAG: 1, REG: 1 },
  },
  {
    id: 'chipglance', lib: 'Glancing at chips after the flop', signal: 'strong', short: 'Glanced at chips',
    text: n => `As the flop lands, ${n} glances straight down at their chip stack.`,
    when: c => c.street === 1 && c.firstOnStreet, types: { NIT: 2, TAG: 2, FISH: 2, STATION: 1, REG: 1 },
  },
  {
    id: 'actweak', lib: 'Acting weak / sighing / shrugging', signal: 'strong', short: 'Sighs, acts reluctant',
    text: n => `${n} sighs loudly and shrugs — "ugh, I guess I have to…"`,
    when: c => c.type === 'call' || c.type === 'raise', types: { FISH: 3, STATION: 2, LAG: 1, REG: 1 },
  },
  {
    id: 'leanin', lib: 'Sudden posture change (leaning in)', signal: 'strong', short: 'Leaning in',
    text: n => `${n} suddenly sits up straight and leans toward the table.`,
    when: c => c.type !== 'fold' && c.street > 0, types: { FISH: 2, NIT: 2, TAG: 1, STATION: 1 },
  },
  {
    id: 'tankraise', lib: 'Tank, then big raise', signal: 'strong', short: 'Long tank, then raise', timing: 'tank',
    text: n => `${n} goes deep into the tank… then puts in a big raise.`,
    when: c => c.type === 'raise' && c.facingBet, types: { FISH: 2, NIT: 2, STATION: 1, TAG: 1 },
  },
  {
    id: 'timebank', lib: 'Time-bank then raise', signal: 'strong', short: 'Used time bank, then raised', timing: 'tank',
    text: n => `${n}'s timer runs deep into their time bank… then they raise.`,
    when: c => c.type === 'raise' && c.street > 0, types: { TAG: 2, REG: 2, NIT: 1, LAG: 1 },
  },
  // ----- conventionally WEAK -----
  {
    id: 'freeze', lib: 'Freezing / holding breath after a bet', signal: 'weak', short: 'Frozen still',
    text: n => `After betting, ${n} goes completely still — barely breathing.`,
    when: c => c.aggressive, types: { TAG: 2, NIT: 2, REG: 2, LAG: 1 },
  },
  {
    id: 'reachchips', lib: 'Reaching for chips out of turn', signal: 'weak', short: 'Reaching for chips',
    text: n => `${n} checks, then reaches for their chips as if ready to call your bet.`,
    when: c => c.type === 'check' && c.heroYetToAct, types: { FISH: 3, STATION: 2, LAG: 1 },
  },
  {
    id: 'recheck', lib: 'Re-checking hole cards on a flush board', signal: 'weak', short: 'Re-checked hole cards',
    text: n => `As the third suited card hits, ${n} peeks at their hole cards again.`,
    when: c => c.flushBoard && c.firstOnStreet && c.street > 1, types: { FISH: 3, STATION: 3, LAG: 1, TAG: 1 },
  },
  {
    id: 'snapcheck', lib: 'Snap-check', signal: 'weak', short: 'Snap-check', timing: 'snap',
    text: n => `${n} checks instantly.`,
    when: c => c.type === 'check', types: { FISH: 2, STATION: 2, TAG: 1, NIT: 1, LAG: 1, REG: 1, MANIAC: 1 },
  },
  {
    id: 'mouth', lib: 'Hand covering mouth after betting', signal: 'weak', short: 'Hand over mouth',
    text: n => `${n} bets, then rests a hand over their mouth.`,
    when: c => c.aggressive, types: { NIT: 1, TAG: 1, REG: 1, FISH: 1 },
  },
  {
    id: 'splash', lib: 'Forceful, splashy bet', signal: 'weak', short: 'Splashy bet',
    text: n => `${n} slams the chips into the middle with a flourish.`,
    when: c => c.aggressive, types: { MANIAC: 3, LAG: 2, FISH: 1 },
  },
  {
    id: 'tanksmall', lib: 'Long tank, then small bet', signal: 'weak', short: 'Long tank, then small bet', timing: 'tank',
    text: n => `${n} thinks for a long time… then makes a small bet.`,
    when: c => c.aggressive && c.betFrac < 0.5 && c.street > 0, types: { FISH: 3, STATION: 2, REG: 1 },
  },
  {
    id: 'snapcall', lib: 'Snap-call on a wet board', signal: 'weak', short: 'Snap-call', timing: 'snap',
    text: n => `${n} calls instantly.`,
    when: c => c.type === 'call' && c.wetBoard, types: { STATION: 3, FISH: 2, LAG: 1 },
  },
  // ----- UNCLEAR -----
  {
    id: 'stare', lib: 'Staring you down after betting', signal: 'unclear', short: 'Staring you down',
    text: n => `${n} stares straight at you after putting the chips in.`,
    when: c => c.aggressive, types: { MANIAC: 3, LAG: 2, TAG: 1 },
  },
];

const TELL_FREQ = { off: 0, low: 0.55, normal: 1, high: 1.7 };

const LiveTells = {
  cueById: id => TELL_CUES.find(c => c.id === id),
  libEntry: cue => TELLS.find(t => t.name === cue.lib) || { rel: 'Medium', means: cue.signal },

  /** Gives each AI player a hidden tell personality for the session. */
  assignPersonalities(players) {
    for (const p of players) {
      if (p.isHero) continue;
      const fav = TELL_CUES.filter(c => (c.types[p.profile] || 0) >= 2);
      const pool = fav.length ? fav : TELL_CUES;
      p.tellPersona = {
        signature: pool[Math.floor(Math.random() * pool.length)].id,
        honestyShift: (Math.random() - 0.5) * 0.3,
      };
    }
  },

  /** How strong the AI's hand really is right now (0..1, per-opponent strength). */
  actualStrength(game, p) {
    if (game.street === 0) {
      const pctl = HAND_PERCENTILE[Cards.handCode(p.cards[0], p.cards[1])];
      return { value: 1 - pctl, strong: pctl <= 0.12, label: `${Cards.handCode(p.cards[0], p.cards[1])} (top ${Math.round(pctl * 100)}%)` };
    }
    const opps = Math.max(1, game.players.filter(o => o !== p && !o.folded).length);
    const eq = equityVsRandom(p.cards, game.board, opps, 300);
    const hs = Math.pow(eq, 1 / opps);
    return { value: hs, strong: hs >= 0.6, label: describeHand(evaluateHand([...p.cards, ...game.board])) };
  },

  /**
   * Called just before an AI player acts. Returns a tell (or null).
   * settings: { freq: 'off'|'low'|'normal'|'high' }
   */
  maybeGenerate(game, p, decision, settings) {
    const mult = TELL_FREQ[settings.freq] ?? 1;
    const hero = game.hero;
    if (!mult || !hero || hero.folded || game.handOver) return null;
    if (!p.tellPersona) return null;
    p.tellsThisStreet = p.tellsStreetKey === `${game.handNum}:${game.street}` ? p.tellsThisStreet : 0;
    p.tellsStreetKey = `${game.handNum}:${game.street}`;
    if (p.tellsThisStreet >= 1) return null;

    const ctx = this.context(game, p, decision);
    // Tells matter most when they bear on a decision you're about to make.
    let chance = ctx.aggressive && ctx.heroYetToAct ? (game.street >= 2 ? 0.42 : 0.3) : ctx.heroYetToAct ? 0.14 : 0.07;
    if (game.street === 0) chance *= 0.45;
    if (Math.random() > chance * mult) return null;

    const truth = this.actualStrength(game, p);
    const prof = p.profile;
    const candidates = TELL_CUES.filter(c => c.types[prof] && c.when(ctx));
    if (!candidates.length) return null;

    // Occasionally an "unclear" tell regardless of the hand.
    const unclear = candidates.filter(c => c.signal === 'unclear');
    let cue, honest;
    if (unclear.length && Math.random() < 0.12) {
      cue = this.pick(unclear, p);
      honest = null;
    } else {
      // Pick the conventional meaning to show first, weighted by the cue pool,
      // then decide whether this instance is honest.
      const signed = candidates.filter(c => c.signal !== 'unclear');
      if (!signed.length) return null;
      const lib = c => this.libEntry(c);
      const pHonest = cueP => Math.max(0.3, Math.min(0.88, TELL_RELIABILITY[lib(cueP).rel] + (TYPE_HONESTY[prof] || 0) + p.tellPersona.honestyShift));
      honest = null;
      // Choose honest/false by rolling against the reliability of the cue we'd show.
      const wantSignal = truth.strong ? 'strong' : 'weak';
      const truthful = signed.filter(c => c.signal === wantSignal);
      const lying = signed.filter(c => c.signal !== wantSignal);
      const tryHonest = truthful.length ? this.pick(truthful, p) : null;
      const tryFalse = lying.length ? this.pick(lying, p) : null;
      const ref = tryHonest || tryFalse;
      if (Math.random() < pHonest(ref)) { cue = tryHonest; honest = true; } else { cue = tryFalse; honest = false; }
      if (!cue) return null;
    }

    p.tellsThisStreet++;
    const libE = this.libEntry(cue);
    return {
      id: cue.id, pid: p.id, name: p.name, profile: prof, street: game.street, handNum: game.handNum,
      short: cue.short, text: cue.text(p.name), lib: cue.lib, signal: cue.signal,
      reliability: libE.rel, timing: cue.timing || null, honest,
      truth: { strong: truth.strong, value: truth.value, label: truth.label },
      actionIdx: game.history ? game.history.actions.length : -1,
      signature: cue.id === p.tellPersona.signature,
    };
  },

  pick(list, p) {
    const w = list.map(c => (c.types[p.profile] || 0.5) * (c.id === p.tellPersona.signature ? 4 : 1));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  },

  context(game, p, decision) {
    const board = game.board;
    const suits = [0, 0, 0, 0];
    for (const c of board) suits[c & 3]++;
    const hero = game.hero;
    // Does the hero still have a decision to make on this street after this action?
    const heroLive = hero && !hero.folded && !hero.allIn;
    const heroYetToAct = heroLive && (decision.type === 'raise' || !hero.acted || hero.bet < game.currentBet);
    const firstOnStreet = !(game.history && game.history.actions.some(a => a.street === game.street && a.pid === p.id));
    const betFrac = decision.type === 'raise' ? (decision.amount - game.currentBet) / Math.max(1, game.pot) : 0;
    return {
      type: decision.type,
      aggressive: decision.type === 'raise',
      facingBet: game.currentBet > p.bet,
      street: game.street,
      flushBoard: Math.max(...suits) >= 3,
      wetBoard: board.length >= 3 && Analysis.boardTexture(board).wet,
      heroYetToAct,
      firstOnStreet,
      betFrac,
    };
  },

  meaningLabel(signal) {
    return signal === 'strong' ? 'Usually strength' : signal === 'weak' ? 'Usually weakness' : 'Unreliable';
  },

  verdictLabel(t) {
    if (t.honest === null) return `Unreliable tell — actually ${t.truth.strong ? 'strong' : 'weak'}`;
    return t.honest ? 'Honest tell' : 'False tell';
  },
};
