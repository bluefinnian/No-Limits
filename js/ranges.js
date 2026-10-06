'use strict';
/* Range model, notation parser, preset ranges, storage and preflop hand strength.
 * A range is { id, name, position, note, hands: { "AKs": { r: 70, c: 30 }, ... } }
 * where r = raise %, c = call %, and fold = 100 - r - c. Missing hands are 100% fold. */

const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

/* 13x13 grid: row/col 0 = Ace. Upper-right triangle is suited, lower-left offsuit. */
const GRID = [];
for (let i = 0; i < 13; i++) {
  const row = [];
  for (let j = 0; j < 13; j++) {
    const ri = 12 - i, rj = 12 - j;
    if (i === j) row.push(RANKS[ri] + RANKS[rj]);
    else if (i < j) row.push(RANKS[ri] + RANKS[rj] + 's');
    else row.push(RANKS[rj] + RANKS[ri] + 'o');
  }
  GRID.push(row);
}
const ALL_CODES = GRID.flat();

function comboCount(code) {
  return code.length === 2 ? 6 : code[2] === 's' ? 4 : 12;
}

/* ---------------- Notation parser ----------------
 * Tokens separated by commas/spaces. Supports: QQ, 77+, 99-55, AKs, AK (both), ATs+, KTo+, K9s-K6s.
 * Optional frequency suffix after a colon: ":50" (raise 50%), ":c" (call 100%), ":c40", ":r60c40".
 */
function expandToken(tok) {
  tok = tok.trim().replace(/10/g, 'T');
  if (!tok) return [];
  const up = s => s.slice(0, 2).toUpperCase() + s.slice(2).toLowerCase();
  const ri = ch => RANKS.indexOf(ch);
  const m = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so]?)(\+?)(?:-([2-9TJQKA])([2-9TJQKA])([so]?))?$/i);
  if (!m) return null;
  const a = ri(m[1].toUpperCase()), b = ri(m[2].toUpperCase());
  const suf = (m[3] || '').toLowerCase();
  const plus = m[4] === '+';
  const codesFor = (hi, lo) => {
    if (hi === lo) return [RANKS[hi] + RANKS[lo]];
    if (hi < lo) [hi, lo] = [lo, hi];
    if (suf) return [RANKS[hi] + RANKS[lo] + suf];
    return [RANKS[hi] + RANKS[lo] + 's', RANKS[hi] + RANKS[lo] + 'o'];
  };
  if (a < 0 || b < 0) return null;

  if (m[5]) { // dash range
    const a2 = ri(m[5].toUpperCase()), b2 = ri(m[6].toUpperCase());
    const out = [];
    if (a === b && a2 === b2) {
      for (let r = Math.min(a, a2); r <= Math.max(a, a2); r++) out.push(RANKS[r] + RANKS[r]);
      return out;
    }
    if (a !== a2) return null;
    for (let r = Math.min(b, b2); r <= Math.max(b, b2); r++) out.push(...codesFor(a, r));
    return out;
  }
  if (plus) {
    const out = [];
    if (a === b) { for (let r = a; r <= 12; r++) out.push(RANKS[r] + RANKS[r]); return out; }
    const hi = Math.max(a, b), lo = Math.min(a, b);
    for (let r = lo; r < hi; r++) out.push(...codesFor(hi, r));
    return out;
  }
  return codesFor(a, b).map(up);
}

function parseFreqSpec(spec, fallback) {
  if (spec === undefined) return { ...fallback };
  spec = spec.trim().toLowerCase();
  if (spec === '') return { ...fallback };
  if (/^\d+$/.test(spec)) return { r: Math.min(100, +spec), c: 0 };
  const r = spec.match(/r(\d*)/), c = spec.match(/c(\d*)/);
  let rv = r ? (r[1] === '' ? 100 : +r[1]) : 0;
  let cv = c ? (c[1] === '' ? 100 : +c[1]) : 0;
  if (!r && !c) return null;
  rv = Math.min(100, rv); cv = Math.min(100 - rv, cv);
  return { r: rv, c: cv };
}

/** Applies notation onto a hands map (mutates). Returns { applied, errors }. */
function applyNotation(hands, text, fallback = { r: 100, c: 0 }) {
  const errors = [];
  let applied = 0;
  for (const raw of text.split(/[,\s]+/)) {
    if (!raw.trim()) continue;
    const [tok, spec] = raw.split(':');
    const codes = expandToken(tok);
    const freq = parseFreqSpec(spec, fallback);
    if (!codes || !freq) { errors.push(raw); continue; }
    for (const code of codes) {
      if (freq.r + freq.c <= 0) delete hands[code];
      else hands[code] = { r: freq.r, c: freq.c };
      applied++;
    }
  }
  return { applied, errors };
}

function rangeFromNotation(text) {
  const hands = {};
  applyNotation(hands, text);
  return hands;
}

/** Compresses a hands map back into readable notation (one token per hand). */
function rangeToNotation(hands) {
  return ALL_CODES.filter(c => hands[c]).map(code => {
    const { r, c } = hands[code];
    if (r === 100) return code;
    if (c === 100) return code + ':c';
    return code + ':' + (r ? 'r' + r : '') + (c ? 'c' + c : '');
  }).join(', ');
}

function rangeStats(hands) {
  let raise = 0, call = 0;
  for (const code of ALL_CODES) {
    const h = hands[code];
    if (!h) continue;
    const n = comboCount(code);
    raise += n * h.r / 100;
    call += n * h.c / 100;
  }
  return { raise, call, total: raise + call, raisePct: raise / 13.26, callPct: call / 13.26, totalPct: (raise + call) / 13.26 };
}

function handFreq(range, code) {
  const h = range && range.hands[code];
  if (!h) return { r: 0, c: 0, f: 100 };
  return { r: h.r, c: h.c, f: Math.max(0, 100 - h.r - h.c) };
}

/** Maps an RNG roll (0-99) to an action given frequencies. Raise occupies the low numbers. */
function actionForRoll(freq, roll) {
  if (roll < freq.r) return 'raise';
  if (roll < freq.r + freq.c) return 'call';
  return 'fold';
}

/* ---------------- Presets ---------------- */
const PRESET_RANGES = [
  {
    name: 'UTG Open (6-max 100bb)', position: 'UTG', note: 'Raise-first-in from under the gun. ~15% of hands.',
    notation: '55+, 44:50, A8s+, A5s, A4s:50, KTs+, K9s:50, QTs+, JTs, T9s:50, 98s:25, AJo+, ATo:50, KQo, KJo:50',
  },
  {
    name: 'HJ Open (6-max 100bb)', position: 'HJ', note: 'Raise-first-in from the hijack. ~19% of hands.',
    notation: '44+, 33:50, A3s+, A2s:50, K9s+, K8s:25, Q9s+, J9s+, T9s, 98s:50, 87s:25, ATo+, A9o:25, KJo+, KTo:25, QJo:50',
  },
  {
    name: 'CO Open (6-max 100bb)', position: 'CO', note: 'Raise-first-in from the cutoff. ~27% of hands.',
    notation: '22+, A2s+, K7s+, K6s:50, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s:50, A8o+, A5o:50, KTo+, K9o:25, QTo+, JTo',
  },
  {
    name: 'BTN Open (6-max 100bb)', position: 'BTN', note: 'Raise-first-in from the button. ~45% of hands.',
    notation: '22+, A2s+, K2s+, Q5s+, Q4s:50, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, 43s:50, A2o+, K8o+, K7o:50, Q9o+, Q8o:50, J9o+, T9o, 98o:50, 87o:25',
  },
  {
    name: 'SB vs BB (raise / limp mix)', position: 'SB', note: 'Folded to you in the small blind. Raise = red, Limp = green.',
    notation: 'K2s-K4s:c, Q2s-Q6s:c, J4s-J6s:c, T5s-T6s:c, 95s-96s:c, 85s:c, 74s:c, 64s:c, 53s+:c, 43s:c, A2o-A4o:c, K5o-K8o:c, Q8o-Q9o:c, J8o-J9o:c, T8o+:c, 98o:c, 87o:c, ' +
      '22+, A2s+, K5s+, Q7s+, J7s+, T7s+, 97s+, 86s+, 75s+, 65s, 54s:r50c50, A5o+, K9o+, QTo+, JTo',
  },
  {
    name: 'BB Defend vs BTN 2.5x', position: 'BB', note: 'Facing a button open. Raise = 3-bet, Call = defend.',
    notation: '22-99:c, A2s-AJs:c, K2s+:c, Q4s+:c, J6s+:c, T6s+:c, 96s+:c, 85s+:c, 74s+:c, 63s+:c, 53s+:c, 43s:c, A2o-AJo:c, K7o+:c, Q8o+:c, J8o+:c, T8o+:c, 98o:c, 87o:c, ' +
      'QQ+, AKs, AKo, JJ:r50c50, TT:r30c70, AQs:r50c50, AQo:r40c60, A5s:r60c40, A4s:r50c50, K9s:r25c75, KQs:r30c70, 76s:r25c75, 65s:r25c75',
  },
];

/* ---------------- Storage ---------------- */
const RangeStore = {
  KEY: 'nlh.ranges.v1',
  ranges: [],
  listeners: [],

  load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { data = null; }
    if (Array.isArray(data)) {
      this.ranges = data;
    } else {
      this.ranges = PRESET_RANGES.map(p => ({
        id: this.newId(), name: p.name, position: p.position, note: p.note, hands: rangeFromNotation(p.notation),
      }));
      this.save();
    }
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.ranges)); } catch (e) { /* storage unavailable */ }
    this.listeners.forEach(fn => fn());
  },

  onChange(fn) { this.listeners.push(fn); },
  newId: () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
  get(id) { return this.ranges.find(r => r.id === id) || null; },
  /** Latest range tagged with a position, so your own ranges take precedence over presets. */
  byPosition(pos) { return this.ranges.filter(r => r.position === pos).pop() || null; },

  upsert(range) {
    const i = this.ranges.findIndex(r => r.id === range.id);
    if (i >= 0) this.ranges[i] = range; else this.ranges.push(range);
    this.save();
  },

  remove(id) {
    this.ranges = this.ranges.filter(r => r.id !== id);
    this.save();
  },

  restorePresets() {
    for (const p of PRESET_RANGES) {
      const existing = this.ranges.find(r => r.name === p.name);
      const hands = rangeFromNotation(p.notation);
      if (existing) existing.hands = hands;
      else this.ranges.push({ id: this.newId(), name: p.name, position: p.position, note: p.note, hands });
    }
    this.save();
  },
};

/* ---------------- Preflop hand strength (Chen formula) ---------------- */
function chenScore(code) {
  const hi = RANKS.indexOf(code[0]), lo = RANKS.indexOf(code[1]);
  const val = r => (r === 12 ? 10 : r === 11 ? 8 : r === 10 ? 7 : r === 9 ? 6 : (r + 2) / 2);
  let s = val(hi);
  if (hi === lo) return Math.max(5, s * 2);
  if (code[2] === 's') s += 2;
  const gap = hi - lo - 1;
  s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 10) s += 1;
  return s;
}

/** Hands sorted strongest first and their percentile (0 = best, 1 = worst), weighted by combos. */
const HAND_ORDER = ALL_CODES.slice().sort((a, b) => {
  const d = chenScore(b) - chenScore(a);
  if (d) return d;
  const kind = c => (c.length === 2 ? 2 : c[2] === 's' ? 1 : 0);
  if (kind(b) !== kind(a)) return kind(b) - kind(a);
  return RANKS.indexOf(b[0]) + RANKS.indexOf(b[1]) - RANKS.indexOf(a[0]) - RANKS.indexOf(a[1]);
});
const HAND_PERCENTILE = {};
(() => {
  let cum = 0;
  for (const code of HAND_ORDER) {
    const n = comboCount(code);
    HAND_PERCENTILE[code] = (cum + n / 2) / 1326;
    cum += n;
  }
})();
