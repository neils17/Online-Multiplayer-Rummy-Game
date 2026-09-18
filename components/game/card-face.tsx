import { isWild, rank, suit, type Card } from '@/lib/game';
export function cardAsset(c: Card) {
  return c.r && !c.printed
    ? `/cards/${['S', 'H', 'C', 'D'][c.s]}-${rank(c.r)}.svg`
    : '/cards/jester-white.png';
}
export function CardFace({ c, w }: { c: Card; w?: number }) {
  return (
    <>
      <img
        className={`deck-face ${c.r === 0 || c.printed ? 'joker-art' : ''}`}
        src={cardAsset(c)}
        alt=""
        draggable={false}
        decoding="sync"
        aria-hidden="true"
      />
      {c.naturalOnly && (
        <span
          className={`fixed-marker ${c.printed ? 'printed-value' : ''}`}
          title="Dropped joker: face value only"
          aria-label={`Dropped joker. New value: ${rank(c.r)} ${suit[c.s]}`}
        >
          {c.printed ? (
            <>
              <span>Dropped joker</span>
              <strong>
                {rank(c.r)}
                {suit[c.s]}
              </strong>
            </>
          ) : (
            'Was Joker'
          )}
        </span>
      )}
      {w !== undefined && isWild(c, w) && (
        <span className="wild-marker" aria-label="Wild card">
          W
        </span>
      )}
    </>
  );
}
