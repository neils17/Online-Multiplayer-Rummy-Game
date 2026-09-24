import assert from 'node:assert/strict';
import { winningDiscard } from '../lib/game.ts';
const base = process.env.GAME_URL || 'http://localhost:3000';
const api = async (body) => {
  const response = await fetch(base + '/api/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, ...(await response.json()) };
};
for (const decks of [0, 3, '1'])
  assert.equal((await api({ action: 'create', decks })).status, 400);
const a = await api({
  action: 'create',
  name: 'Host',
  expert: true,
  maxScore: 101,
  decks: 1,
});
const b = await api({
  action: 'join',
  name: 'Guest',
  code: a.game.code,
  decks: 2,
});
assert.equal(b.game.decks, 1);
assert.equal(b.game.remaining, 25);
assert.equal(b.game.expert, true);
const seats = [
  { code: a.game.code, token: a.token },
  { code: a.game.code, token: b.token },
];
let g = b.game;
for (let round = 1; round <= 5; round++) {
  g = (await api({ ...seats[0], action: 'drop' })).game;
  assert.equal(g.players[0].score, round * 20);
  const readiness = seats.map((seat) => ({
    ...seat,
    action: 'next',
    round: g.round,
    match: g.match,
  }));
  if (round === 1) {
    const first = await api(readiness[0]);
    assert.equal(first.game.status, 'ended');
    assert.deepEqual(first.game.ready, [true, false]);
    g = (await api(readiness[1])).game;
  } else {
    const responses = await Promise.all(readiness.map(api));
    assert.ok(responses.every((r) => r.status === 200));
    g = (await api({ ...seats[0], action: 'poll' })).game;
  }
  assert.equal(g.round, round + 1);
  assert.equal(g.status, 'playing');
  assert.equal(
    (await api(readiness[0])).game.round,
    round + 1,
    'stale ready press cannot advance another round',
  );
}
const blocked = await api({ ...seats[0], action: 'drop' });
assert.equal(blocked.status, 400);
assert.match(blocked.error, /can’t drop/);
// Immediate open-pile rediscard is authoritative and retains card identity.
const player = g.turn,
  top = g.pile[0];
let state = (await api({ ...seats[player], action: 'open' })).game;
state = (await api({ ...seats[player], action: 'discard', cardId: top.id }))
  .game;
assert.equal(state.pile[0].id, top.id);
// Finish through declarations to exercise the rematch barrier as well.
while (!state.matchOver) {
  const who = state.turn;
  state = (await api({ ...seats[who], action: 'draw' })).game;
  if (winningDiscard(state.players[who].hand, state.wild.r, null)) {
    state = (
      await api({
        ...seats[who],
        action: 'discard',
        cardId: state.players[who].hand.at(-1).id,
      })
    ).game;
    continue;
  }
  const selected = state.players[who].hand.at(-1).id;
  state = (
    await api({
      ...seats[who],
      action: 'declare',
      cardId: selected,
      round: state.round,
      match: state.match,
      layout: {
        groups: [
          state.players[who].hand
            .filter((c) => c.id !== selected)
            .map((c) => c.id),
        ],
        discardId: selected,
      },
    })
  ).game;
  if (!state.matchOver) {
    await api({ ...seats[0], action: 'next' });
    state = (await api({ ...seats[1], action: 'next' })).game;
  }
}
const readyAgain = await api({ ...seats[0], action: 'restart' });
assert.equal(readyAgain.game.status, 'ended');
const rematch = await api({ ...seats[1], action: 'restart' });
assert.equal(rematch.game.match, 2);
assert.equal(rematch.game.round, 1);
assert.equal(rematch.game.decks, 1);
assert.deepEqual(
  rematch.game.players.map((p) => p.score),
  [0, 0],
);
const practice = await api({ action: 'practice', decks: 2, expert: true });
const solo = { code: practice.game.code, token: practice.token };
await api({ ...solo, action: 'drop' });
assert.equal((await api({ ...solo, action: 'next' })).game.round, 2);
console.log(
  'PASS: shared deck options, immediate rediscard, drop rejection, simultaneous readiness, stale requests, two-player rematches and bot auto-readiness.',
);
