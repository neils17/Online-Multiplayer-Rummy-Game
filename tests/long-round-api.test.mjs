import assert from 'node:assert/strict';
const base = process.env.GAME_URL || 'http://localhost:3000';
const api = async (body) => {
  const response = await fetch(base + '/api/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, 200, result.error);
  return result;
};
for (const decks of [1, 2]) {
  const first = await api({ action: 'create', name: 'Long round A', decks });
  const second = await api({
    action: 'join',
    name: 'Long round B',
    code: first.game.code,
  });
  const seats = [
    { code: first.game.code, token: first.token },
    { code: first.game.code, token: second.token },
  ];
  let state = second.game;
  const stockCount = state.remaining,
    seen = new Set();
  assert.equal(stockCount, 53 * decks - 28);
  for (let turn = 0; turn < stockCount; turn++) {
    const me = state.turn,
      seat = seats[me],
      previousTop = state.pile[0];
    const before = (await api({ ...seat, action: 'poll' })).game;
    const drawn = (await api({ ...seat, action: 'draw' })).game;
    const card = drawn.players[me].hand.find(
      (c) => !before.players[me].hand.some((old) => old.id === c.id),
    );
    assert.ok(card);
    assert.equal(drawn.players[me].hand.length, 14);
    assert.deepEqual(drawn.players[1 - me].hand, []);
    assert.ok(!seen.has(card.id), 'a stock card cannot be drawn twice');
    seen.add(card.id);
    assert.equal(drawn.remaining, stockCount - turn - 1);
    state = (await api({ ...seat, action: 'discard', cardId: card.id })).game;
    assert.equal(state.players[me].hand.length, 13);
    assert.equal(state.pile[0].id, card.id);
    assert.equal(state.underDiscard.id, previousTop.id);
    assert.equal(state.turn, 1 - me);
    assert.equal(state.phase, 'draw');
    assert.equal(state.status, 'playing');
  }
  const ended = (await api({ ...seats[state.turn], action: 'draw' })).game;
  assert.equal(ended.status, 'ended');
  assert.equal(ended.remaining, 0);
  assert.deepEqual(
    ended.players.map((p) => p.score),
    [0, 0],
  );
  assert.equal(ended.pile[0].id, state.pile[0].id);
}
console.log(
  'PASS: one/two complete decks, unique physical draws, discard continuity, private hands, stock exhaustion without recycling or points.',
);
