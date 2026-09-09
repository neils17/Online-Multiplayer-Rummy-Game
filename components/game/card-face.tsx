import type { CSSProperties } from 'react';
import { isWild, rank, type Card } from '@/lib/game';

// Standard two-ended pip layouts. Each symbol remains vector sharp at any size.
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 70]],
  2: [
    [50, 24],
    [50, 116],
  ],
  3: [
    [50, 24],
    [50, 70],
    [50, 116],
  ],
  4: [
    [27, 24],
    [73, 24],
    [27, 116],
    [73, 116],
  ],
  5: [
    [27, 24],
    [73, 24],
    [50, 70],
    [27, 116],
    [73, 116],
  ],
  6: [
    [27, 24],
    [73, 24],
    [27, 70],
    [73, 70],
    [27, 116],
    [73, 116],
  ],
  7: [
    [27, 24],
    [73, 24],
    [50, 47],
    [27, 70],
    [73, 70],
    [27, 116],
    [73, 116],
  ],
  8: [
    [27, 24],
    [73, 24],
    [50, 47],
    [27, 70],
    [73, 70],
    [50, 93],
    [27, 116],
    [73, 116],
  ],
  9: [
    [27, 24],
    [73, 24],
    [27, 54],
    [73, 54],
    [50, 70],
    [27, 86],
    [73, 86],
    [27, 116],
    [73, 116],
  ],
  10: [
    [27, 24],
    [73, 24],
    [50, 40],
    [27, 54],
    [73, 54],
    [27, 86],
    [73, 86],
    [50, 100],
    [27, 116],
    [73, 116],
  ],
};
const SUITS = [
  'M0-12C-3-7-12-3-12 3C-12 10-4 12-1 6C-1 10-3 13-6 14H6C3 13 1 10 1 6C4 12 12 10 12 3C12-3 3-7 0-12Z',
  'M0 14C-3 9-13 2-13-5C-13-14-3-15 0-7C3-15 13-14 13-5C13 2 3 9 0 14Z',
  'M0-12C-8-12-9-3-4 0C-13-4-17 8-9 11C-5 13-2 10-1 7C-1 11-3 13-6 14H6C3 13 1 11 1 7C2 10 5 13 9 11C17 8 13-4 4 0C9-3 8-12 0-12Z',
  'M0-12L10 1 0 14-10 1Z',
];
function Suit({ s }: { s: number }) {
  return (
    <svg viewBox="-15 -15 30 31" aria-hidden="true">
      <path d={SUITS[s]} fill="currentColor" />
    </svg>
  );
}
export function CardFace({ c, w }: { c: Card; w?: number }) {
  const court = c.r >= 11;
  const wild = w !== undefined && isWild(c, w);
  // Explicit atlas bounds exclude separators; mirror the upper illustration so
  // every court is complete and identical when viewed from either end.
  const row = c.r - 11;
  const atlasY = [1, 452, 863][row] || 0;
  const atlasHeight = [223, 202, 192][row] || 1;
  const atlasX = [1, 942, 628, 315][c.s];
  return (
    <>
      <div
        className={`card-art ${court ? 'court-art' : ''} ${!c.r ? 'joker-art' : ''}`}
        aria-hidden="true"
      >
        {court ? (
          <div
            className="court-panel"
            style={
              {
                '--court-x': `${(atlasX / (1254 - 310)) * 100}%`,
                '--court-y': `${(atlasY / (1254 - atlasHeight)) * 100}%`,
                '--court-size-y': `${(1254 / atlasHeight) * 100}%`,
              } as CSSProperties
            }
          >
            <span className="court-half" />
            <span className="court-half court-half-bottom" />
          </div>
        ) : !c.r ? (
          <img
            className="joker-illustration"
            src="/casino-joker.png"
            alt=""
            draggable={false}
          />
        ) : (
          <svg className="number-face" viewBox="0 0 100 140">
            {PIPS[c.r].map(([x, y], i) => (
              <path
                key={i}
                d={SUITS[c.s]}
                fill="currentColor"
                transform={`translate(${x} ${y}) rotate(${y > 70 ? 180 : 0}) scale(${c.r === 1 ? 1.25 : 0.69})`}
              />
            ))}
          </svg>
        )}
      </div>
      {[false, true].map((bottom) => (
        <span
          key={String(bottom)}
          className={`classic-index ${bottom ? 'classic-index-bottom' : 'classic-index-top'} ${!c.r ? 'joker-index' : ''}`}
        >
          <span>{c.r ? rank(c.r) : 'JOKER'}</span>
          {c.r ? <Suit s={c.s} /> : <span className="joker-star">✦</span>}
        </span>
      ))}
      {wild && (
        <span className="wild-marker" aria-label="Wild card">
          W
        </span>
      )}
    </>
  );
}
