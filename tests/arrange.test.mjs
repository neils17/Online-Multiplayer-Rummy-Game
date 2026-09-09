import assert from 'node:assert/strict';
import {
  arrangeHand,
  describeGroup,
  moveToGroup,
  splitGroups,
  GROUP,
} from '../lib/arrange.ts';
import { analyze } from '../lib/game.ts';
let id = 0;
const cards = (rs, s) => rs.map((r) => ({ id: String(id++), r, s }));
const trap = [
  ...cards([3, 4, 5, 6], 0),
  ...cards([6, 7, 8], 1),
  ...cards([6], 2),
  ...cards([6], 3),
  ...cards([12], 0),
  ...cards([12], 1),
  ...cards([12], 2),
  ...cards([12], 3),
];
const groups = arrangeHand(trap, 10);
assert.equal(groups.flat().length, 13);
assert.equal(new Set(groups.flat().map((c) => c.id)).size, 13);
assert.ok(groups.every((g) => describeGroup(g, 10).valid));
assert.equal(groups.filter((g) => describeGroup(g, 10).sequence).length, 2);
assert.ok(analyze(trap, 10).valid);
const fourteen = [...trap, ...cards([2], 3)];
const arranged = arrangeHand(fourteen, 10);
assert.equal(arranged.flat().length, 14);
assert.equal(
  arranged.filter((g) => describeGroup(g, 10).valid).flat().length,
  13,
);
assert.equal(arranged.at(-1)[0].id, fourteen.at(-1).id);
const restricted = arrangeHand(fourteen, 10, fourteen.at(-1).id);
assert.notEqual(restricted.at(-1)[0].id, fourteen.at(-1).id);
const high = arrangeHand(cards([1, 13, 12], 1), 8);
assert.deepEqual(
  high[0].map((c) => c.r),
  [12, 13, 1],
);
const gap = arrangeHand([...cards([13, 1], 0), ...cards([0], 0)], 8);
assert.deepEqual(
  gap[0].map((c) => c.r),
  [0, 13, 1],
);
const set = cards([7], 0).concat(cards([7], 1), cards([7], 2));
assert.equal(describeGroup(set, 10).label, 'Set');
assert.equal(describeGroup(set.slice(0, 2), 10).label, 'Set pair');
assert.equal(describeGroup([...set, ...cards([9], 3)], 10).valid, false);
const order = [GROUP + 'a', 'a', 'b', GROUP + 'b', 'c'];
assert.deepEqual(moveToGroup(order, 'b', GROUP + 'b', 'c'), [
  GROUP + 'a',
  'a',
  GROUP + 'b',
  'b',
  'c',
]);
assert.deepEqual(moveToGroup(order, 'c', GROUP + 'a'), [
  GROUP + 'a',
  'a',
  'b',
  'c',
  GROUP + 'b',
]);
assert.equal(splitGroups(moveToGroup(order, 'b', GROUP + 'b')).length, 2);
const duplicate = cards([5, 5, 5], 0);
assert.equal(describeGroup(duplicate, 9).valid, false);
assert.equal(arrangeHand([], 9).length, 0);
console.log(
  'PASS: exact solution to a greedy trap, 13/14-card hands, legal spare, all cards conserved, high aces, joker ordering, live group labels and cross-group insertion.',
);
const longHigh = arrangeHand([...cards([11, 1], 0), ...cards([0, 0, 8], 2)], 8);
assert.ok(longHigh.flat().every(Boolean));
assert.equal(new Set(longHigh.flat().map((c) => c.id)).size, 5);
let seed = 79;
const rng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const deck = [];
for (let k = 0; k < 2; k++) {
  for (let s = 0; s < 4; s++)
    for (let r = 1; r <= 13; r++) deck.push({ id: `${k}-${s}-${r}`, r, s });
  deck.push({ id: `j${k}`, r: 0, s: 0 });
}
const started = performance.now();
for (let sample = 0; sample < 100; sample++) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const hand = shuffled.slice(0, 13 + (sample % 2));
  const result = arrangeHand(hand, 1 + (sample % 13));
  assert.ok(result.flat().every(Boolean));
  assert.deepEqual(
    result
      .flat()
      .map((c) => c.id)
      .sort(),
    hand.map((c) => c.id).sort(),
  );
}
console.log(
  `PASS: 100 seeded hands preserve every card; ${Math.round(performance.now() - started)}ms total.`,
);
