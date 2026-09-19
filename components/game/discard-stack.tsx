import type { Card } from '@/lib/game';
import { CardFace } from './card-face';
// Keep the card underneath decoded and mounted before the top is lifted.
export function DiscardStack({
  face,
  top,
  underneath,
  wild,
}: {
  wild?: number;
  face: Card | null;
  top?: Card;
  underneath?: Card | null;
}) {
  const cards = new Map<string, Card>();
  for (const card of [underneath, top, face])
    if (card) cards.set(card.id, card);
  return (
    <>
      {Array.from(cards.values()).map((card) => (
        <div
          className="discard-layer"
          key={card.id}
          style={{ visibility: card.id === face?.id ? 'visible' : 'hidden' }}
        >
          <CardFace c={card} w={wild} />
        </div>
      ))}
    </>
  );
}
