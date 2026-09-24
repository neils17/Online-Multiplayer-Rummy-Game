import assert from 'node:assert/strict';
import {
  DISCARD_GROUP,
  GROUP,
  initialHandOrder,
  splitGroups,
  reorderGroup,
  removeGroup,
  moveToGroup,
  ensureDrawGroup,
  reserveInGroup,
  arrangeHand,
  describeGroup,
} from '../lib/arrange.ts';
import {
  analyze,
  naturalCompletion,
  value,
  saveLayout,
  reconcileLayout,
  act,
} from '../lib/game.ts';
let order = initialHandOrder(
  Array.from({ length: 13 }, (_, i) => 'c' + i),
  false,
);
assert.equal(order.at(-1), DISCARD_GROUP);
assert.deepEqual(removeGroup(order, DISCARD_GROUP), order);
assert.deepEqual(reorderGroup(order, DISCARD_GROUP, 0), order);
order = moveToGroup(order, 'c0', DISCARD_GROUP);
assert.deepEqual(moveToGroup(order, 'c1', DISCARD_GROUP), order);
order = moveToGroup(order, 'c0', GROUP + 'a');
assert.ok(order.includes(DISCARD_GROUP), 'empty fixed slot stays available');
const draw = ensureDrawGroup(order);
assert.equal(
  splitGroups(draw).filter((g) => g.id !== DISCARD_GROUP && !g.ids.length)
    .length,
  1,
  'empty fixed slot is not an incoming-card group',
);
const incoming = reserveInGroup(draw, 'new');
assert.equal(
  splitGroups(incoming).find((g) => g.id === DISCARD_GROUP).ids.length,
  0,
);
assert.equal(
  splitGroups(reorderGroup(incoming, GROUP + 'a', 2)).at(-1).id,
  DISCARD_GROUP,
);
let seed = 300;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
for (let trial = 0; trial < 16; trial++) {
  const deck = Array.from({ length: 52 }, (_, i) => ({
    id: String(i),
    r: (i % 13) + 1,
    s: Math.floor(i / 13),
  }));
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  // Seed useful sequences so penalty minimization tests more than all-80 hands.
  const hand =
    trial < 8
      ? [
          { id: 'a', r: 2, s: 0 },
          { id: 'b', r: 3, s: 0 },
          { id: 'c', r: 4, s: 0 },
          { id: 'd', r: 6, s: 1 },
          { id: 'e', r: 7, s: 1 },
          { id: 'f', r: 8, s: 1 },
          ...deck
            .filter(
              (c) =>
                !(
                  (c.s === 0 && [2, 3, 4].includes(c.r)) ||
                  (c.s === 1 && [6, 7, 8].includes(c.r))
                ),
            )
            .slice(0, 7),
        ]
      : deck.slice(0, 14);
  const wild = 9,
    groups = arrangeHand(hand, wild, null, true);
  const retained = hand.length === 14 ? groups.slice(0, -1) : groups;
  const rest = retained.flat();
  const infos = retained.map((g) => describeGroup(g, wild));
  const gate =
    infos.some((i) => i.pure) && infos.filter((i) => i.sequence).length >= 2;
  const actual = naturalCompletion(rest)
    ? 0
    : gate
      ? Math.min(
          80,
          retained.reduce(
            (n, g, i) =>
              n +
              (infos[i].valid ? 0 : g.reduce((s, c) => s + value(c, wild), 0)),
            0,
          ),
        )
      : 80;
  const best =
    hand.length === 14
      ? Math.min(
          ...hand.map(
            (c) =>
              analyze(
                hand.filter((x) => x.id !== c.id),
                wild,
              ).penalty,
          ),
        )
      : analyze(hand, wild).penalty;
  assert.equal(
    actual,
    best,
    'optimal displayed groups must achieve the lowest penalty',
  );
  assert.equal(new Set(groups.flat().map((c) => c.id)).size, hand.length);
}
const p = {
  name: 'A',
  hand: [
    { id: 'a', r: 2, s: 0 },
    { id: 'b', r: 3, s: 0 },
  ],
  score: 90,
  draws: 1,
};
const g = {
  players: [p, { name: 'B', hand: [], score: 0, draws: 0 }],
  status: 'playing',
  round: 1,
  history: [],
  maxScore: 101,
};
assert.ok(saveLayout(g, 0, { groups: [['b']], discardId: 'a' }));
assert.equal(
  saveLayout(g, 0, { groups: [['a', 'a']], discardId: undefined }),
  false,
);
assert.deepEqual(reconcileLayout(p), { groups: [['b']], discardId: 'a' });
assert.throws(() => act(g, 0, 'drop'), /can’t drop/);
act(g, 0, 'leave');
assert.equal(g.status, 'ended');
assert.equal(p.score, 130);
act(g, 0, 'leave');
assert.equal(p.score, 130);
console.log(
  'PASS: fixed slot persistence/capacity, incoming group separation, minimum-penalty arrangements, validated layouts and leaving despite drop restrictions.',
);
