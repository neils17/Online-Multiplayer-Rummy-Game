import assert from 'node:assert/strict';
const base = process.env.GAME_URL || 'http://localhost:3000';
const api = async (body) => {
  const r = await fetch(base + '/api/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, ...(await r.json()) };
};
for (const maxScore of [100, 152, 101.5])
  assert.equal(
    (await api({ action: 'create', name: 'Validation', maxScore })).status,
    400,
  );
const a = await api({
  action: 'create',
  name: 'Expert host',
  expert: true,
  maxScore: 151,
});
assert.equal(a.status, 200);
const seat = { code: a.game.code, token: a.token };
const b = await api({
  action: 'join',
  name: 'Guest',
  code: a.game.code,
  expert: false,
  maxScore: 101,
});
assert.equal(b.status, 200);
assert.equal(b.game.expert, true);
assert.equal(b.game.maxScore, 151);
let g = b.game;
for (let i = 0; i < 8; i++) {
  const drop = await api({ ...seat, action: 'drop' });
  assert.equal(drop.status, 200);
  g = drop.game;
  assert.equal(g.players[0].score, (i + 1) * 20);
  assert.equal(g.matchOver, i === 7);
  if (i < 7) assert.equal((await api({ ...seat, action: 'next' })).status, 200);
}
assert.equal(g.winner, 1);
assert.equal(g.history.length, 8);
assert.equal((await api({ ...seat, action: 'next' })).status, 400);
const restart = await api({ ...seat, action: 'restart' });
assert.equal(restart.status, 200);
assert.equal(restart.game.match, 2);
assert.equal(restart.game.expert, true);
assert.equal(restart.game.maxScore, 151);
assert.deepEqual(
  restart.game.players.map((p) => p.score),
  [0, 0],
);
assert.equal(restart.game.history.length, 0);
assert.equal(restart.game.round, 1);
assert.equal(restart.game.players[0].count, 13);
const bot = await api({
  action: 'practice',
  name: 'Solo',
  expert: true,
  maxScore: 117,
});
assert.equal(bot.status, 200);
assert.equal(bot.game.expert, true);
assert.equal(bot.game.maxScore, 117);
assert.equal(bot.game.players[1].name, 'Rummy Bot');
console.log(
  'PASS: settings validation, shared host options, 151-point match completion, final winner, blocked extra round, clean rematch, and expert bot mode at 117 points.',
);
