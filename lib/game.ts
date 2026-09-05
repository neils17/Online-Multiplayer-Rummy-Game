export type Card = { id: string; r: number; s: number };
export type Player = {
  name: string;
  token: string;
  hand: Card[];
  score: number;
  draws: number;
};
export type Game = {
  players: Player[];
  deck: Card[];
  pile: Card[];
  wild: Card;
  turn: number;
  phase: 'draw' | 'discard';
  round: number;
  status: 'waiting' | 'playing' | 'ended';
  history: { round: number; points: number[]; message: string }[];
  message: string;
  picked: string | null;
};
export const suit = ['♠', '♥', '♣', '♦'];
export const rank = (r: number) =>
  ['★', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][r];
export const isWild = (c: Card, w: number) => c.r === 0 || c.r === w;
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
  g.pile = d.splice(0, 1);
  g.deck = d;
  g.round++;
  g.turn = (g.round - 1) % 2;
  g.phase = 'draw';
  g.status = 'playing';
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
  return {
    valid: n === 13 && valid((1 << n) - 1, 0, false),
    penalty: Math.min(80, total - best((1 << n) - 1, 0, false)),
  };
}
export function finish(
  g: Game,
  loser: number,
  points: number,
  message: string,
) {
  g.players[loser].score += points;
  g.status = 'ended';
  g.message = message;
  g.history.push({
    round: g.round,
    points: g.players.map((_, i) => (i === loser ? points : 0)),
    message,
  });
}
export function act(g: Game, i: number, a: string, cardId?: string) {
  if (a === 'next') {
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
    if (a === 'open' && isWild(g.pile[g.pile.length - 1], g.wild.r))
      throw Error('A discarded joker cannot be picked up.');
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
  if (a === 'discard' || a === 'declare') {
    if (g.phase !== 'discard') throw Error('Draw a card first.');
    const ix = p.hand.findIndex((c) => c.id === cardId);
    if (ix < 0) throw Error('Choose a card to discard.');
    if (cardId === g.picked)
      throw Error('You cannot return the card you just picked up.');
    g.pile.push(p.hand.splice(ix, 1)[0]);
    if (a === 'declare') {
      if (analyze(p.hand, g.wild.r).valid) {
        const penalty = analyze(g.players[1 - i].hand, g.wild.r).penalty;
        finish(g, 1 - i, penalty, `${p.name} declared a winning hand!`);
      } else
        finish(g, i, 80, `${p.name} made an invalid declaration. 80 points.`);
      return;
    }
    g.turn = 1 - i;
    g.phase = 'draw';
    g.picked = null;
    return;
  }
  throw Error('Unknown action.');
}
