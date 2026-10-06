# No Limits — NLHE Study & Practice

A browser-based trainer for No-Limit Texas Hold'em. It's plain HTML/CSS/JavaScript with no build step and no server: open `index.html` or host the folder on GitHub Pages.

## Tabs

| Tab | What's in it |
| --- | --- |
| **Hands** | Hand rankings with odds, a starting-hand strength chart, a *Who wins?* showdown drill, a **Range Drill** against your own ranges (with RNG mode), and a Monte Carlo equity calculator (cards, ranges or random hands). |
| **Tells** | A filterable library of live, timing, betting-pattern and online tells; player-type profiles (TAG, LAG, Nit, Fish, Calling Station, Maniac, Reg) with how to exploit each; and a tell quiz. |
| **Spots** | A spot trainer with preflop, flop, turn and river decisions, each graded best / okay / mistake with explanations. Also an outs and odds table, math calculators (pot odds, MDF, bluff break-even, SPR, implied odds), key concepts, and the **Hand Lab** (below). |
| **Range Builder** | A 13×13 grid you paint by clicking or dragging. Brushes can mix raise and call frequencies (for example 60/40). You can also tag a range with a position, apply range notation (`77+, ATs+, A5s:50, 65s:c, T9s:r40c60`), export/import JSON, and restore the 6-max presets. Ranges save automatically in your browser. |
| **Practice Arena** | An interactive 2–6 handed table against AI opponents. You choose each seat's player type, or *Random (hidden)* so you have to work out the type yourself. |

## Hand Lab (Spots → Hand Lab)

Rebuild hands from your real sessions and analyze them.

- **Setup**: use the slider to pick 2–9 players (heads-up through full ring), then set the blinds, your position, and each player's name, stack and player type. Enter your hole cards and anyone else's you know (from showdown or otherwise) by clicking cards in the picker or typing them (e.g. `AhKd`). Unknown hands are treated as random.
- **Entering the action**: an arena-style table with the same Fold / Check-Call / Bet-Raise buttons, size presets and slider as the Practice Arena, plus Undo. Board cards come from a card picker, or **Random** for run-outs.
- **Replay**: step through every point of the hand (◀ ▶, the slider, ← → keys, or by clicking the hand log). At each point you see:
  - **Spot Stats** for the player to act: pot, to call, pot odds, equity needed, size of the bet faced as a % of the pot, MDF, effective stack, SPR, position, players still to act, min-raise and all-in amounts. When their cards are known it also shows whether the call is profitable on direct odds, or how much more they'd need to win later (implied odds).
  - **Equity & Outs**: every live player's equity, made hand, and the outs that would put them in the lead.
  - **Bet sizing**: the last bet as a % of the pot, and how often it must work as a bluff.
- **Decision Review**: every decision is graded the same way as the arena's Hand Review (decision, sizing, range, position and hindsight). You can grade only your own decisions, or every player's whose cards are known.
- Hands can be saved (up to 100) with notes, and loaded again from the Saved Hands list. **Load example** shows a full worked hand.

## Practice Arena features

- A full NLHE engine with blinds, min-raise rules, side pots, all-in run-outs, split pots and uncalled-bet refunds.
- AI opponents that play to their type: VPIP/PFR, 3-bet frequency, aggression, bluffing and how often they call down all differ by type.
- **Range Helper**: choose a saved range, or *Auto* to use the range tagged with your current position. Each hand it shows your hand's raise/call/fold frequencies and an RNG roll from 0–99. Raise covers the lowest numbers, then call, then fold, so the roll tells you which action to take. Your first preflop action is checked against the roll, and **range discipline** is tracked across the session.
- **Hand Helper**: your made hand, your equity against the remaining players (Monte Carlo against random hands), the pot odds you're getting, and SPR.
- **Live tells**: opponents sometimes show a tell from the Tells library as they act. A bubble appears at their seat, timing tells change how long they take, and every tell is logged in a **Table Reads** panel. Tells show up more often when a player bets into you on the turn or river.
  - Each player type leans on its own cues: Maniacs splash chips, Fish sigh and act reluctant, Nits glance at their chips, Stations snap-call.
  - Each player also has a hidden *signature* tell that shows up more often for that player.
  - **Whether a tell is honest is randomized.** The chance depends on the tell's reliability, the player's type (Regs and LAGs are the most deceptive, Fish and Stations the most honest) and a hidden honesty level for each player. You can't follow tells blindly; weigh them against range, position and bet sizing.
  - After each hand, every tell is marked honest ✓ or false ✗ along with what the player actually held, and the Table Reads panel keeps a running honesty record for each player.
  - The Hand Review adds a **Tells** card. It shows whether the tell agreed with what the player's range and betting already suggested, whether it was true, whether following it worked, and whether the spot was close enough for a tell to matter.
  - Table Setup controls how often tells appear (off, rare, normal or frequent) and whether each tell's usual meaning is shown.
- **Hand Review** after every hand, with every player's hole cards revealed (including what folded hands would have made, and the board cards that weren't dealt). You step through each of your decisions (← →), and each one is graded *Good / Okay / Mistake* on:
  - **Decision**: your equity against each opponent's *estimated* range (built from their player type and actions) compared with the pot odds, plus the recommended action and size.
  - **Sizing**: open, 3-bet and raise multiples, and bet size as a share of the pot relative to hand strength and board texture.
  - **Range**: whether you followed your saved range and its RNG roll preflop, and what share of the opponent's range you beat after the flop.
  - **Position**: in or out of position, players left to act, and hands too loose for your seat.
  - **Hindsight**: your equity against their actual cards, and whether a fold would have won. This is shown separately so results don't get mixed up with decision quality.
  The last 30 hands stay reviewable from a dropdown. Press `V` to toggle the review.
- Session stats: net bb, bb/100, VPIP, PFR, WTSD, W$SD and buy-ins, plus a full hand log.
- Keyboard shortcuts: `F` fold, `C` check/call, `R` bet/raise, `N` deal, `V` review hand.
- Training toggles: reveal all hole cards, hide opponent types, show amounts in big blinds, four-color deck, and AI speed.

## Running locally

```bash
# any static server works, or just open index.html directly
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Code layout

```
index.html        page shell and tab markup
css/style.css     theme, cards, table, grids, responsive layout
js/cards.js       deck, 7-card hand evaluator, Monte Carlo equity
js/ranges.js      range model, notation parser, presets, storage, preflop strength
js/ai.js          player-type profiles and AI decision logic
js/game.js        NLHE game engine (betting, streets, side pots, showdown)
js/ui.js          shared DOM/rendering helpers
js/analysis.js    post-hand decision grading (range estimation, equity, sizing, position)
js/review.js      Hand Review panel UI
js/tells.js       live opponent tells (cues, randomized honesty, per-player personalities)
js/handlab.js     Hand Lab: hand entry engine, replay, stats and grading for real-session hands
js/study.js       Hands, Tells and Spots tabs
js/builder.js     Range Builder tab
js/arena.js       Practice Arena UI, range helper and stats
js/app.js         tab routing and bootstrap
```

Data such as ranges, settings and the last open tab is stored in `localStorage` in your browser.
