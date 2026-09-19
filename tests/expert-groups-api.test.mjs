import assert from 'node:assert/strict';
const api = async (body) => {
  const response = await fetch('http://localhost:3000/api/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, 200, data.error);
  return data;
};
const first = await api({ action: 'create', expert: true, name: 'Expert A' });
const second = await api({
  action: 'join',
  code: first.game.code,
  name: 'Expert B',
});
const seat = { code: first.game.code, token: first.token };
let { game } = await api({ ...seat, action: 'draw' });
const ids = game.players[0].hand.map((c) => c.id).reverse();
const groups = [
  ids.slice(0, 4),
  ids.slice(4, 8),
  ids.slice(8, 13),
  ids.slice(13),
];
({ game } = await api({ ...seat, action: 'declare', groups }));
assert.equal(game.status, 'ended');
const remaining = new Set(game.players[0].hand.map((c) => c.id));
const expected = groups
  .map((g) => g.filter((id) => remaining.has(id)))
  .filter((g) => g.length);
assert.deepEqual(game.history.at(-1).declaredGroups, {
  player: 0,
  groups: expected,
});
const other = (
  await api({ code: first.game.code, token: second.token, action: 'poll' })
).game;
assert.deepEqual(
  other.history.at(-1).declaredGroups,
  game.history.at(-1).declaredGroups,
);
console.log(
  'PASS: expert actual groups survive server declaration and are identical for both scoreboard viewers.',
);
