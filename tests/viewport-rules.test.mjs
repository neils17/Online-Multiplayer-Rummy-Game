import assert from 'node:assert/strict';
import { fitViewport, fitHand } from '../lib/layout.ts';
import { act, deal, isWild, droppedCard } from '../lib/game.ts';
for (const [width, height] of [
  [320, 568],
  [390, 844],
  [430, 932],
  [667, 375],
  [844, 390],
  [932, 430],
  [1024, 768],
  [1280, 720],
  [1920, 1080],
  [2560, 1440],
]) {
  const stage = fitViewport(width, height);
  assert.ok(Math.abs(stage.width * stage.scale - width) < 0.01);
  assert.ok(Math.abs(stage.height * stage.scale - height) < 0.01);
  assert.ok(stage.height >= (stage.landscape ? 720 : 900));
  const tableWidth = stage.width - (stage.landscape ? 56 : 40);
  const tableHeight = stage.height - 100;
  const remaining = tableHeight - 20 - 16 - (stage.landscape ? 108 : 158);
  const handHeight =
    remaining * (stage.landscape ? 1.2 / 2.2 : 1.7 / 2.7) - 116;
  for (const counts of [
    [7, 7],
    [3, 3, 4, 4],
    [1, 13],
    [14],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 7, 7],
  ]) {
    const fit = fitHand(counts, tableWidth - 16, handHeight);
    assert.ok(
      fit.rows * fit.rowHeight + (fit.rows - 1) * 8 <= handHeight,
      `${width}x${height} groups ${counts} overflow height`,
    );
    for (const n of counts)
      assert.ok(
        Math.max(64, fit.card + Math.max(0, n - 1) * fit.step + 14) <=
          tableWidth - 16,
      );
  }
  const expert = fitHand([14], tableWidth - 16, handHeight, true);
  assert.equal(expert.rows, 1);
  assert.ok(expert.card + 13 * expert.step <= tableWidth - 16);
}
const make = () => {
  const g = {
    players: [
      { name: 'A', hand: [], score: 0, draws: 0, token: 'a' },
      { name: 'B', hand: [], score: 0, draws: 0, token: 'b' },
    ],
    history: [],
    round: 0,
  };
  deal(g);
  return g;
};
for (const card of [
  { id: 'printed', r: 0, s: 0 },
  { id: 'wild-rank', r: 7, s: 2 },
]) {
  const g = make();
  g.wild = { id: 'indicator', r: 7, s: 1 };
  g.pile = [card];
  act(g, 0, 'open');
  assert.deepEqual(g.players[0].hand.at(-1), card);
  assert.ok(isWild(g.players[0].hand.at(-1), 7), 'opening joker stays wild');
  g.picked = null;
  act(g, 0, 'discard', card.id);
  assert.deepEqual(g.pile.at(-1), droppedCard(card, g.wild));
  act(g, 1, 'open');
  assert.equal(
    isWild(g.players[1].hand.at(-1), 7),
    false,
    'a hand-discarded joker loses wildness',
  );
}
// Deals never assign the hand-discard marker, regardless of the opening rank.
for (let n = 0; n < 100; n++)
  assert.equal(make().pile[0].naturalOnly, undefined);
console.log(
  'PASS: 10 viewport sizes, extreme group counts, expert row fit, initial wild/printed jokers and permanently dropped jokers.',
);
