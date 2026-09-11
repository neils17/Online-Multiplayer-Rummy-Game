import assert from 'node:assert/strict';
import {
  act,
  deal,
  analyze,
  meld,
  naturalCompletion,
  winningDiscard,
  isWild,
  value,
  droppedCard,
  gameOptions,
} from '../lib/game.ts';
let serial = 0;
const card = (r, s = 0, extra = {}) => ({ id: `t${serial++}`, r, s, ...extra });
const run = (rs, s) => rs.map((r) => card(r, s));
const set = (r, suits) => suits.map((s) => card(r, s));
const sets = [
  ...set(3, [0, 1, 2]),
  ...set(5, [0, 1, 2]),
  ...set(8, [0, 1, 2]),
  ...set(11, [0, 1, 2, 3]),
];
const sequences = [
  ...run([1, 2, 3], 0),
  ...run([4, 5, 6], 1),
  ...run([7, 8, 9], 2),
  ...run([10, 11, 12, 13], 3),
];
const wild = card(5, 1);
assert.equal(naturalCompletion(sets).kind, 'sets');
assert.equal(naturalCompletion(sequences).kind, 'sequences');
assert.equal(analyze(sets, 5).valid, true);
assert.equal(analyze(sets, 5).penalty, 0);
assert.ok(
  meld(set(5, [0, 1, 2]), 5).includes(0),
  'wild rank used as its printed value makes a natural set',
);
const printed = card(0);
const withSubstitution = [...sets.slice(0, -1), printed];
assert.equal(
  naturalCompletion(withSubstitution),
  null,
  'a substituting printed joker earns no double bonus',
);
assert.equal(
  naturalCompletion([...sequences.slice(0, -1), card(5, 0)]),
  null,
  'a wild-rank substitute earns no double bonus',
);
const mixed = [
  ...run([1, 2, 3], 0),
  ...run([4, 5, 6], 1),
  ...set(8, [0, 1, 2]),
  ...set(11, [0, 1, 2, 3]),
];
assert.equal(
  naturalCompletion(mixed),
  null,
  'mixed natural melds are normal wins',
);
assert.equal(analyze(mixed, 12).valid, true);
const locked = droppedCard(printed, wild);
assert.equal(locked.r, 5);
assert.equal(locked.s, 1);
assert.equal(locked.id, printed.id);
assert.ok(locked.naturalOnly);
assert.ok(locked.printed);
assert.equal(isWild(locked, 5), false);
assert.equal(value(locked, 5), 5);
assert.ok(meld([card(4, 1), locked, card(6, 1)], 5).includes(2));
assert.deepEqual(
  meld([card(8, 0), card(10, 0), locked], 5),
  [],
  'fixed printed joker cannot fill any arbitrary gap',
);
const wildFace = card(5, 3),
  fixed = droppedCard(wildFace, wild);
assert.equal(fixed.r, 5);
assert.equal(fixed.s, 3);
assert.equal(isWild(fixed, 5), false);
const naturalSpare = card(2, 3);
assert.equal(
  winningDiscard([...sets, naturalSpare], 5, null).id,
  naturalSpare.id,
);
assert.notEqual(
  winningDiscard([...sets, naturalSpare], 5, naturalSpare.id)?.id,
  naturalSpare.id,
);
const game = () => {
  const g = {
    players: [
      { name: 'A', hand: [], score: 0, draws: 0 },
      { name: 'B', hand: [], score: 0, draws: 0 },
    ],
    history: [],
    round: 0,
    expert: true,
    maxScore: 101,
    match: 1,
  };
  deal(g);
  return g;
};
const loser = Array.from({ length: 13 }, (_, i) => card(13, 0));
for (const hand of [sets, sequences, mixed]) {
  const g = game();
  g.wild = wild;
  g.players[0].hand = [...hand, naturalSpare];
  g.players[1].hand = loser;
  g.phase = 'discard';
  act(g, 0, 'declare');
  const bonus = hand !== mixed;
  assert.equal(g.status, 'ended');
  assert.equal(g.players[1].score, bonus ? 160 : 80);
  assert.equal(g.history[0].multiplier, bonus ? 2 : 1);
  assert.equal(g.matchOver, bonus);
  if (bonus) {
    assert.equal(g.winner, 0);
    assert.throws(() => act(g, 0, 'next'));
    act(g, 0, 'restart');
    assert.deepEqual(
      g.players.map((p) => p.score),
      [0, 0],
    );
    assert.equal(g.round, 1);
    assert.equal(g.match, 2);
    assert.equal(g.history.length, 0);
    assert.equal(g.expert, true);
    assert.equal(g.maxScore, 101);
    assert.equal(g.matchOver, false);
  }
}
const g = game();
g.wild = wild;
g.players[0].hand = [...sets, printed];
g.phase = 'discard';
act(g, 0, 'discard', printed.id);
assert.ok(g.pile.at(-1).naturalOnly);
act(g, 1, 'open');
const picked = g.players[1].hand.at(-1);
assert.equal(picked.r, wild.r);
assert.equal(picked.s, wild.s);
assert.equal(isWild(picked, wild.r), false);
assert.throws(() => act(g, 1, 'discard', picked.id));
const other = g.players[1].hand.find((c) => c.id !== picked.id);
act(g, 1, 'discard', other.id);
const round = game();
round.players[0].score = 81;
act(round, 0, 'drop');
assert.equal(round.matchOver, true);
assert.equal(round.players[0].score, 101);
assert.equal(round.winner, 1);
for (const maxScore of [101, 102, 126, 150, 151])
  assert.equal(gameOptions(true, maxScore).maxScore, maxScore);
for (const maxScore of [100, 152, 101.5, NaN])
  assert.throws(() => gameOptions(false, maxScore));
assert.deepEqual(gameOptions(undefined, undefined), {
  expert: false,
  maxScore: 101,
});
console.log(
  'PASS: natural sets/sequences and wild-rank faces, no false double bonus, fixed printed/wild discards, pickup restrictions, 160-point doubles, exact match limits, rematch resets, settings validation.',
);
