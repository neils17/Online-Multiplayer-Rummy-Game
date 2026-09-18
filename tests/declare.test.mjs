import assert from 'node:assert/strict';
import { act, analyze, winningDiscard } from '../lib/game.ts';
let id = 0;
const cs = (ranks, s) => ranks.map((r) => ({ id: `c${id++}`, r, s }));
const ready = [
  ...cs([3, 4, 5, 6], 0),
  ...cs([6, 7, 8], 1),
  ...cs([6], 2),
  ...cs([6], 3),
  ...cs([12], 0),
  ...cs([12], 1),
  ...cs([12], 2),
  ...cs([12], 3),
];
const spare = cs([2], 3)[0];
const make = (hand) => ({
  players: [
    { name: 'A', token: 'a', hand: structuredClone(hand), score: 7, draws: 1 },
    {
      name: 'B',
      token: 'b',
      hand: cs([2, 4, 6, 8, 10, 12, 2, 4, 6, 8, 10, 12, 13], 0),
      score: 11,
      draws: 0,
    },
  ],
  pile: cs([9], 3),
  deck: [],
  wild: cs([10], 3)[0],
  phase: 'discard',
  turn: 0,
  status: 'playing',
  round: 1,
  history: [],
  picked: null,
});
assert.equal(winningDiscard([...ready, spare], 10, null)?.id, spare.id);
for (const selected of [undefined, ready[0].id]) {
  const g = make([...ready, spare]);
  act(g, 0, 'declare', selected);
  assert.equal(g.status, 'ended');
  assert.equal(g.players[0].score, 7);
  assert.equal(g.players[0].hand.length, 13);
  assert.equal(g.pile.at(-1).id, spare.id);
  assert.ok(analyze(g.players[0].hand, 10).valid);
  assert.equal(g.history.length, 1);
}
const invalid = make(cs([2, 4, 6, 8, 10, 12, 2, 4, 6, 8, 10, 12, 13, 13], 0));
const before = structuredClone(invalid.players[0].hand);
act(invalid, 0, 'declare');
assert.equal(invalid.status, 'ended');
assert.equal(invalid.players[0].score, 87);
assert.deepEqual(invalid.players[0].hand, before);
assert.equal(invalid.history.length, 1);
const restricted = make([...ready, spare]);
restricted.picked = spare.id;
act(restricted, 0, 'declare');
assert.equal(restricted.players[0].score, 7);
assert.equal(restricted.pile.at(-1).id, spare.id);
const short = make(ready);
assert.throws(() => act(short, 0, 'declare'), /14 cards/);
assert.equal(short.status, 'playing');
const wrongTurn = make([...ready, spare]);
assert.throws(() => act(wrongTurn, 1, 'declare'), /turn/);
assert.equal(wrongTurn.status, 'playing');
const beforeDraw = make(ready);
beforeDraw.phase = 'draw';
assert.throws(() => act(beforeDraw, 0, 'declare'), /14 cards/);
console.log(
  'PASS: unselected declaration, selected card ignored, automatic winning spare, invalid penalty, open draw can be the winning discard, 14-card and turn enforcement.',
);
