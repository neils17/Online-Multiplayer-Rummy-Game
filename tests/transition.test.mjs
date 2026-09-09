import assert from 'node:assert/strict';
import { opponentTransition } from '../lib/transition.ts';
const card = { id: 'public', r: 7, s: 1 };
const state = {
  code: 'TEST',
  round: 1,
  me: 0,
  status: 'playing',
  pile: [card],
  players: [
    { count: 13, hand: [], name: 'You' },
    { count: 13, hand: [], name: 'Bot' },
  ],
};
const clone = () => structuredClone(state);
assert.equal(opponentTransition(state, clone()), null);
const closed = clone();
closed.players[1].count = 14;
assert.deepEqual(opponentTransition(state, closed), {
  kind: 'draw',
  open: false,
  card: null,
  label: 'Bot is drawing a card',
});
const open = clone();
open.players[1].count = 14;
open.pile = [];
assert.equal(opponentTransition(state, open).card.id, 'public');
assert.equal(opponentTransition(state, open).open, true);
const discarded = clone();
discarded.pile = [{ id: 'discarded', r: 9, s: 2 }];
assert.equal(opponentTransition(closed, discarded).kind, 'discard');
assert.equal(opponentTransition(closed, discarded).card.id, 'discarded');
const fresh = clone();
fresh.round = 2;
assert.equal(opponentTransition(closed, fresh), null);
const otherRoom = clone();
otherRoom.code = 'NEW';
assert.equal(opponentTransition(closed, otherRoom), null);
console.log(
  'PASS: unchanged snapshots, concealed deck draws, visible open draws, public discards and new-round transitions.',
);
const { visibleDiscard } = await import('../lib/transition.ts');
const top = { id: 'top', r: 7, s: 0 },
  under = { id: 'under', r: 9, s: 1 };
assert.deepEqual(visibleDiscard(top, under, null), top);
assert.deepEqual(visibleDiscard(top, under, 'top'), under);
assert.equal(visibleDiscard(top, null, 'top'), null);
assert.deepEqual(visibleDiscard(under, null, 'top'), under);
assert.deepEqual(visibleDiscard(top, under, null), top);
assert.equal(visibleDiscard(undefined, null, null), null);
console.log(
  'PASS: lifting reveals underneath immediately, single-card pile becomes empty, server confirmation does not skip a second card, cancellation restores top.',
);
