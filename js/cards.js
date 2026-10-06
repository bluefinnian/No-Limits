'use strict';
/* Cards, deck, 7-card hand evaluator and Monte Carlo equity.
 * A card is an integer 0..51: rank = c >> 2 (0 = deuce .. 12 = ace), suit = c & 3. */

const RANKS = '23456789TJQKA';
const SUITS = 'shdc';
const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const RANK_PLURALS = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];
const CATEGORY_NAMES = ['High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];
const CAT_BASE = 371293; // 13^5

const Cards = {
  rank: c => c >> 2,
  suit: c => c & 3,
  make: (r, s) => r * 4 + s,

  parse(str) {
    if (!str || str.length < 2) return -1;
    const r = RANKS.indexOf(str[0].toUpperCase());
    const s = SUITS.indexOf(str[1].toLowerCase());
    return r < 0 || s < 0 ? -1 : r * 4 + s;
  },

  /** Parses "AhKd", "Ah Kd", "Ah,Kd" etc. Returns null if any token is invalid or duplicated. */
  parseMany(str) {
    const clean = (str || '').replace(/[\s,]/g, '').replace(/10/g, 'T');
    if (clean.length % 2) return null;
    const out = [];
    for (let i = 0; i < clean.length; i += 2) {
      const c = Cards.parse(clean.substr(i, 2));
      if (c < 0 || out.includes(c)) return null;
      out.push(c);
    }
    return out;
  },

  toString: c => RANKS[c >> 2] + SUITS[c & 3],

  newDeck() {
    const d = [];
    for (let i = 0; i < 52; i++) d.push(i);
    return Cards.shuffle(d);
  },

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  /** "AKs", "QJo", "77" style code for two hole cards. */
  handCode(c1, c2) {
    let r1 = c1 >> 2, r2 = c2 >> 2;
    if (r1 < r2) [r1, r2] = [r2, r1];
    if (r1 === r2) return RANKS[r1] + RANKS[r2];
    return RANKS[r1] + RANKS[r2] + ((c1 & 3) === (c2 & 3) ? 's' : 'o');
  },

  /** All concrete combos [c1, c2] for a hand code. */
  combosForCode(code) {
    const r1 = RANKS.indexOf(code[0]), r2 = RANKS.indexOf(code[1]);
    const out = [];
    if (r1 === r2) {
      for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) out.push([r1 * 4 + a, r2 * 4 + b]);
    } else if (code[2] === 's') {
      for (let s = 0; s < 4; s++) out.push([r1 * 4 + s, r2 * 4 + s]);
    } else {
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (a !== b) out.push([r1 * 4 + a, r2 * 4 + b]);
    }
    return out;
  },

  /** HTML for a face-up card. size: '' | 'sm' | 'lg' | 'xs' */
  html(c, size = '', extraClass = '') {
    if (c === undefined || c === null || c < 0) return Cards.backHtml(size, extraClass);
    const r = RANKS[c >> 2] === 'T' ? '10' : RANKS[c >> 2];
    const s = SUITS[c & 3];
    return `<div class="card ${size ? 'card-' + size : ''} suit-${s} ${extraClass}" title="${Cards.toString(c)}">` +
      `<span class="card-rank">${r}</span><span class="card-suit">${SUIT_SYMBOLS[s]}</span>` +
      `<span class="card-pip">${SUIT_SYMBOLS[s]}</span></div>`;
  },

  backHtml(size = '', extraClass = '') {
    return `<div class="card back ${size ? 'card-' + size : ''} ${extraClass}"></div>`;
  },

  placeholderHtml(size = '') {
    return `<div class="card placeholder ${size ? 'card-' + size : ''}"></div>`;
  },

  /** Inline text like "A♥" with suit colouring. */
  inline(c) {
    const s = SUITS[c & 3];
    return `<span class="inline-card suit-${s}">${RANKS[c >> 2]}${SUIT_SYMBOLS[s]}</span>`;
  },
};

/* ---------------- Hand evaluator ---------------- */

function straightHigh(mask) {
  // Bit (r+1) represents rank r; bit 0 is the ace playing low.
  const m = (mask << 1) | ((mask >> 12) & 1);
  for (let hi = 13; hi >= 4; hi--) {
    if (((m >> (hi - 4)) & 31) === 31) return hi - 1;
  }
  return -1;
}

function topBits(mask, n) {
  const out = [];
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

function packScore(cat, ks) {
  let v = 0;
  for (let i = 0; i < 5; i++) v = v * 13 + (ks[i] || 0);
  return cat * CAT_BASE + v;
}

/** Evaluates the best 5-card hand from 5..7 cards. Higher score is better. */
function evaluateHand(cards) {
  const counts = new Array(13).fill(0);
  const suitMask = [0, 0, 0, 0];
  const suitCnt = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) {
    const r = c >> 2, s = c & 3;
    counts[r]++;
    suitMask[s] |= 1 << r;
    suitCnt[s]++;
    mask |= 1 << r;
  }

  let flushScore = 0;
  for (let s = 0; s < 4; s++) {
    if (suitCnt[s] >= 5) {
      const sh = straightHigh(suitMask[s]);
      if (sh >= 0) return packScore(8, [sh]);
      flushScore = packScore(5, topBits(suitMask[s], 5));
      break;
    }
  }

  let quads = -1;
  const trips = [], pairs = [];
  for (let r = 12; r >= 0; r--) {
    if (counts[r] === 4) quads = r;
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }

  if (quads >= 0) return packScore(7, [quads, ...topBits(mask & ~(1 << quads), 1)]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const p = Math.max(trips.length > 1 ? trips[1] : -1, pairs.length ? pairs[0] : -1);
    return packScore(6, [trips[0], p]);
  }
  if (flushScore) return flushScore;
  const sh = straightHigh(mask);
  if (sh >= 0) return packScore(4, [sh]);
  if (trips.length) return packScore(3, [trips[0], ...topBits(mask & ~(1 << trips[0]), 2)]);
  if (pairs.length >= 2) {
    const [p0, p1] = pairs;
    return packScore(2, [p0, p1, ...topBits(mask & ~(1 << p0) & ~(1 << p1), 1)]);
  }
  if (pairs.length === 1) return packScore(1, [pairs[0], ...topBits(mask & ~(1 << pairs[0]), 3)]);
  return packScore(0, topBits(mask, 5));
}

function handCategory(score) {
  return Math.floor(score / CAT_BASE);
}

function describeHand(score) {
  const cat = handCategory(score);
  let v = score % CAT_BASE;
  const ks = [];
  for (let i = 0; i < 5; i++) { ks.unshift(v % 13); v = Math.floor(v / 13); }
  const n = RANK_NAMES, p = RANK_PLURALS;
  switch (cat) {
    case 8: return ks[0] === 12 ? 'Royal Flush' : `Straight Flush, ${n[ks[0]]} high`;
    case 7: return `Four of a Kind, ${p[ks[0]]}`;
    case 6: return `Full House, ${p[ks[0]]} full of ${p[ks[1]]}`;
    case 5: return `Flush, ${n[ks[0]]} high`;
    case 4: return `Straight, ${n[ks[0]]} high`;
    case 3: return `Three of a Kind, ${p[ks[0]]}`;
    case 2: return `Two Pair, ${p[ks[0]]} and ${p[ks[1]]}`;
    case 1: return `Pair of ${p[ks[0]]}`;
    default: return `${n[ks[0]]} High`;
  }
}

/* ---------------- Equity ---------------- */

/**
 * Monte Carlo equity for several players.
 * players: array where each entry is [c1, c2] (known hand), null (random hand),
 *          or { combos: [[c1,c2], ...] } (random hand from a range).
 * Returns array of equities (0..1) including split-pot shares.
 */
function calcEquity(players, board = [], iterations = 1000) {
  const dead = new Set(board);
  for (const p of players) if (Array.isArray(p)) { dead.add(p[0]); dead.add(p[1]); }
  const baseDeck = [];
  for (let c = 0; c < 52; c++) if (!dead.has(c)) baseDeck.push(c);

  const shares = new Array(players.length).fill(0);
  const hands = new Array(players.length);
  const scores = new Array(players.length);
  let done = 0;

  for (let it = 0; it < iterations; it++) {
    const used = new Set();
    let ok = true;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (Array.isArray(p)) { hands[i] = p; continue; }
      if (p && p.combos) {
        let picked = null;
        for (let tries = 0; tries < 30; tries++) {
          const combo = p.combos[Math.floor(Math.random() * p.combos.length)];
          if (!dead.has(combo[0]) && !dead.has(combo[1]) && !used.has(combo[0]) && !used.has(combo[1])) { picked = combo; break; }
        }
        if (!picked) { ok = false; break; }
        hands[i] = picked;
        used.add(picked[0]); used.add(picked[1]);
      } else {
        hands[i] = null;
      }
    }
    if (!ok) continue;

    // Random cards for random hands and the rest of the board.
    const deck = baseDeck.filter(c => !used.has(c));
    let di = deck.length;
    const draw = () => {
      const j = Math.floor(Math.random() * di);
      const c = deck[j];
      deck[j] = deck[--di];
      return c;
    };
    for (let i = 0; i < players.length; i++) if (!hands[i]) hands[i] = [draw(), draw()];
    const fullBoard = board.slice();
    while (fullBoard.length < 5) fullBoard.push(draw());

    let best = -1, winners = 0;
    for (let i = 0; i < players.length; i++) {
      scores[i] = evaluateHand([hands[i][0], hands[i][1], ...fullBoard]);
      if (scores[i] > best) { best = scores[i]; winners = 1; } else if (scores[i] === best) winners++;
    }
    for (let i = 0; i < players.length; i++) if (scores[i] === best) shares[i] += 1 / winners;
    done++;
  }
  return shares.map(s => (done ? s / done : 0));
}

/** Hero equity vs n random opponents. */
function equityVsRandom(hole, board, opponents, iterations = 300) {
  const players = [hole];
  for (let i = 0; i < opponents; i++) players.push(null);
  return calcEquity(players, board, iterations)[0];
}
