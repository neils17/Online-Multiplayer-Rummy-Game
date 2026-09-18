import assert from 'node:assert/strict';
import { act, deal } from '../lib/game.ts';
import { advanceBot, scheduleBot, chooseBotDiscard } from '../lib/bot.ts';
const make = () => {
  const g = {
    players: [
      { name: 'You', hand: [], score: 0, draws: 0, token: 'human' },
      { name: 'Bot', hand: [], score: 0, draws: 0, token: 'bot', bot: true },
    ],
    history: [],
    round: 0,
  };
  deal(g);
  return g;
};
const g = make();
assert.equal(advanceBot(g, 9999999999999), false);
act(g, 0, 'draw');
act(g, 0, 'discard', g.players[0].hand[0].id);
scheduleBot(g, 1000);
assert.equal(advanceBot(g, 1849), false);
assert.equal(advanceBot(g, 1850), true);
assert.equal(g.players[1].hand.length, 14);
assert.equal(g.phase, 'discard');
assert.equal(advanceBot(g, 1850), false);
assert.equal(advanceBot(g, 2700), true);
assert.equal(g.players[1].hand.length, 13);
assert.equal(g.turn, 0);
const hand = [
  { id: 'a', r: 3, s: 0 },
  { id: 'b', r: 4, s: 0 },
  { id: 'c', r: 5, s: 0 },
  { id: 'j', r: 0, s: 0 },
];
assert.ok(hand.some((c) => c.id === chooseBotDiscard(hand, 9, 'a').id));
assert.notEqual(chooseBotDiscard(hand, 9, 'a').id, 'j');
const w = make();
let id = 0;
const cards = (ranks, s) => ranks.map((r) => ({ id: String(id++), r, s }));
w.players[1].hand = [
  ...cards([1, 2, 3], 0),
  ...cards([4, 5, 6], 1),
  ...cards([9, 10, 11, 12], 2),
  ...cards([8], 0),
  ...cards([8], 1),
  ...cards([8], 2),
  ...cards([13], 3),
];
w.wild = { id: 'wild', r: 7, s: 3 };
w.turn = 1;
w.phase = 'discard';
w.botAt = 0;
assert.equal(advanceBot(w, 10), true);
assert.equal(w.status, 'ended');
assert.match(w.message, /Bot declared a winning/);
assert.equal(w.history.length, 1);
act(w, 0, 'next');
scheduleBot(w, 100);
assert.equal(w.turn, 1);
assert.equal(advanceBot(w, 950), true);
const j = make();
j.turn = 1;
j.wild = { id: 'wild', r: 5, s: 0 };
j.pile = [{ id: 'joker', r: 0, s: 0 }];
j.botAt = 0;
j.players[1].hand = [
  { id: 'three', r: 3, s: 0 },
  { id: 'four', r: 4, s: 0 },
  ...Array.from({ length: 11 }, (_, i) => ({ id: `king${i}`, r: 13, s: 3 })),
];
advanceBot(j, 0);
assert.equal(j.pile.length, 0);
assert.equal(j.players[1].hand.length, 14);
const fixed = j.players[1].hand.at(-1);
assert.equal(fixed.id, 'joker');
assert.equal(fixed.r, 0);
assert.equal(fixed.s, 0);
assert.equal(fixed.naturalOnly, undefined);
console.log(
  'PASS: delayed turns, draw/discard counts, legal discards, joker handling, winning declaration and bot starting the next round.',
);
