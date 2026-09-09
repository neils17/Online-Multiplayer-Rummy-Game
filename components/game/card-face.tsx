import { isWild, rank, type Card } from '@/lib/game';
export function cardAsset(c: Card) {
  return c.r
    ? `/cards/${['S', 'H', 'C', 'D'][c.s]}-${rank(c.r)}.svg`
    : '/cards/J-1.svg';
}
export function CardFace({ c, w }: { c: Card; w?: number }) {
  return (
    <>
      <img
        className="deck-face"
        src={cardAsset(c)}
        alt=""
        draggable={false}
        decoding="sync"
        aria-hidden="true"
      />
      {w !== undefined && isWild(c, w) && (
        <span className="wild-marker" aria-label="Wild card">
          W
        </span>
      )}
    </>
  );
}
