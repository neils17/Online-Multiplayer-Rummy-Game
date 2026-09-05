import { getDb } from '@/db';
import { rooms } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { act, deal, type Game } from '@/lib/game';
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function view(g: Game, i: number, code: string) {
  return {
    code,
    ...g,
    deck: undefined,
    remaining: g.deck.length,
    pile: g.pile.slice(-1),
    players: g.players.map((p, j) => ({
      name: p.name,
      score: p.score,
      count: p.hand.length,
      hand: i === j || g.status === 'ended' ? p.hand : [],
      draws: p.draws,
    })),
    me: i,
  };
}
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as {
      action: string;
      name?: string;
      code?: string;
      token?: string;
      cardId?: string;
    };
    const db = getDb();
    const name =
      String(b.name || 'Player')
        .trim()
        .slice(0, 20) || 'Player';
    if (b.action === 'create') {
      const code = crypto
        .randomUUID()
        .replaceAll('-', '')
        .slice(0, 8)
        .toUpperCase();
      const token = crypto.randomUUID();
      const g: Game = {
        players: [{ name, token, hand: [], score: 0, draws: 0 }],
        deck: [],
        pile: [],
        wild: { id: '', r: 1, s: 0 },
        turn: 0,
        phase: 'draw',
        round: 0,
        status: 'waiting',
        history: [],
        message: 'Waiting for your friend.',
        picked: null,
      };
      await db.insert(rooms).values({ code, state: JSON.stringify(g) });
      return reply({ token, game: view(g, 0, code) });
    }
    const code = String(b.code || '').toUpperCase();
    const row = await db.select().from(rooms).where(eq(rooms.code, code)).get();
    if (!row)
      return reply({ error: 'Table not found. Check your room code.' }, 404);
    const g: Game = JSON.parse(row.state);
    let i = g.players.findIndex((p) => p.token === b.token);
    let token = b.token;
    if (b.action === 'join' && i < 0) {
      if (g.players.length === 2)
        return reply({ error: 'This table already has two players.' }, 409);
      token = crypto.randomUUID();
      g.players.push({ name, token, hand: [], score: 0, draws: 0 });
      i = 1;
      deal(g);
    } else {
      if (i < 0)
        return reply(
          {
            error:
              'Your seat could not be verified. Rejoin with your saved browser.',
          },
          403,
        );
      if (b.action !== 'poll') act(g, i, b.action, b.cardId);
    }
    if (b.action !== 'poll') {
      const changed = await db
        .update(rooms)
        .set({ state: JSON.stringify(g), version: row.version + 1 })
        .where(and(eq(rooms.code, code), eq(rooms.version, row.version)))
        .returning({ code: rooms.code });
      if (!changed.length)
        return reply(
          { error: 'The table just changed. Please try again.' },
          409,
        );
    }
    return reply({ token, game: view(g, i, code) });
  } catch (e) {
    return reply(
      {
        error:
          e instanceof Error && !e.message.startsWith('Failed query')
            ? e.message
            : 'Could not reach the table. Please try again.',
      },
      400,
    );
  }
}
