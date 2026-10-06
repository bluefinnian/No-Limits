'use strict';
/* No-Limit Hold'em game engine: blinds, betting rounds, side pots and showdown.
 * Events: update, log, heroTurn, action, handStart, handEnd. */

const POSITION_LAYOUTS = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'CO'],
  5: ['BTN', 'SB', 'BB', 'HJ', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
};
const STREET_NAMES = ['Preflop', 'Flop', 'Turn', 'River', 'Showdown'];
const SPEED_DELAYS = { slow: 1500, normal: 850, fast: 380, instant: 60 };

class PokerGame {
  constructor({ seats, sb = 1, bb = 2, stack = 200, speed = 'normal' }) {
    this.sb = sb;
    this.bb = bb;
    this.startStack = stack;
    this.speed = speed;
    this.handlers = {};
    this.players = seats.map((s, i) => ({
      id: i, name: s.name, isHero: !!s.isHero, profile: s.profile || null,
      stack, buyins: 1, cards: [], bet: 0, contrib: 0,
      folded: false, allIn: false, acted: false, position: '', lastAction: '', showCards: false,
    }));
    this.dealer = Math.floor(Math.random() * this.players.length);
    this.handNum = 0;
    this.board = [];
    this.street = 0;
    this.handOver = true;
    this.gen = 0;
    this.timers = [];
  }

  on(evt, fn) { (this.handlers[evt] = this.handlers[evt] || []).push(fn); return this; }
  emit(evt, data) { (this.handlers[evt] || []).forEach(fn => fn(data)); }
  get hero() { return this.players.find(p => p.isHero); }
  get delay() {
    const base = SPEED_DELAYS[this.speed] || 850;
    // Fast-forward once the hero is out of the hand.
    const hero = this.hero;
    return hero && hero.folded && !this.handOver ? base * 0.35 : base;
  }
  get pot() { return this.players.reduce((s, p) => s + p.contrib, 0); }

  later(fn, ms) {
    const g = this.gen;
    const t = setTimeout(() => { if (g === this.gen) fn(); }, ms);
    this.timers.push(t);
  }

  destroy() {
    this.gen++;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.handlers = {};
  }

  fmt(chips) { return `${+(chips).toFixed(2)}`; }
  log(msg, cls = '') { this.emit('log', { msg, cls }); }

  next(i) { return (i + 1) % this.players.length; }
  canAct(p) { return !p.folded && !p.allIn; }
  livePlayers() { return this.players.filter(p => !p.folded); }

  /* ---------- Hand setup ---------- */
  startHand() {
    this.gen++;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    const n = this.players.length;
    this.handNum++;
    this.dealer = this.next(this.dealer);

    for (const p of this.players) {
      if (p.stack < this.bb) {
        if (p.isHero) this.log(`You rebuy for ${this.fmt(this.startStack)}.`, 'info');
        p.stack += this.startStack;
        p.buyins++;
      }
      Object.assign(p, { cards: [], bet: 0, contrib: 0, folded: false, allIn: false, acted: false, lastAction: '', showCards: p.isHero });
    }

    const layout = POSITION_LAYOUTS[n];
    for (let k = 0; k < n; k++) this.players[(this.dealer + k) % n].position = layout[k];

    this.deck = Cards.newDeck();
    this.board = [];
    this.street = 0;
    this.handOver = false;
    this.raiseLevel = 0;
    this.preflopAggressor = null;
    this.winners = [];
    this.log(`— Hand #${this.handNum} —`, 'hand-sep');

    const sbIdx = n === 2 ? this.dealer : this.next(this.dealer);
    const bbIdx = this.next(sbIdx);
    this.postBlind(this.players[sbIdx], this.sb, 'SB');
    this.postBlind(this.players[bbIdx], this.bb, 'BB');
    this.currentBet = this.bb;
    this.minRaise = this.bb;

    for (let r = 0; r < 2; r++) for (let k = 1; k <= n; k++) this.players[(this.dealer + k) % n].cards.push(this.deck.pop());

    this.toAct = this.next(bbIdx);
    this.history = {
      handNum: this.handNum, sb: this.sb, bb: this.bb, dealer: this.dealer,
      players: this.players.map(p => ({
        id: p.id, name: p.name, isHero: p.isHero, profile: p.profile, position: p.position,
        cards: p.cards.slice(), startStack: p.stack + p.contrib,
      })),
      actions: [],
      tells: [],
    };
    this.emit('handStart', { handNum: this.handNum });
    this.emit('update');
    this.later(() => this.loop(), this.delay * 0.6);
  }

  postBlind(p, amt, label) {
    const a = Math.min(amt, p.stack);
    this.putChips(p, a);
    p.lastAction = `${label} ${this.fmt(a)}`;
    this.log(`${p.name} posts ${label} ${this.fmt(a)}`);
  }

  putChips(p, amt) {
    p.stack -= amt;
    p.bet += amt;
    p.contrib += amt;
    if (p.stack <= 0) { p.stack = 0; p.allIn = true; }
  }

  /* ---------- Betting ---------- */
  decisionContext(p) {
    const toCall = Math.min(this.currentBet - p.bet, p.stack);
    const maxRaiseTo = p.bet + p.stack;
    const othersCanAct = this.players.some(o => o !== p && this.canAct(o));
    const othersLive = this.players.filter(o => o !== p && !o.folded);
    return {
      toCall,
      pot: this.pot,
      maxRaiseTo,
      minRaiseTo: Math.min(this.currentBet + this.minRaise, maxRaiseTo),
      canRaise: maxRaiseTo > this.currentBet && othersCanAct,
      activeOpponents: othersLive.length,
      callersCount: othersLive.filter(o => o.bet === this.currentBet && o.acted).length,
    };
  }

  roundComplete() {
    const actors = this.players.filter(p => this.canAct(p));
    if (actors.every(p => p.acted && p.bet === this.currentBet)) return true;
    return actors.length <= 1 && actors.every(p => p.bet >= this.currentBet);
  }

  loop() {
    if (this.handOver) return;
    if (this.livePlayers().length === 1) return this.finishUncontested();
    if (this.roundComplete()) return this.later(() => this.nextStreet(), this.delay * 0.7);

    let guard = 0;
    while (!this.canAct(this.players[this.toAct]) && guard++ < 10) this.toAct = this.next(this.toAct);
    const p = this.players[this.toAct];
    this.emit('update');

    if (p.isHero) {
      this.waitingForHero = true;
      this.emit('heroTurn', this.decisionContext(p));
    } else {
      const decision = AI.decide(this, p);
      const tell = this.tellHook ? this.tellHook(p, decision) : null;
      let wait = this.delay * (0.7 + Math.random() * 0.6);
      if (tell && tell.timing === 'snap') wait = Math.min(wait, 120);
      if (tell && tell.timing === 'tank') {
        wait = this.delay * 2.6 + 700;
        p.thinking = true;
        this.emit('update');
      }
      this.later(() => {
        p.thinking = false;
        // Emit the tell first so it's on screen when the hero's turn starts.
        if (tell) {
          if (this.history) this.history.tells.push(tell);
          this.emit('tell', tell);
        }
        this.act(p, decision);
      }, wait);
    }
  }

  heroAct(action) {
    const hero = this.hero;
    if (!this.waitingForHero || this.players[this.toAct] !== hero) return;
    this.waitingForHero = false;
    this.act(hero, action);
  }

  act(p, action) {
    if (this.handOver) return;
    const ctx = this.decisionContext(p);
    let { type } = action;
    const streetBefore = this.street;
    const toCallBefore = ctx.toCall;
    let label = '';
    // Snapshot of the decision for the hand review.
    const snap = {
      pid: p.id, street: this.street, board: this.board.slice(), pot: ctx.pot, toCall: ctx.toCall,
      currentBet: this.currentBet, betBefore: p.bet, stackBefore: p.stack, minRaiseTo: ctx.minRaiseTo,
      maxRaiseTo: ctx.maxRaiseTo, canRaise: ctx.canRaise, raiseLevel: this.raiseLevel,
      live: this.livePlayers().map(o => o.id),
      stacks: Object.fromEntries(this.players.map(o => [o.id, o.stack])),
    };

    if (type === 'check' && ctx.toCall > 0) type = 'fold';
    if (type === 'raise' && !ctx.canRaise) type = ctx.toCall > 0 ? 'call' : 'check';

    if (type === 'fold') {
      p.folded = true;
      label = 'Fold';
      this.log(`${p.name} folds`);
    } else if (type === 'check') {
      label = 'Check';
      this.log(`${p.name} checks`);
    } else if (type === 'call') {
      this.putChips(p, ctx.toCall);
      label = `Call ${this.fmt(p.bet)}`;
      this.log(`${p.name} calls ${this.fmt(ctx.toCall)}${p.allIn ? ' and is all-in' : ''}`);
    } else if (type === 'raise') {
      let target = Math.min(Math.max(action.amount, ctx.minRaiseTo), ctx.maxRaiseTo);
      const raiseSize = target - this.currentBet;
      const isBet = this.currentBet === 0;
      this.putChips(p, target - p.bet);
      if (raiseSize >= this.minRaise) this.minRaise = raiseSize;
      this.currentBet = Math.max(this.currentBet, p.bet);
      this.raiseLevel++;
      if (this.street === 0) this.preflopAggressor = p.id;
      for (const o of this.players) if (o !== p && this.canAct(o)) o.acted = false;
      label = `${p.allIn ? 'All-in' : isBet ? 'Bet' : 'Raise'} ${this.fmt(p.bet)}`;
      this.log(`${p.name} ${isBet ? 'bets' : 'raises to'} ${this.fmt(p.bet)}${p.allIn ? ' (all-in)' : ''}`, 'aggr');
    }
    p.acted = true;
    p.lastAction = label;
    if (this.history) {
      snap.type = type;
      snap.amount = p.bet;
      snap.added = snap.stackBefore - p.stack;
      snap.allIn = p.allIn;
      this.history.actions.push(snap);
    }
    this.emit('action', { player: p, type, street: streetBefore, toCall: toCallBefore, raiseLevel: this.raiseLevel });
    this.toAct = this.next(this.players.indexOf(p));
    this.emit('update');
    this.loop();
  }

  /* ---------- Streets ---------- */
  nextStreet() {
    if (this.handOver) return;
    for (const p of this.players) { p.bet = 0; p.acted = false; if (!p.folded && !p.allIn) p.lastAction = ''; }
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.raiseLevel = 0;
    this.street++;

    if (this.street === 4) return this.showdown();

    this.deck.pop(); // burn
    const count = this.street === 1 ? 3 : 1;
    for (let i = 0; i < count; i++) this.board.push(this.deck.pop());
    this.log(`${STREET_NAMES[this.street]}: ${this.board.map(Cards.toString).join(' ')}`, 'street');

    const actors = this.players.filter(p => this.canAct(p));
    if (actors.length <= 1) {
      // All-in run-out: show everyone's cards.
      for (const p of this.livePlayers()) p.showCards = true;
      this.emit('update');
      return this.later(() => this.nextStreet(), this.delay * 1.4);
    }
    this.toAct = this.next(this.dealer);
    this.emit('update');
    this.later(() => this.loop(), this.delay * 0.6);
  }

  refundUncalled() {
    const sorted = this.players.slice().sort((a, b) => b.contrib - a.contrib);
    const [top, second] = sorted;
    if (second && top.contrib > second.contrib) {
      const diff = top.contrib - second.contrib;
      top.contrib -= diff;
      top.stack += diff;
      top.bet = Math.max(0, top.bet - diff);
      if (top.stack > 0) top.allIn = false;
      this.log(`Uncalled ${this.fmt(diff)} returned to ${top.name}`);
    }
  }

  finishUncontested() {
    this.refundUncalled();
    const winner = this.livePlayers()[0];
    const pot = this.pot;
    winner.stack += pot;
    this.log(`${winner.name} wins ${this.fmt(pot)}`, 'win');
    this.endHand([{ player: winner, amount: pot, hand: '' }], false);
  }

  showdown() {
    this.refundUncalled();
    const live = this.livePlayers();
    const scores = new Map();
    for (const p of live) {
      p.showCards = true;
      scores.set(p, evaluateHand([...p.cards, ...this.board]));
    }

    // Side pots from contribution levels.
    const levels = [...new Set(this.players.map(p => p.contrib).filter(c => c > 0))].sort((a, b) => a - b);
    const winnings = new Map();
    let prev = 0;
    let carry = 0;
    for (const level of levels) {
      let amount = carry;
      for (const p of this.players) amount += Math.max(0, Math.min(p.contrib, level) - prev);
      const eligible = live.filter(p => p.contrib >= level);
      prev = level;
      if (!eligible.length) { carry = amount; continue; }
      carry = 0;
      const best = Math.max(...eligible.map(p => scores.get(p)));
      const winners = eligible.filter(p => scores.get(p) === best);
      // Split evenly; odd chips go to the first winner left of the button.
      const share = Math.floor((amount / winners.length) * 100) / 100;
      let remainder = +(amount - share * winners.length).toFixed(2);
      winners.sort((a, b) => ((a.id - this.dealer + this.players.length - 1) % this.players.length) - ((b.id - this.dealer + this.players.length - 1) % this.players.length));
      for (const w of winners) {
        const add = share + remainder;
        remainder = 0;
        winnings.set(w, (winnings.get(w) || 0) + add);
      }
    }

    for (const p of live) this.log(`${p.name} shows ${p.cards.map(Cards.toString).join(' ')} — ${describeHand(scores.get(p))}`);
    const results = [];
    for (const [p, amt] of winnings) {
      p.stack += amt;
      results.push({ player: p, amount: amt, hand: describeHand(scores.get(p)) });
      this.log(`${p.name} wins ${this.fmt(amt)} with ${describeHand(scores.get(p))}`, 'win');
    }
    this.endHand(results, true);
  }

  endHand(results, showdown) {
    this.handOver = true;
    this.waitingForHero = false;
    this.winners = results.map(r => r.player.id);
    for (const p of this.players) { p.bet = 0; p.stack = Math.round(p.stack * 100) / 100; }
    const h = this.history;
    if (h) {
      h.board = this.board.slice();
      // Cards that would have come had the hand continued (burns included).
      const deck = this.deck.slice(), full = this.board.slice();
      while (full.length < 5) {
        deck.pop();
        const count = full.length === 0 ? 3 : 1;
        for (let i = 0; i < count; i++) full.push(deck.pop());
      }
      h.runout = full.slice(this.board.length);
      h.showdown = showdown;
      h.results = results.map(r => ({ id: r.player.id, amount: r.amount, hand: r.hand }));
      for (const hp of h.players) {
        const p = this.players[hp.id];
        hp.folded = p.folded;
        hp.endStack = p.stack;
        hp.net = p.stack - hp.startStack;
      }
    }
    this.emit('update');
    this.emit('handEnd', { results, showdown, board: this.board.slice(), history: h });
  }
}
