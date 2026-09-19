import assert from 'node:assert/strict';
import {
  GROUP,
  DISCARD_GROUP,
  initialHandOrder,
  ensureDiscardGroup,
  ensureDrawGroup,
  reserveInGroup,
  splitGroups,
  moveToGroup,
  reorderGroup,
  removeGroup,
  stableArrangement,
} from '../lib/arrange.ts';
import { act, recordDeclaredGroups } from '../lib/game.ts';
const ids = Array.from({ length: 13 }, (_, i) => 'c' + i);
const expert = initialHandOrder(ids, true);
assert.equal(splitGroups(expert).length, 5);
assert.deepEqual(splitGroups(expert)[0].ids, ids);
assert.equal(splitGroups(expert).filter((g) => !g.ids.length).length, 4);
let order = ensureDiscardGroup([GROUP + 'a', 'a', 'b', GROUP + 'b', 'c', 'd']);
assert.equal(order.at(-1), DISCARD_GROUP);
order = moveToGroup(order, 'new', DISCARD_GROUP);
assert.deepEqual(
  moveToGroup(order, 'second', DISCARD_GROUP),
  order,
  'discard space refuses a second card',
);
const withDraw = ensureDrawGroup(order);
assert.equal(splitGroups(withDraw).at(-1).ids.length, 0);
const reserved = reserveInGroup(withDraw, 'incoming');
assert.deepEqual(splitGroups(reserved).at(-1).ids, ['incoming']);
const shuffled = reorderGroup(expert, GROUP + 'loose', 4);
assert.equal(splitGroups(shuffled).at(-1).id, GROUP + 'loose');
assert.deepEqual(
  shuffled.filter((id) => !id.startsWith(GROUP)),
  ids,
);
assert.deepEqual(
  splitGroups(removeGroup(order, GROUP + 'b')).find(
    (g) => g.id === DISCARD_GROUP,
  ).ids,
  ['new'],
);
let counter = 0;
const cards = ['a', 'b', 'c', 'd', 'new'].map((id, i) => ({
  id,
  r: i + 1,
  s: 0,
}));
const arranged = stableArrangement(
  [
    ['new', 'a', 'b'],
    ['c', 'd'],
  ],
  cards,
  order,
  () => GROUP + 'new' + counter++,
);
assert.ok(
  splitGroups(arranged).every(
    (g) => g.id !== DISCARD_GROUP || g.ids.length <= 1,
  ),
);
const natural = [
  ...Array.from({ length: 4 }, (_, s) => ({ id: 'king' + s, r: 13, s })),
  ...Array.from({ length: 9 }, (_, i) => ({
    id: 'set' + i,
    r: 2 + Math.floor(i / 3) * 3,
    s: i % 3,
  })),
];
const spare = { id: 'spare', r: 0, s: 0 };
const hand = [...natural, spare],
  groups = [
    [natural[2].id, natural[0].id, natural[3].id, natural[1].id],
    natural.slice(4, 7).map((c) => c.id),
    natural.slice(7, 10).map((c) => c.id),
    natural.slice(10).map((c) => c.id),
    ['spare'],
  ];
const g = {
  expert: true,
  status: 'playing',
  turn: 0,
  phase: 'discard',
  wild: { id: 'w', r: 9, s: 0 },
  picked: null,
  pile: [],
  round: 1,
  history: [],
  players: [
    { name: 'A', hand: [...hand], score: 0, draws: 1 },
    {
      name: 'B',
      hand: Array.from({ length: 13 }, (_, i) => ({
        id: 'loser' + i,
        r: 2,
        s: 0,
      })),
      score: 0,
      draws: 0,
    },
  ],
};
act(g, 0, 'declare');
assert.equal(g.history[0].bonus, 'sets');
recordDeclaredGroups(g, 0, hand, groups);
assert.deepEqual(
  g.history[0].declaredGroups.groups,
  groups.slice(0, -1),
  'preserve actual group/card order and remove only winning discard',
);
const saved = JSON.stringify(g.history[0].declaredGroups);
recordDeclaredGroups(g, 0, hand, [hand.map((c) => c.id), ['spare']]);
assert.equal(
  JSON.stringify(g.history[0].declaredGroups),
  saved,
  'reject duplicated/fabricated snapshot cards',
);
console.log(
  'PASS: expert initial groups, automatic draw/discard targets, single-card capacity, group ordering, Arrange capacity, and validated expert declaration snapshots.',
);
