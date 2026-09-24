import assert from 'node:assert/strict';
const api = async (body) => {
  const r = await fetch('http://localhost:3000/api/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  assert.equal(r.status, 200, d.error);
  return d;
};
for (const expert of [false, true]) {
  const a = await api({ action: 'create', expert, name: 'A' }),
    b = await api({ action: 'join', code: a.game.code, name: 'B' });
  const seats = [
    { code: a.game.code, token: a.token },
    { code: a.game.code, token: b.token },
  ];
  const ids = b.game.players[1].hand.map((c) => c.id).reverse();
  const otherLayout = {
    groups: [ids.slice(0, 3), ids.slice(3, 9), ids.slice(9)],
  };
  await api({
    ...seats[1],
    action: 'poll',
    round: b.game.round,
    match: b.game.match,
    layout: otherLayout,
  });
  let { game } = await api({ ...seats[0], action: 'draw' });
  assert.equal(
    game.players[1].layout,
    undefined,
    'opponent groups remain private in play',
  );
  const hand = game.players[0].hand.map((c) => c.id).reverse();
  const layout = {
    groups: [hand.slice(0, 4), hand.slice(4, 8), hand.slice(8, 13)],
    discardId: hand[13],
  };
  ({ game } = await api({
    ...seats[0],
    action: 'declare',
    round: game.round,
    match: game.match,
    cardId: hand[13],
    layout,
  }));
  assert.equal(game.status, 'ended');
  const actual = game.history.at(-1).actualLayouts;
  assert.deepEqual(actual[1].groups, otherLayout.groups);
  assert.deepEqual(actual[0].groups, layout.groups);
  const remote = (await api({ ...seats[1], action: 'poll' })).game;
  assert.deepEqual(remote.history.at(-1).actualLayouts, actual);
}
console.log(
  'PASS: both players actual groups persist in both modes, stay private until round end, and appear identically to both viewers.',
);
