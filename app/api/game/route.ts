import { getDb } from '@/db';
import { rooms } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { act, deal, droppedCard, gameOptions, type Game } from '@/lib/game';
import { advanceBot, scheduleBot } from '@/lib/bot';
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function view(g: Game, i: number, code: string, revision = 0) {
  return {
    code,
    revision,
    ...g,
    expert: g.expert ?? false,
    maxScore: g.maxScore ?? 101,
    match: g.match ?? 1,
    message: g.message.replaceAll('Mehfil Bot', 'Rummy Bot'),
    history: g.history.map((h) => ({
      ...h,
      message: h.message.replaceAll('Mehfil Bot', 'Rummy Bot'),
    })),
    deck: undefined,
    botAt: undefined,
    remaining: g.deck.length,
    pile: g.pile.slice(-1).map((c) => droppedCard(c, g.wild)),
    underDiscard: g.pile.at(-2) ? droppedCard(g.pile.at(-2)!, g.wild) : null,
    players: g.players.map((p, j) => ({
      name: p.bot ? 'Rummy Bot' : p.name,
      bot: !!p.bot,
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
      expert?: boolean;
      maxScore?: number;
    };
    const db = getDb();
    const name =
      String(b.name || 'Player')
        .trim()
        .slice(0, 20) || 'Player';
    if (b.action === 'create' || b.action === 'practice') {
      const code = crypto
        .randomUUID()
        .replaceAll('-', '')
        .slice(0, 8)
        .toUpperCase();
      const token = crypto.randomUUID();
      const options = gameOptions(b.expert, b.maxScore);
      const g: Game = {
        ...options,
        match: 1,
        matchOver: false,
        winner: null,
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
      if (b.action === 'practice') {
        g.players.push({
          name: 'Rummy Bot',
          token: crypto.randomUUID(),
          hand: [],
          score: 0,
          draws: 0,
          bot: true,
        });
        deal(g);
        scheduleBot(g);
      }
      await db.insert(rooms).values({ code, state: JSON.stringify(g) });
      return reply({ token, game: view(g, 0, code) });
    }
    const code = String(b.code || '').toUpperCase();
    const row = await db.select().from(rooms).where(eq(rooms.code, code)).get();
    if (!row)
      return reply({ error: 'Table not found. Check your room code.' }, 404);
    const g: Game = JSON.parse(row.state);
    g.expert ??= false;
    g.maxScore ??= 101;
    g.match ??= 1;
    if (g.status === 'ended' && g.players.some((p) => p.score >= g.maxScore!)) {
      g.matchOver = true;
      g.winner =
        g.players[0].score === g.players[1].score
          ? null
          : g.players[0].score < g.players[1].score
            ? 0
            : 1;
    }
    g.players.forEach((p) => {
      if (p.bot) p.name = 'Rummy Bot';
    });
    let i = g.players.findIndex((p) => p.token === b.token);
    let token = b.token;
    let botMoved = false;
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
      else botMoved = advanceBot(g);
    }
    if (b.action !== 'poll') scheduleBot(g);
    if (b.action !== 'poll' || botMoved) {
      const changed = await db
        .update(rooms)
        .set({ state: JSON.stringify(g), version: row.version + 1 })
        .where(and(eq(rooms.code, code), eq(rooms.version, row.version)))
        .returning({ code: rooms.code });
      if (!changed.length) {
        if (b.action === 'poll') {
          const latest = await db
            .select()
            .from(rooms)
            .where(eq(rooms.code, code))
            .get();
          if (latest)
            return reply({
              token,
              game: view(JSON.parse(latest.state), i, code, latest.version),
            });
        }
        return reply(
          { error: 'The table just changed. Please try again.' },
          409,
        );
      }
    }
    return reply({
      token,
      game: view(
        g,
        i,
        code,
        row.version + (b.action !== 'poll' || botMoved ? 1 : 0),
      ),
    });
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
