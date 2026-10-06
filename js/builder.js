'use strict';
/* Range Builder tab. */

const Builder = {
  current: null,
  brush: { r: 100, c: 0 },
  painting: false,
  paintMode: null, // 'paint' | 'erase'

  init() {
    this.grid = $('#rb-grid');
    const lastId = Store.get('nlh.builder.current', null);
    this.select(RangeStore.get(lastId) || RangeStore.ranges[0] || this.createRange());
    this.bindBrush();
    this.bindGrid();
    this.bindMeta();
    this.bindTools();
    RangeStore.onChange(() => this.renderList());
    this.setBrush(100, 0);
  },

  createRange(name = 'New Range') {
    const r = { id: RangeStore.newId(), name, position: '', note: '', hands: {} };
    RangeStore.upsert(r);
    return r;
  },

  select(range) {
    this.current = range;
    Store.set('nlh.builder.current', range.id);
    $('#rb-name').value = range.name;
    $('#rb-position').value = range.position || '';
    $('#rb-note').value = range.note || '';
    this.renderList();
    this.renderGrid();
  },

  save() {
    RangeStore.upsert(this.current);
  },

  renderList() {
    const list = $('#rb-list');
    list.innerHTML = RangeStore.ranges.map(r => {
      const st = rangeStats(r.hands);
      return `<li class="${this.current && r.id === this.current.id ? 'active' : ''}" data-id="${r.id}">
        <div class="rl-name">${esc(r.name)}</div>
        <div class="rl-meta">${r.position ? `<span class="pos-badge">${r.position}</span>` : ''}<span>${st.totalPct.toFixed(1)}%</span></div>
      </li>`;
    }).join('') || '<li class="empty">No ranges yet.</li>';
    $$('li[data-id]', list).forEach(li => (li.onclick = () => this.select(RangeStore.get(li.dataset.id))));
  },

  renderGrid() {
    renderRangeGrid(this.grid, this.current.hands);
    this.renderStats();
  },

  updateCell(code) {
    const cell = this.grid.querySelector(`[data-code="${code}"]`);
    if (cell) cell.style.background = rangeCellBg(this.current.hands[code]);
  },

  renderStats() {
    const st = rangeStats(this.current.hands);
    $('#rb-stats').innerHTML = `
      <div><span>Raise</span><b class="c-raise">${st.raisePct.toFixed(1)}%</b><small>${st.raise.toFixed(0)} combos</small></div>
      <div><span>Call</span><b class="c-call">${st.callPct.toFixed(1)}%</b><small>${st.call.toFixed(0)} combos</small></div>
      <div><span>Total played</span><b>${st.totalPct.toFixed(1)}%</b><small>${st.total.toFixed(0)} / 1326</small></div>
      <div><span>Fold</span><b class="c-fold">${(100 - st.totalPct).toFixed(1)}%</b><small>${(1326 - st.total).toFixed(0)} combos</small></div>`;
  },

  /* ---------- Brush ---------- */
  setBrush(r, c) {
    r = Math.max(0, Math.min(100, r));
    c = Math.max(0, Math.min(100 - r, c));
    this.brush = { r, c };
    $('#rb-r').value = r;
    $('#rb-c').value = c;
    $('#rb-r-val').textContent = r + '%';
    $('#rb-c-val').textContent = c + '%';
    $('#rb-preview').style.background = rangeCellBg(this.brush);
    $('#rb-preview-text').textContent = r + c === 0 ? 'Fold (erase)' : `R ${r} · C ${c} · F ${100 - r - c}`;
    $$('#rb-brushes .brush').forEach(b => b.classList.toggle('active', +b.dataset.r === r && +b.dataset.c === c));
  },

  bindBrush() {
    $$('#rb-brushes .brush').forEach(b => (b.onclick = () => this.setBrush(+b.dataset.r, +b.dataset.c)));
    $('#rb-r').oninput = e => {
      const r = +e.target.value;
      this.setBrush(r, Math.min(this.brush.c, 100 - r));
    };
    $('#rb-c').oninput = e => {
      const c = +e.target.value;
      this.setBrush(Math.min(this.brush.r, 100 - c), c);
    };
  },

  /* ---------- Painting ---------- */
  applyBrushTo(code) {
    const hands = this.current.hands;
    if (this.paintMode === 'erase' || this.brush.r + this.brush.c === 0) delete hands[code];
    else hands[code] = { r: this.brush.r, c: this.brush.c };
    this.updateCell(code);
  },

  sameAsBrush(code) {
    const h = this.current.hands[code];
    if (!h) return this.brush.r + this.brush.c === 0;
    return h.r === this.brush.r && h.c === this.brush.c;
  },

  bindGrid() {
    const cellAt = e => {
      const t = document.elementFromPoint(e.clientX, e.clientY);
      return t && t.closest ? t.closest('#rb-grid .cell') : null;
    };
    this.grid.addEventListener('pointerdown', e => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      e.preventDefault();
      this.painting = true;
      // Clicking a hand that already matches the brush erases instead (toggle behaviour).
      this.paintMode = this.sameAsBrush(cell.dataset.code) ? 'erase' : 'paint';
      this.lastCode = cell.dataset.code;
      this.applyBrushTo(cell.dataset.code);
      this.renderStats();
    });
    window.addEventListener('pointermove', e => {
      if (this.painting) {
        const cell = cellAt(e);
        if (cell && cell.dataset.code !== this.lastCode) {
          this.lastCode = cell.dataset.code;
          this.applyBrushTo(cell.dataset.code);
          this.renderStats();
        }
      }
    });
    const stop = () => {
      if (!this.painting) return;
      this.painting = false;
      this.save();
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);

    this.grid.addEventListener('pointerover', e => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      const code = cell.dataset.code;
      const f = handFreq(this.current, code);
      $('#rb-hover').innerHTML = `<b>${code}</b> · ${comboCount(code)} combos · ${freqText(f)}`;
    });
  },

  /* ---------- Meta & tools ---------- */
  bindMeta() {
    $('#rb-name').oninput = e => { this.current.name = e.target.value || 'Untitled'; this.save(); };
    $('#rb-position').onchange = e => { this.current.position = e.target.value; this.save(); };
    $('#rb-note').oninput = e => { this.current.note = e.target.value; this.save(); };
    $('#rb-new').onclick = () => this.select(this.createRange());
    $('#rb-duplicate').onclick = () => {
      const copy = JSON.parse(JSON.stringify(this.current));
      copy.id = RangeStore.newId();
      copy.name = this.current.name + ' (copy)';
      RangeStore.upsert(copy);
      this.select(copy);
    };
    $('#rb-delete').onclick = () => {
      showModal('Delete range?', `<p>Delete <b>${esc(this.current.name)}</b>? This can't be undone.</p>`, [
        { label: 'Cancel' },
        {
          label: 'Delete', cls: 'btn-danger', onClick: () => {
            RangeStore.remove(this.current.id);
            this.select(RangeStore.ranges[0] || this.createRange());
          },
        },
      ]);
    };
  },

  bindTools() {
    $$('#rb-quick .chip').forEach(b => (b.onclick = () => {
      applyNotation(this.current.hands, b.dataset.n, this.brush);
      this.save();
      this.renderGrid();
    }));
    $('#rb-clear').onclick = () => {
      this.current.hands = {};
      this.save();
      this.renderGrid();
    };
    $('#rb-apply').onclick = () => {
      const text = $('#rb-notation').value;
      const { errors } = applyNotation(this.current.hands, text, this.brush);
      this.save();
      this.renderGrid();
      $('#rb-hover').innerHTML = errors.length ? `<span class="bad">Couldn't read: ${esc(errors.join(', '))}</span>` : 'Notation applied.';
    };
    $('#rb-show-notation').onclick = () => { $('#rb-notation').value = rangeToNotation(this.current.hands); };

    $('#rb-export').onclick = () => {
      const json = JSON.stringify(RangeStore.ranges, null, 1);
      showModal('Export ranges', `<p class="hint">Copy this JSON to back up or share your ranges.</p><textarea class="code-area" rows="12" readonly>${esc(json)}</textarea>`, [
        { label: 'Download .json', cls: 'btn-primary', onClick: () => { this.download('nlh-ranges.json', json); return false; } },
        { label: 'Close' },
      ]);
      const ta = $('#modal-body textarea');
      ta.focus(); ta.select();
    };
    $('#rb-import').onclick = () => {
      showModal('Import ranges', `<p class="hint">Paste exported JSON. Imported ranges are added to your list.</p><textarea class="code-area" id="import-text" rows="12"></textarea><div id="import-err" class="bad"></div>`, [
        { label: 'Cancel' },
        {
          label: 'Import', cls: 'btn-primary', onClick: () => {
            try {
              const data = JSON.parse($('#import-text').value);
              const list = Array.isArray(data) ? data : [data];
              let n = 0;
              for (const r of list) {
                if (!r || typeof r.hands !== 'object') continue;
                const hands = {};
                for (const code of ALL_CODES) {
                  const h = r.hands[code];
                  if (h && (+h.r || +h.c)) hands[code] = { r: Math.min(100, +h.r || 0), c: Math.min(100 - Math.min(100, +h.r || 0), +h.c || 0) };
                }
                RangeStore.upsert({ id: RangeStore.newId(), name: String(r.name || 'Imported range').slice(0, 60), position: POSITIONS.includes(r.position) ? r.position : '', note: String(r.note || '').slice(0, 140), hands });
                n++;
              }
              if (!n) throw new Error('No ranges found');
            } catch (err) {
              $('#import-err').textContent = 'Invalid JSON: ' + err.message;
              return false;
            }
          },
        },
      ]);
    };
    $('#rb-presets').onclick = () => {
      RangeStore.restorePresets();
      this.renderGrid();
    };
  },

  download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};
