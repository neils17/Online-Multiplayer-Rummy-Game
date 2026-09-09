import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardFace } from '../components/game/card-face.tsx';
for (let s = 0; s < 4; s++)
  for (let r = 1; r <= 13; r++) {
    const html = renderToStaticMarkup(
      React.createElement(CardFace, { c: { id: `${s}-${r}`, r, s } }),
    );
    assert.equal(
      (html.match(/<path /g) || []).length,
      r <= 10 ? r + 2 : 2,
      `${r} suit ${s}: correct pips and two corner suits`,
    );
    assert.ok(html.includes('classic-index-bottom'));
    assert.ok(!html.includes('undefined') && !html.includes('NaN'));
    if (r >= 11)
      assert.equal((html.match(/class="court-half/g) || []).length, 2);
  }
const joker = renderToStaticMarkup(
  React.createElement(CardFace, { c: { id: 'joker', r: 0, s: 0 }, w: 4 }),
);
assert.ok(joker.includes('/casino-joker.png'));
assert.ok(joker.includes('wild-marker'));
const hearts = renderToStaticMarkup(
  React.createElement(CardFace, { c: { id: 'h', r: 1, s: 1 } }),
);
assert.ok(hearts.includes('M0 14C-3 9'));
const diamonds = renderToStaticMarkup(
  React.createElement(CardFace, { c: { id: 'd', r: 1, s: 3 } }),
);
assert.ok(diamonds.includes('M0-12L10 1'));
const atlas = await readFile('public/casino-courts.png');
assert.equal(atlas.readUInt32BE(16), 1254);
assert.equal(atlas.readUInt32BE(20), 1254);
await readFile('public/casino-joker.png');
await readFile('public/casino-back.svg');
console.log(
  'PASS: all 52 ranks and suits, exact pip counts, mirrored court panels, joker and required assets.',
);
