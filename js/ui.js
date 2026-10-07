'use strict';
/* Shared UI helpers. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function setHTML(el, html) {
  if (el && el._html !== html) { el.innerHTML = html; el._html = html; }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

const Store = {
  get(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v === null ? fallback : v; } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  },
};

const ACTION_COLORS = { raise: 'var(--raise)', call: 'var(--call)', fold: 'var(--fold)' };

/** CSS background for a range cell given { r, c } frequencies. */
function rangeCellBg(h) {
  if (!h || (h.r + h.c) <= 0) return 'var(--fold)';
  const r = h.r, rc = h.r + h.c;
  return `linear-gradient(to right, var(--raise) 0 ${r}%, var(--call) ${r}% ${rc}%, var(--fold) ${rc}% 100%)`;
}

function freqText(f) {
  return `Raise ${f.r}% · Call ${f.c}% · Fold ${f.f}%`;
}

/** Renders a 13x13 grid of hand cells. opts: { highlight, mini, labels, cellStyle(code) } */
function renderRangeGrid(container, hands, opts = {}) {
  let html = '';
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      const code = GRID[i][j];
      const bg = opts.cellStyle ? opts.cellStyle(code) : rangeCellBg(hands && hands[code]);
      const cls = ['cell', i === j ? 'pair' : i < j ? 'suited' : 'offsuit'];
      if (opts.highlight === code) cls.push('hl');
      const label = opts.mini ? '' : code;
      html += `<div class="${cls.join(' ')}" data-code="${code}" style="background:${bg}">${label}</div>`;
    }
  }
  setHTML(container, html);
}

function freqBarHtml(f) {
  const seg = (v, cls, label) => (v > 0 ? `<div class="fb-seg ${cls}" style="width:${v}%">${v >= 12 ? label + ' ' + v + '%' : ''}</div>` : '');
  return `<div class="freq-bar">${seg(f.r, 'fb-raise', 'Raise')}${seg(f.c, 'fb-call', 'Call')}${seg(f.f, 'fb-fold', 'Fold')}</div>`;
}

/** Simple modal. buttons: [{ label, cls, onClick }] — onClick returning false keeps it open. */
function showModal(title, bodyHtml, buttons = [{ label: 'Close' }]) {
  const modal = $('#modal');
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;
  const actions = $('#modal-actions');
  actions.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (b.cls || '');
    btn.textContent = b.label;
    btn.onclick = () => { if (!b.onClick || b.onClick() !== false) modal.hidden = true; };
    actions.appendChild(btn);
  }
  modal.hidden = false;
}

/** Wires up .subtabs buttons inside a section to show the matching .subpanel. */
function initSubtabs(section, onShow) {
  const buttons = $$('.subtabs button', section);
  const key = 'nlh.sub.' + section.id;
  const show = name => {
    buttons.forEach(b => b.classList.toggle('active', b.dataset.sub === name));
    $$('.subpanel', section).forEach(p => p.classList.toggle('active', p.dataset.sub === name));
    Store.set(key, name);
    if (onShow) onShow(name);
  };
  buttons.forEach(b => b.addEventListener('click', () => show(b.dataset.sub)));
  const saved = Store.get(key, null);
  show(buttons.some(b => b.dataset.sub === saved) ? saved : buttons[0].dataset.sub);
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function pct(x, digits = 1) {
  return (x * 100).toFixed(digits) + '%';
}

/** Renders a card picker-friendly row of cards from a string like "AhKd". */
function cardsHtml(cards, size = '') {
  return cards.map(c => Cards.html(c, size)).join('');
}
