'use strict';
/* App bootstrap and tab routing. */

const App = {
  tabs: ['hands', 'tells', 'spots', 'ranges', 'arena', 'tournament'],

  init() {
    RangeStore.load();
    Hands.init();
    Tells.init();
    Spots.init();
    Builder.init();
    HandLab.init();
    Tournament.prepareDom(); // clones the arena table UI, so it must run before Arena.init
    Arena.init();
    Tournament.init();

    $$('#main-tabs button').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.tab; }));
    window.addEventListener('hashchange', () => this.show(location.hash.slice(1)));
    this.show(location.hash.slice(1) || Store.get('nlh.tab', 'hands'));
    $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') e.target.hidden = true; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#modal').hidden = true; });
  },

  show(tab) {
    if (!this.tabs.includes(tab)) tab = 'hands';
    $$('#main-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
    document.body.classList.toggle('on-arena', tab === 'arena');
    document.body.classList.toggle('on-tournament', tab === 'tournament');
    Store.set('nlh.tab', tab);
    if (tab === 'arena') Arena.layoutSeats();
    if (tab === 'tournament') Tournament.layoutSeats();
    window.scrollTo(0, 0);
  },
};

document.addEventListener('DOMContentLoaded', () => {
  ['hands', 'tells', 'spots'].forEach(t => initSubtabs($('#tab-' + t)));
  App.init();
});
