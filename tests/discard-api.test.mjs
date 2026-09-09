import assert from 'node:assert/strict';
const base = process.env.GAME_URL || 'http://localhost:3000';
const api = async (b) => {
  const r = await fetch(base + '/api/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  });
  return { status: r.status, ...(await r.json()) };
};
const a = await api({ action: 'create', name: 'Pile tester A' });
const b = await api({
  action: 'join',
  code: a.game.code,
  name: 'Pile tester B',
});
const seatA = { code: a.game.code, token: a.token },
  seatB = { code: a.game.code, token: b.token };
const initial = b.game.pile[0];
assert.equal(b.game.underDiscard, null);
let g = (await api({ ...seatA, action: 'draw' })).game;
const card = g.players[0].hand.find((c) => c.r !== 0 && c.r !== g.wild.r);
g = (await api({ ...seatA, action: 'discard', cardId: card.id })).game;
assert.equal(g.pile[0].id, card.id);
assert.equal(g.underDiscard.id, initial.id);
g = (await api({ ...seatB, action: 'open' })).game;
assert.equal(g.pile[0].id, initial.id);
assert.equal(g.underDiscard, null);
assert.ok(g.players[1].hand.some((c) => c.id === card.id));
let testedEmpty = false;
for (let i = 0; i < 5 && !testedEmpty; i++) {
  const start = await api({ action: 'practice', name: 'Empty pile test' });
  const top = start.game.pile[0];
  if (top.r === 0 || top.r === start.game.wild.r) continue;
  const draw = await api({
    code: start.game.code,
    token: start.token,
    action: 'open',
  });
  assert.equal(draw.status, 200);
  assert.deepEqual(draw.game.pile, []);
  assert.equal(draw.game.underDiscard, null);
  testedEmpty = true;
}
assert.ok(testedEmpty);
console.log(
  'PASS: public underneath card, open draw reveals previous top, and taking the only discard returns an empty pile.',
);
