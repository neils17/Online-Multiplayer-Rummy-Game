export type Card = {
  id: string;
  r: number;
  s: number;
  naturalOnly?: boolean;
  printed?: boolean;
};
export type RoundResult = {
  round: number;
  points: number[];
  message: string;
  basePoints?: number;
  multiplier?: number;
  winner?: number;
  bonus?: 'sets' | 'sequences';
};
export type Player = {
  bot?: boolean;
  name: string;
  token: string;
  hand: Card[];
  score: number;
  draws: number;
};
export type Game = {
  botAt?: number;
  expert?: boolean;
  maxScore?: number;
  match?: number;
  matchOver?: boolean;
  winner?: number | null;
  players: Player[];
  deck: Card[];
  pile: Card[];
  wild: Card;
  turn: number;
  phase: 'draw' | 'discard';
  round: number;
  status: 'waiting' | 'playing' | 'ended';
  history: RoundResult[];
  message: string;
  picked: string | null;
};
export const suit = ['♠', '♥', '♣', '♦'];
export const rank = (r: number) =>
  ['★', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][r];
export const isWild = (c: Card, w: number) =>
  !c.naturalOnly && (c.r === 0 || c.r === w);
export function droppedCard(c: Card, wild: Card): Card {
  return isWild(c, wild.r)
    ? {
        ...c,
        r: c.r || wild.r,
        s: c.r ? c.s : wild.s,
        naturalOnly: true,
        printed: c.r === 0 || c.printed,
      }
    : c;
}
export function gameOptions(expert: unknown, maxScore: unknown) {
  if (expert !== undefined && typeof expert !== 'boolean')
    throw Error('Choose standard or expert mode.');
  const limit = maxScore === undefined ? 101 : Number(maxScore);
  if (!Number.isInteger(limit) || limit < 101 || limit > 151)
    throw Error('Choose a score limit from 101 to 151.');
  return { expert: expert === true, maxScore: limit };
}
export const value = (c: Card, w: number) =>
  isWild(c, w) ? 0 : c.r === 1 ? 10 : Math.min(c.r, 10);
function random(n: number) {
  const a = new Uint32Array(1);
  const limit = Math.floor(4294967296 / n) * n;
  do {
    crypto.getRandomValues(a);
  } while (a[0] >= limit);
  return a[0] % n;
}
export function shuffle(a: Card[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function deal(g: Game) {
  const d: Card[] = [];
  for (let k = 0; k < 2; k++) {
    for (let s = 0; s < 4; s++)
      for (let r = 1; r <= 13; r++) d.push({ id: `${k}-${s}-${r}`, r, s });
    d.push({ id: `j${k}`, r: 0, s: 0 });
  }
  shuffle(d);
  g.wild = d.splice(
    d.findIndex((c) => c.r > 0),
    1,
  )[0];
  g.players.forEach((p) => {
    p.hand = d.splice(0, 13);
    p.draws = 0;
  });
  // The opening card was dealt, not discarded by a player: keep it wild.
  g.pile = d.splice(0, 1);
  g.deck = d;
  g.round++;
  g.turn = (g.round - 1) % 2;
  g.phase = 'draw';
  g.status = 'playing';
  g.matchOver = false;
  g.winner = null;
  g.picked = null;
  g.message = 'A new round is on the table.';
}
// A meld may have more than one interpretation: retain all of them for exact hand search.
export function meld(cs: Card[], w: number): number[] {
  if (cs.length < 3) return [];
  const out: number[] = [];
  const run = (a: Card[], len: number) => {
    if (!a.length) return true;
    if (a.some((c) => c.s !== a[0].s)) return false;
    return [false, true].some((high) => {
      const rs = a.map((c) => (high && c.r === 1 ? 14 : c.r));
      return (
        new Set(rs).size === rs.length &&
        Math.max(...rs) - Math.min(...rs) < len &&
        Math.max(...rs) <= 14 &&
        Math.min(...rs) >= 1
      );
    });
  };
  if (cs.every((c) => c.r > 0) && run(cs, cs.length)) out.push(2);
  // A wild-rank card can also be used as its natural rank and suit in a set.
  if (
    cs.length <= 4 &&
    cs.every((c) => c.r > 0 && c.r === cs[0].r) &&
    new Set(cs.map((c) => c.s)).size === cs.length
  )
    out.push(0);
  const natural = cs.filter((c) => !isWild(c, w));
  if (natural.length && run(natural, cs.length)) out.push(1);
  if (
    cs.length <= 4 &&
    natural.length &&
    natural.every((c) => c.r === natural[0].r) &&
    new Set(natural.map((c) => c.s)).size === natural.length
  )
    out.push(0);
  return [...new Set(out)];
}
// Exact partition into exclusively natural sets OR natural sequences. Printed
// jokers have no natural rank until discarded and fixed to the indicator card.
export function naturalCompletion(hand: Card[], picked: string | null = null) {
  if (hand.length !== 13 && hand.length !== 14) return null;
  const n = hand.length,
    full = (1 << n) - 1;
  const sets: number[][] = Array.from({ length: n }, () => []);
  const sequences: number[][] = Array.from({ length: n }, () => []);
  for (let mask = 1; mask <= full; mask++) {
    const cards = hand.filter((_, i) => mask & (1 << i));
    if (cards.length < 3 || cards.some((c) => c.r === 0)) continue;
    const isSet =
      cards.length <= 4 &&
      cards.every((c) => c.r === cards[0].r) &&
      new Set(cards.map((c) => c.s)).size === cards.length;
    const isSequence = meld(cards, 0).includes(2);
    if (!isSet && !isSequence) continue;
    for (let i = 0; i < n; i++)
      if (mask & (1 << i)) {
        if (isSet) sets[i].push(mask);
        if (isSequence) sequences[i].push(mask);
      }
  }
  for (const kind of ['sets', 'sequences'] as const) {
    const candidates = kind === 'sets' ? sets : sequences;
    const memo = new Map<number, number[] | null>();
    function solve(mask: number): number[] | null {
      if (!mask) return [];
      if (memo.has(mask)) return memo.get(mask)!;
      const bit = 31 - Math.clz32(mask & -mask);
      for (const group of candidates[bit])
        if ((mask & group) === group) {
          const rest = solve(mask ^ group);
          if (rest) {
            const result = [group, ...rest];
            memo.set(mask, result);
            return result;
          }
        }
      memo.set(mask, null);
      return null;
    }
    const discards =
      n === 14
        ? hand.map((_, i) => i).filter((i) => hand[i].id !== picked)
        : [-1];
    for (const i of discards) {
      const result = solve(i < 0 ? full : full ^ (1 << i));
      if (result)
        return {
          kind,
          discard: i < 0 ? null : hand[i],
          groups: result.map((mask) => hand.filter((_, j) => mask & (1 << j))),
        };
    }
  }
  return null;
}
export function analyze(hand: Card[], w: number) {
  const n = hand.length;
  const candidates: { mask: number; type: number; points: number }[] = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    const cs = hand.filter((_, i) => mask & (1 << i));
    if (cs.length < 3) continue;
    for (const type of meld(cs, w))
      candidates.push({
        mask,
        type,
        points: cs.reduce((s, c) => s + value(c, w), 0),
      });
  }
  const total = hand.reduce((s, c) => s + value(c, w), 0);
  const memo = new Map<string, number>();
  function best(mask: number, seq: number, pure: boolean): number {
    const key = `${mask}/${seq}/${pure}`;
    if (memo.has(key)) return memo.get(key)!;
    let result = 0;
    for (const c of candidates) {
      if ((mask & c.mask) !== c.mask) continue;
      const ns = Math.min(2, seq + (c.type > 0 ? 1 : 0));
      const np = pure || c.type === 2; // A set is exempt only once both sequence requirements are met.
      const earned =
        c.type === 2 || (pure && (c.type === 1 || seq >= 2)) ? c.points : 0;
      result = Math.max(result, earned + best(mask ^ c.mask, ns, np));
    }
    memo.set(key, result);
    return result;
  }
  const validMemo = new Map<string, boolean>();
  function valid(mask: number, seq: number, pure: boolean): boolean {
    if (!mask) return seq >= 2 && pure;
    const k = `${mask}/${seq}/${pure}`;
    if (validMemo.has(k)) return validMemo.get(k)!;
    const bit = mask & -mask;
    const ok = candidates.some(
      (c) =>
        (c.mask & bit) !== 0 &&
        (mask & c.mask) === c.mask &&
        valid(
          mask ^ c.mask,
          Math.min(2, seq + (c.type > 0 ? 1 : 0)),
          pure || c.type === 2,
        ),
    );
    validMemo.set(k, ok);
    return ok;
  }
  const naturalWin = n === 13 && !!naturalCompletion(hand);
  return {
    valid: n === 13 && (naturalWin || valid((1 << n) - 1, 0, false)),
    penalty: naturalWin
      ? 0
      : Math.min(80, total - best((1 << n) - 1, 0, false)),
  };
}
export function finish(
  g: Game,
  loser: number,
  points: number,
  message: string,
  bonus?: 'sets' | 'sequences',
) {
  const basePoints = points;
  if (bonus) points *= 2;
  g.players[loser].score += points;
  g.status = 'ended';
  g.message = bonus
    ? `${message} Natural ${bonus}: double points (${basePoints} × 2 = ${points}).`
    : message;
  g.matchOver = g.players.some((p) => p.score >= (g.maxScore ?? 101));
  g.winner = g.matchOver
    ? g.players[0].score === g.players[1].score
      ? null
      : g.players[0].score < g.players[1].score
        ? 0
        : 1
    : null;
  g.history.push({
    round: g.round,
    points: g.players.map((_, i) => (i === loser ? points : 0)),
    message: g.message,
    basePoints,
    multiplier: bonus ? 2 : 1,
    winner: 1 - loser,
    bonus,
  });
}
// Search every legal discard with shared exact meld states. No selected card is required.
export function winningDiscard(
  hand: Card[],
  wild: number,
  picked: string | null,
) {
  if (hand.length !== 14) return null;
  const natural = naturalCompletion(hand, picked);
  if (natural?.discard) return natural.discard;
  const full = (1 << hand.length) - 1;
  const byBit: { mask: number; type: number }[][] = Array.from(
    { length: 14 },
    () => [],
  );
  for (let mask = 1; mask <= full; mask++) {
    const cards = hand.filter((_, i) => mask & (1 << i));
    for (const type of meld(cards, wild)) {
      for (let i = 0; i < 14; i++)
        if (mask & (1 << i)) byBit[i].push({ mask, type });
    }
  }
  const memo = new Map<number, boolean>();
  function valid(mask: number, sequences: number, pure: number): boolean {
    if (!mask) return sequences >= 2 && !!pure;
    const key = mask * 6 + sequences * 2 + pure;
    if (memo.has(key)) return memo.get(key)!;
    const bit = 31 - Math.clz32(mask & -mask);
    const result = byBit[bit].some(
      ({ mask: group, type }) =>
        (mask & group) === group &&
        valid(
          mask ^ group,
          Math.min(2, sequences + +(type > 0)),
          pure || +(type === 2),
        ),
    );
    memo.set(key, result);
    return result;
  }
  return (
    hand.find(
      (card, i) => card.id !== picked && valid(full ^ (1 << i), 0, 0),
    ) || null
  );
}
export function act(g: Game, i: number, a: string, cardId?: string) {
  if (a === 'restart') {
    if (!g.matchOver || g.status !== 'ended')
      throw Error('Finish the match before playing again.');
    g.players.forEach((p) => (p.score = 0));
    g.history = [];
    g.round = 0;
    g.match = (g.match ?? 1) + 1;
    deal(g);
    return;
  }
  if (a === 'next') {
    if (g.matchOver)
      throw Error('The match is over. Choose Play again or Return to menu.');
    if (g.status !== 'ended') throw Error('Finish this round first.');
    deal(g);
    return;
  }
  if (g.status !== 'playing') throw Error('The round is not in play.');
  if (a === 'drop') {
    finish(g, i, g.players[i].draws ? 40 : 20, `${g.players[i].name} dropped.`);
    return;
  }
  if (g.turn !== i) throw Error('It is your friend’s turn.');
  const p = g.players[i];
  if (a === 'draw' || a === 'open') {
    if (g.phase !== 'draw') throw Error('Discard a card first.');
    if (a === 'open' && !g.pile.length)
      throw Error('The discard pile is empty.');
    if (!g.deck.length) {
      g.deck = shuffle(g.pile.splice(0, g.pile.length - 1));
      if (!g.deck.length) {
        g.status = 'ended';
        g.message = 'The deck is exhausted. No points this round.';
        g.history.push({ round: g.round, points: [0, 0], message: g.message });
        return;
      }
    }
    const c = (a === 'draw' ? g.deck : g.pile).pop();
    if (!c) throw Error('No card available.');
    p.hand.push(c);
    p.draws++;
    g.picked = a === 'open' ? c.id : null;
    g.phase = 'discard';
    return;
  }
  if (a === 'declare') {
    if (g.phase !== 'discard' || p.hand.length !== 14)
      throw Error('Draw to 14 cards before declaring.');
    const spare = winningDiscard(p.hand, g.wild.r, g.picked);
    if (spare) {
      g.pile.push(
        droppedCard(
          p.hand.splice(
            p.hand.findIndex((c) => c.id === spare.id),
            1,
          )[0],
          g.wild,
        ),
      );
      const penalty = analyze(g.players[1 - i].hand, g.wild.r).penalty;
      finish(
        g,
        1 - i,
        penalty,
        `${p.name} declared a winning hand!`,
        naturalCompletion(p.hand)?.kind,
      );
    } else {
      finish(g, i, 80, `${p.name} made an invalid declaration. 80 points.`);
    }
    return;
  }
  if (a === 'discard') {
    if (g.phase !== 'discard') throw Error('Draw a card first.');
    const ix = p.hand.findIndex((c) => c.id === cardId);
    if (ix < 0) throw Error('Choose a card to discard.');
    if (cardId === g.picked)
      throw Error('You cannot return the card you just picked up.');
    g.pile.push(droppedCard(p.hand.splice(ix, 1)[0], g.wild));
    g.turn = 1 - i;
    g.phase = 'draw';
    g.picked = null;
    return;
  }
  throw Error('Unknown action.');
}
