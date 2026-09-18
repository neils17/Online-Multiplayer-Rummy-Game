import assert from 'node:assert/strict';
import { deal, act, gameOptions, assertDeckIntegrity } from '../lib/game.ts';
for (const decks of [1, 2])
  for (let round = 0; round < 10; round++) {
    const g = {
      ...gameOptions(false, 101, decks),
      players: [
        { name: 'A', token: 'a', hand: [], score: 0, draws: 0 },
        { name: 'B', token: 'b', hand: [], score: 0, draws: 0 },
      ],
      history: [],
      round: 0,
    };
    deal(g);
    assertDeckIntegrity(g);
    const stock = new Set(g.deck.map((c) => c.id));
    while (g.deck.length) {
      const seat = g.turn;
      act(g, seat, 'draw');
      const c = g.players[seat].hand.at(-1);
      assert.ok(stock.delete(c.id));
      assertDeckIntegrity(g);
      act(g, seat, 'discard', c.id);
      assertDeckIntegrity(g);
    }
    assert.equal(stock.size, 0);
    act(g, g.turn, 'draw');
    assert.equal(g.status, 'ended');
    assertDeckIntegrity(g);
    const duplicate = structuredClone(g);
    duplicate.deck.push(duplicate.pile[0]);
    assert.throws(() => assertDeckIntegrity(duplicate));
    const missing = structuredClone(g);
    missing.pile.pop();
    assert.throws(() => assertDeckIntegrity(missing));
  }
console.log(
  'PASS: 20 complete physical decks, unique draws, conservation after every action, duplicate/missing-card rejection.',
);
