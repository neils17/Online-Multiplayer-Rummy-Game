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
const created = await api({ action: 'practice', name: 'Declaration test' });
assert.equal(created.status, 200);
const seat = { code: created.game.code, token: created.token };
assert.equal((await api({ ...seat, action: 'declare' })).status, 400);
const { game } = await api({ ...seat, action: 'draw' });
const spare = winningDiscard(game.players[0].hand, game.wild.r, game.picked);
assert.equal((await api({ ...seat, action: 'declare' })).status, 400);
const selected = spare?.id || game.players[0].hand.at(-1).id;
const result = await api({
  ...seat,
  action: 'declare',
  cardId: selected,
  round: game.round,
  match: game.match,
  layout: {
    groups: [
      game.players[0].hand.filter((c) => c.id !== selected).map((c) => c.id),
    ],
    discardId: selected,
  },
});
assert.equal(result.status, 200);
assert.equal(result.game.status, 'ended');
assert.equal(result.game.players[0].score, spare ? 0 : 80);
assert.equal(result.game.history.length, 1);
if (spare) assert.equal(result.game.pile[0].id, spare.id);
const again = await api({ ...seat, action: 'poll' });
assert.equal(again.game.players[0].score, result.game.players[0].score);
console.log(
  'PASS: API requires the slot and validates the remaining hand after draw and persists the result and score.',
);
