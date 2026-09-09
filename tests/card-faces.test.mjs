import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardFace, cardAsset } from '../components/game/card-face.tsx';
const paths = new Set();
for (let s = 0; s < 4; s++)
  for (let r = 1; r <= 13; r++) {
    const card = { id: `${s}-${r}`, r, s };
    const path = cardAsset(card);
    paths.add(path);
    const html = renderToStaticMarkup(
      React.createElement(CardFace, { c: card }),
    );
    assert.ok(html.includes(path));
    assert.ok(html.includes('class="deck-face"'));
    assert.ok(!html.includes('court-half') && !html.includes('<svg'));
    const asset = await readFile(`public${path}`, 'utf8');
    assert.ok(asset.includes('viewBox="-120 -168 240 336"'));
    const rank = [
      '',
      'A',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      'J',
      'Q',
      'K',
    ][r];
    assert.ok(
      asset.includes(
        `face="${r === 10 ? 'T' : rank}${['S', 'H', 'C', 'D'][s]}"`,
      ),
    );
    assert.ok(
      !/<script|<foreignObject|https?:\/\/[^" ]+\.(png|js)/i.test(asset),
    );
  }
assert.equal(paths.size, 52);
const joker = renderToStaticMarkup(
  React.createElement(CardFace, { c: { id: 'j', r: 0, s: 0 }, w: 8 }),
);
assert.ok(joker.includes('/cards/J-1.svg'));
assert.ok(joker.includes('wild-marker'));
assert.ok(
  (await readFile('public/cards/LICENSE.txt', 'utf8')).includes(
    'CC0 1.0 Universal',
  ),
);
console.log(
  'PASS: all 52 exact GitHub SVG faces, suit/rank mapping, native 5:7 aspect ratio, joker and CC0 license.',
);
