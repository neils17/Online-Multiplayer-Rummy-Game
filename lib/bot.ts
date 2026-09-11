import {
  act,
  winningDiscard,
  droppedCard,
  isWild,
  meld,
  value,
  type Card,
  type Game,
} from './game';

// Decisions use only the bot's hand, the visible discard, and the wild rank.
// Complete melds and useful neighbours are kept ahead of isolated high cards.
export function cardUsefulness(card: Card, hand: Card[], wild: number) {
  if (isWild(card, wild)) return 250;
  const others = hand.filter((c) => c.id !== card.id);
  let completed = 0;
  for (let i = 0; i < others.length; i++)
    for (let j = i + 1; j < others.length; j++) {
      const types = meld([card, others[i], others[j]], wild);
      if (types.includes(2)) completed = Math.max(completed, 100);
      else if (types.includes(0)) completed = Math.max(completed, 65);
      else if (types.includes(1)) completed = Math.max(completed, 55);
    }
  const rankSuits = new Set(
    others.filter((c) => c.r === card.r && c.s !== card.s).map((c) => c.s),
  );
  const neighbours = others
    .filter((c) => c.s === card.s && c.r > 0 && c.r !== card.r)
    .reduce((total, c) => {
      const gap = Math.min(
        Math.abs(c.r - card.r),
        card.r === 1
          ? Math.abs(c.r - 14)
          : c.r === 1
            ? Math.abs(card.r - 14)
            : 99,
      );
      return total + (gap === 1 ? 12 : gap === 2 ? 5 : 0);
    }, 0);
  return (
    completed + rankSuits.size * 10 + neighbours - value(card, wild) * 0.35
  );
}
export function chooseBotDiscard(
  hand: Card[],
  wild: number,
  picked: string | null,
) {
  const legal = hand.filter((c) => c.id !== picked);
  if (!legal.length) throw Error('The bot has no legal discard.');
  return [...legal].sort(
    (a, b) =>
      cardUsefulness(a, hand, wild) - cardUsefulness(b, hand, wild) ||
      value(b, wild) - value(a, wild) ||
      a.id.localeCompare(b.id),
  )[0];
}
export function scheduleBot(g: Game, now = Date.now()) {
  g.botAt =
    g.status === 'playing' && g.players[g.turn]?.bot ? now + 850 : undefined;
}
export function advanceBot(g: Game, now = Date.now()) {
  const i = g.turn,
    p = g.players[i];
  if (g.status !== 'playing' || !p?.bot || now < (g.botAt ?? 0)) return false;
  if (g.phase === 'draw') {
    const visible = g.pile.at(-1);
    const top = visible ? droppedCard(visible, g.wild) : undefined;
    let takeOpen = false;
    if (top) {
      const combined = [...p.hand, top];
      const worst = chooseBotDiscard(combined, g.wild.r, top.id);
      takeOpen =
        cardUsefulness(top, combined, g.wild.r) >
        cardUsefulness(worst, combined, g.wild.r) + 4;
    }
    act(g, i, takeOpen ? 'open' : 'draw');
  } else {
    const discard = chooseBotDiscard(p.hand, g.wild.r, g.picked);
    const wins = !!winningDiscard(p.hand, g.wild.r, g.picked);
    act(g, i, wins ? 'declare' : 'discard', discard.id);
  }
  scheduleBot(g, now);
  return true;
}
