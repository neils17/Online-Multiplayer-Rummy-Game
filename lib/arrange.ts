import { isWild, meld, value, type Card } from './game';
export const GROUP = '~group:';
export const isGroup = (id: string) => id.startsWith(GROUP);
export function splitGroups(order: string[]) {
  const groups: { id: string; ids: string[] }[] = [];
  for (const id of order) {
    if (isGroup(id)) groups.push({ id, ids: [] });
    else {
      if (!groups.length) groups.push({ id: GROUP + 'loose', ids: [] });
      groups.at(-1)!.ids.push(id);
    }
  }
  return groups;
}
export function moveToGroup(
  order: string[],
  card: string,
  group: string,
  before?: string,
) {
  const next = order.filter((id) => id !== card);
  const start = next.indexOf(group);
  if (start < 0) return order;
  let end = next.findIndex((id, i) => i > start && isGroup(id));
  if (end < 0) end = next.length;
  const anchor = before ? next.indexOf(before) : -1;
  next.splice(anchor > start && anchor < end ? anchor : end, 0, card);
  return next;
}
export function removeGroup(order: string[], group: string) {
  const groups = splitGroups(order);
  const index = groups.findIndex((g) => g.id === group);
  if (index < 0 || groups.length < 2) return order;
  const removed = groups.splice(index, 1)[0];
  groups[Math.max(0, index - 1)].ids.push(...removed.ids);
  return groups.flatMap((g) => [g.id, ...g.ids]);
}
function pairKind(cards: Card[], wild: number) {
  if (cards.length !== 2) return '';
  const [a, b] = cards;
  if (isWild(a, wild) || isWild(b, wild)) return 'Sequence pair';
  if (a.r === b.r && a.s !== b.s) return 'Set pair';
  const gap = Math.min(
    Math.abs(a.r - b.r),
    a.r === 1 ? Math.abs(14 - b.r) : b.r === 1 ? Math.abs(14 - a.r) : 99,
  );
  return a.s === b.s && gap > 0 && gap <= 2 ? 'Sequence pair' : '';
}
export function describeGroup(cards: Card[], wild: number) {
  if (!cards.length)
    return {
      label: 'Drop cards here',
      kind: 'empty',
      valid: false,
      sequence: false,
      pure: false,
    };
  const types = meld(cards, wild);
  const pure = types.includes(2),
    sequence = pure || types.includes(1);
  if (pure)
    return {
      label: 'Pure sequence',
      kind: 'pure',
      valid: true,
      sequence: true,
      pure: true,
    };
  if (sequence)
    return {
      label: 'Sequence',
      kind: 'sequence',
      valid: true,
      sequence: true,
      pure: false,
    };
  if (types.includes(0))
    return {
      label: 'Set',
      kind: 'set',
      valid: true,
      sequence: false,
      pure: false,
    };
  const pair = pairKind(cards, wild);
  return {
    label: pair || 'Ungrouped',
    kind: pair ? 'pair' : 'loose',
    valid: false,
    sequence: false,
    pure: false,
  };
}
function ordered(cards: Card[], type: number, wild: number) {
  if (type === 0) return [...cards].sort((a, b) => a.r - b.r || a.s - b.s);
  const natural = cards.filter((c) => type === 2 || !isWild(c, wild));
  const jokers = cards.filter((c) => type !== 2 && isWild(c, wild));
  const lowRanks = natural.map((c) => c.r);
  const high = Math.max(...lowRanks) - Math.min(...lowRanks) >= cards.length;
  const getRank = (c: Card) => (high && c.r === 1 ? 14 : c.r);
  natural.sort((a, b) => getRank(a) - getRank(b));
  if (type === 2) return natural;
  const start = Math.max(1, Math.min(getRank(natural[0]), 15 - cards.length));
  const slots = new Map(natural.map((c) => [getRank(c), c]));
  return Array.from(
    { length: cards.length },
    (_, i) => slots.get(start + i) || jokers.shift()!,
  );
}
// Exact disjoint-meld search. Lexicographic objective: pure sequence, two
// sequences, maximum covered cards, then maximum covered penalty value.
// For a 14-card hand we search every legal 13-card subset, leaving a spare.
export function arrangeHand(
  hand: Card[],
  wild: number,
  picked: string | null = null,
) {
  if (!hand.length) return [] as Card[][];
  if (hand.length > 14) throw Error('Arrange supports up to 14 cards.');
  const n = hand.length,
    full = (1 << n) - 1;
  const byBit: { mask: number; type: number; reward: number }[][] = Array.from(
    { length: n },
    () => [],
  );
  for (let mask = 1; mask <= full; mask++) {
    const cards = hand.filter((_, i) => mask & (1 << i));
    if (cards.length < 3) continue;
    for (const type of meld(cards, wild)) {
      const c = {
        mask,
        type,
        reward:
          cards.length * 10000 +
          cards.reduce((sum, c) => sum + value(c, wild), 0) * 5,
      };
      for (let i = 0; i < n; i++) if (mask & (1 << i)) byBit[i].push(c);
    }
  }
  const memo = new Map<number, number>(),
    choice = new Map<number, { mask: number; type: number }>();
  const key = (mask: number, seq: number, pure: number) =>
    mask * 6 + seq * 2 + pure;
  function solve(mask: number, seq: number, pure: number): number {
    if (!mask) return pure * 10000000 + seq * 1000000;
    const k = key(mask, seq, pure);
    const cached = memo.get(k);
    if (cached !== undefined) return cached;
    const bit = mask & -mask,
      i = 31 - Math.clz32(bit);
    let best = solve(mask ^ bit, seq, pure);
    let pick = { mask: bit, type: -1 };
    for (const c of byBit[i])
      if ((mask & c.mask) === c.mask) {
        const score =
          c.reward +
          solve(
            mask ^ c.mask,
            Math.min(2, seq + (c.type > 0 ? 1 : 0)),
            pure || +(c.type === 2),
          );
        if (score > best) {
          best = score;
          pick = c;
        }
      }
    memo.set(k, best);
    choice.set(k, pick);
    return best;
  }
  let mask = full,
    spare = -1;
  if (n === 14) {
    let best = -Infinity;
    for (let i = 0; i < n; i++) {
      if (hand[i].id === picked) continue;
      const m = full ^ (1 << i);
      const score = solve(m, 0, 0);
      if (
        score > best ||
        (score === best && value(hand[i], wild) > value(hand[spare], wild))
      ) {
        best = score;
        mask = m;
        spare = i;
      }
    }
  } else solve(mask, 0, 0);
  const groups: { cards: Card[]; type: number }[] = [];
  const loose: Card[] = [];
  let seq = 0,
    pure = 0;
  while (mask) {
    const pick = choice.get(key(mask, seq, pure))!;
    const cs = hand.filter((_, i) => pick.mask & (1 << i));
    if (pick.type < 0) loose.push(...cs);
    else {
      groups.push({ cards: ordered(cs, pick.type, wild), type: pick.type });
      seq = Math.min(2, seq + (pick.type > 0 ? 1 : 0));
      pure = pure || +(pick.type === 2);
    }
    mask ^= pick.mask;
  }
  groups.sort((a, b) => b.type - a.type);
  // Pair remaining cards without reusing a card. Maximize useful two-card starts.
  const pairMemo = new Map<number, { score: number; groups: Card[][] }>();
  function pairs(mask: number): { score: number; groups: Card[][] } {
    if (!mask) return { score: 0, groups: [] };
    const old = pairMemo.get(mask);
    if (old) return old;
    const bit = mask & -mask,
      i = 31 - Math.clz32(bit);
    const rest = pairs(mask ^ bit);
    let best = { score: rest.score, groups: [[loose[i]], ...rest.groups] };
    for (let j = i + 1; j < loose.length; j++)
      if (mask & (1 << j)) {
        const kind = pairKind([loose[i], loose[j]], wild);
        if (!kind) continue;
        const result = pairs(mask ^ bit ^ (1 << j));
        const score = result.score + (kind === 'Sequence pair' ? 3 : 2);
        if (score > best.score)
          best = { score, groups: [[loose[i], loose[j]], ...result.groups] };
      }
    pairMemo.set(mask, best);
    return best;
  }
  const partial = pairs((1 << loose.length) - 1).groups;
  const singles = partial.filter((g) => g.length === 1).flat();
  const out = [
    ...groups.map((g) => g.cards),
    ...partial.filter((g) => g.length > 1),
  ];
  if (singles.length) out.push(singles);
  if (spare >= 0) out.push([hand[spare]]);
  return out;
}
