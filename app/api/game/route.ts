import { getDb } from '@/db';
import { rooms } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  act,
  deal,
  gameOptions,
  assertDeckIntegrity,
  recordDeclaredGroups,
  saveLayout,
  reconcileLayout,
  type Game,
} from '@/lib/game';
import { advanceBot, scheduleBot } from '@/lib/bot';
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function view(g: Game, i: number, code: string, revision = 0) {
  return {
    code,
    revision,
    ...g,
    expert: g.expert ?? false,
    decks: g.decks ?? 2,
    ready: g.ready ?? g.players.map((p) => g.status === 'ended' && !!p.bot),
    maxScore: g.maxScore ?? 101,
    match: g.match ?? 1,
    message: g.message.replace(/\b\w+ Bot\b/g, 'Rummy Bot'),
    history: g.history.map((h) => ({
      ...h,
      message: h.message.replace(/\b\w+ Bot\b/g, 'Rummy Bot'),
    })),
    deck: undefined,
    botAt: undefined,
    remaining: g.deck.length,
    pile: g.pile.slice(-1),
    underDiscard: g.pile.at(-2) || null,
    players: g.players.map((p, j) => ({
      name: p.bot ? 'Rummy Bot' : p.name,
      bot: !!p.bot,
      score: p.score,
      count: p.hand.length,
      hand: i === j || g.status === 'ended' ? p.hand : [],
      draws: p.draws,
      layout: i === j || g.status === 'ended' ? reconcileLayout(p) : undefined,
    })),
    me: i,
  };
}
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as {
      action: string;
      groups?: unknown;
      layout?: unknown;
      name?: string;
      code?: string;
      token?: string;
      cardId?: string;
      expert?: boolean;
      maxScore?: number;
      decks?: 1 | 2;
      round?: number;
      match?: number;
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
      const options = gameOptions(b.expert, b.maxScore, b.decks);
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
      assertDeckIntegrity(g);
      await db.insert(rooms).values({ code, state: JSON.stringify(g) });
      return reply({ token, game: view(g, 0, code) });
    }
    const code = String(b.code || '').toUpperCase();
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await db
        .select()
        .from(rooms)
        .where(eq(rooms.code, code))
        .get();
      if (!row)
        return reply({ error: 'Table not found. Check your room code.' }, 404);
      const g: Game = JSON.parse(row.state);
      g.expert ??= false;
      g.decks ??= 2;
      g.maxScore ??= 101;
      g.match ??= 1;
      if (
        g.status === 'ended' &&
        g.players.some((p) => p.score >= g.maxScore!)
      ) {
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
      let layoutChanged = false;
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
        if (
          (b.action === 'next' || b.action === 'restart') &&
          ((b.match !== undefined && b.match !== g.match) ||
            (b.round !== undefined && b.round !== g.round))
        )
          return reply({ token, game: view(g, i, code, row.version) });
        const sameRound = b.round === g.round && b.match === g.match;
        if (sameRound) layoutChanged = saveLayout(g, i, b.layout);
        if (
          b.action === 'declare' &&
          (!b.cardId || g.players[i].layout?.discardId !== b.cardId)
        )
          throw Error('Place one card in the Discard slot before declaring.');
        if (b.action !== 'poll') act(g, i, b.action, b.cardId);
        else botMoved = advanceBot(g);
        g.players.forEach((p) => {
          p.layout = reconcileLayout(p);
        });
        if (g.status === 'ended' && g.history.length)
          g.history.at(-1)!.actualLayouts = g.players.map((p) =>
            reconcileLayout(p),
          );
      }
      if (b.action !== 'poll') scheduleBot(g);
      if (b.action !== 'poll' || botMoved || layoutChanged) {
        assertDeckIntegrity(g);
        const changed = await db
          .update(rooms)
          .set({ state: JSON.stringify(g), version: row.version + 1 })
          .where(and(eq(rooms.code, code), eq(rooms.version, row.version)))
          .returning({ code: rooms.code });
        if (!changed.length) {
          if ((b.action === 'next' || b.action === 'restart') && attempt < 3)
            continue;
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
          row.version +
            (b.action !== 'poll' || botMoved || layoutChanged ? 1 : 0),
        ),
      });
    }
    return reply({ error: 'The table is busy. Please try again.' }, 409);
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
