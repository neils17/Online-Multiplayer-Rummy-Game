import type { Card } from './game';
export type TableSnapshot = {
  code: string;
  round: number;
  me: number;
  status: string;
  pile: Card[];
  players: { count: number; hand: Card[]; name: string }[];
};
export function opponentTransition(
  previous: TableSnapshot,
  next: TableSnapshot,
) {
  if (
    previous.code !== next.code ||
    previous.round !== next.round ||
    previous.status !== 'playing'
  )
    return null;
  const other = 1 - next.me,
    a = previous.players[other],
    b = next.players[other];
  if (!a || !b) return null;
  if (b.count > a.count) {
    const open = previous.pile[0]?.id !== next.pile[0]?.id;
    return {
      kind: 'draw' as const,
      open,
      card: open ? previous.pile[0] : null,
      label: `${b.name} is drawing a card`,
    };
  }
  if (
    b.count < a.count &&
    next.pile[0] &&
    previous.pile[0]?.id !== next.pile[0]?.id
  )
    return {
      kind: 'discard' as const,
      card: next.pile[0],
      label: `${b.name} is discarding`,
    };
  return null;
}
