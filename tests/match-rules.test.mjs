import assert from 'node:assert/strict';
import {
  act,
  deal,
  analyze,
  gameOptions,
  droppedCard,
  isWild,
  naturalCompletion,
  winningDiscard,
} from '../lib/game.ts';
let id = 0;
const cards = (ranks, s) => ranks.map((r) => ({ id: `test${id++}`, r, s }));
const make = (decks = 2) => {
  const g = {
    ...gameOptions(false, 101, decks),
    players: [
      { name: 'A', token: 'a', hand: [], score: 0, draws: 0 },
      { name: 'B', token: 'b', hand: [], score: 0, draws: 0 },
    ],
    history: [],
    round: 0,
  };
  deal(g);
  return g;
};
for (const decks of [1, 2]) {
  const g = make(decks),
    all = [...g.deck, ...g.pile, g.wild, ...g.players.flatMap((p) => p.hand)];
  assert.equal(all.length, 53 * decks);
  assert.equal(new Set(all.map((c) => c.id)).size, all.length);
  assert.equal(all.filter((c) => c.r === 0).length, decks);
}
assert.throws(() => gameOptions(false, 101, 3));
const noPure = Array.from({ length: 13 }, (_, i) => ({
  id: `low${i}`,
  r: 2,
  s: i % 4,
}));
assert.equal(
  analyze(noPure, 9).penalty,
  80,
  'full 80 even when raw values total less',
);
const onePure = [
  ...cards([1, 2, 3], 0),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `repeat${i}`,
    r: 8,
    s: i % 4,
  })),
];
assert.equal(analyze(onePure, 9).penalty, 80, 'one pure alone exempts nothing');
const qualified = [
  ...cards([1, 2, 3], 0),
  ...cards([4, 0, 6], 1),
  ...cards([8], 0),
  ...cards([8], 1),
  ...cards([8], 2),
  ...cards([10], 0),
  ...cards([12], 1),
  ...cards([13], 2),
  ...cards([7], 3),
];
assert.equal(
  analyze(qualified, 9).penalty,
  37,
  'pure plus separate impure exempts sequences and sets',
);
const sets = [
  ...cards([2, 5, 8], 0),
  ...cards([2, 5, 8], 1),
  ...cards([2, 5, 8], 2),
  ...cards([2, 5, 8, 11], 3),
];
assert.equal(analyze(sets, 9).penalty, 80);
assert.equal(analyze(sets, 9).valid, false);
const natural = [
  ...cards([1, 2, 3], 0),
  ...cards([4, 5, 6], 1),
  ...cards([7, 8, 9], 2),
  ...cards([10, 11, 12, 13], 3),
];
assert.equal(naturalCompletion(natural).kind, 'sequences');
const bonus = make();
bonus.wild = { id: 'w', r: 9, s: 0 };
bonus.players[0].hand = [...natural, { id: 'spare', r: 2, s: 3 }];
bonus.players[1].hand = noPure;
bonus.phase = 'discard';
bonus.picked = 'spare';
assert.equal(winningDiscard(bonus.players[0].hand, 9, 'spare').id, 'spare');
act(bonus, 0, 'declare');
assert.equal(bonus.players[1].score, 160);
assert.equal(bonus.history[0].discard.id, 'spare');
assert.equal(bonus.players[0].hand.length, 13);
assert.equal(bonus.players[1].hand.length, 13);
act(bonus, 0, 'restart');
assert.equal(bonus.status, 'ended');
assert.deepEqual(bonus.ready, [true, false]);
act(bonus, 1, 'restart');
assert.equal(bonus.match, 2);
assert.equal(bonus.round, 1);
assert.deepEqual(
  bonus.players.map((p) => p.score),
  [0, 0],
);
const dropped = make();
dropped.players[0].score = 81;
assert.throws(() => act(dropped, 0, 'drop'), /can’t drop.*101/);
assert.equal(dropped.status, 'playing');
dropped.players[0].score = 80;
act(dropped, 0, 'drop');
assert.equal(dropped.players[0].score, 100);
act(dropped, 0, 'next');
assert.equal(dropped.status, 'ended');
act(dropped, 1, 'next');
assert.equal(dropped.round, 2);
const later = make();
later.players[0].score = 61;
later.players[0].draws = 1;
assert.throws(() => act(later, 0, 'drop'), /40 points/);
for (const card of [
  { id: 'j', r: 0, s: 0 },
  { id: 'w', r: 7, s: 2 },
]) {
  const g = make();
  g.wild = { id: 'indicator', r: 7, s: 1 };
  g.pile = [card];
  act(g, 0, 'open');
  assert.ok(isWild(g.players[0].hand.at(-1), 7));
  act(g, 0, 'discard', card.id);
  assert.deepEqual(g.pile.at(-1), droppedCard(card, g.wild));
  act(g, 1, 'open');
  assert.equal(isWild(g.players[1].hand.at(-1), 7), false);
  act(g, 1, 'discard', card.id);
}
const bot = make();
bot.players[1].bot = true;
act(bot, 0, 'drop');
act(bot, 0, 'next');
assert.equal(bot.round, 2);
console.log(
  'PASS: 1/2 decks, exact 80-point sequence gate, meld exemptions, natural double bonus, winning discard, loss-preventing drops, immediate rediscard, both-player readiness and bot readiness.',
);
