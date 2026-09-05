'use client';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableFooter,
} from '@/components/ui/table';
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useCardMotion, INCOMING } from '@/hooks/use-card-motion';
import { type Card, rank, suit, isWild } from '@/lib/game';
type View = {
  code: string;
  players: {
    name: string;
    score: number;
    count: number;
    hand: Card[];
    draws: number;
  }[];
  me: number;
  status: string;
  round: number;
  turn: number;
  phase: string;
  wild: Card;
  pile: Card[];
  remaining: number;
  message: string;
  history: { round: number; points: number[]; message: string }[];
};
type Seat = { code: string; token: string };
function Face({ c, w }: { c: Card; w?: number }) {
  return (
    <>
      <span>
        {rank(c.r)}
        <i>{c.r ? suit[c.s] : '★'}</i>
      </span>
      <b>{c.r ? suit[c.s] : '★'}</b>
      <span className="corner">
        {rank(c.r)}
        <i>{c.r ? suit[c.s] : '★'}</i>
      </span>
      {w !== undefined && isWild(c, w) && <em>WILD</em>}
    </>
  );
}
export default function Home() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [seat, setSeat] = useState<Seat | null>(null);
  const [g, setG] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [rules, setRules] = useState(false);
  const [scores, setScores] = useState(false);
  const [confirm, setConfirm] = useState('');
  const inFlight = useRef(false);
  const requestEpoch = useRef(0);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mehfil-seat');
      if (saved) setSeat(JSON.parse(saved));
      setName(localStorage.getItem('mehfil-name') || '');
      setCode(new URLSearchParams(location.search).get('room') || '');
    } catch {}
  }, []);
  async function call(action: string, cardId?: string, current = seat) {
    if (action !== 'poll' && inFlight.current) return;
    if (action !== 'poll') {
      requestEpoch.current++;
      inFlight.current = true;
      setBusy(true);
      setError('');
    }
    const epoch = requestEpoch.current;
    try {
      const response = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          cardId,
          name,
          code: current?.code || code,
          token: current?.token,
        }),
      });
      const data = (await response.json()) as {
        game: View;
        token: string;
        error?: string;
      };
      if (!response.ok) throw Error(data.error || 'Could not reach the table.');
      if (action === 'poll' && epoch !== requestEpoch.current) return false;
      setG(data.game);
      setConnection(true);
      if (action === 'create' || action === 'join') {
        const s = { code: data.game.code, token: data.token };
        setSeat(s);
        localStorage.setItem('mehfil-seat', JSON.stringify(s));
        localStorage.setItem('mehfil-name', name);
      }
      if (action === 'discard' || action === 'declare') setSelected(null);
      return data.game;
    } catch (e) {
      if (action === 'poll') setConnection(false);
      else
        setError(
          e instanceof Error ? e.message : 'Connection lost. Try again.',
        );
      return false;
    } finally {
      if (action !== 'poll') {
        setBusy(false);
        inFlight.current = false;
      }
    }
  }
  useEffect(() => {
    if (!seat) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!inFlight.current) await call('poll', undefined, seat);
      if (!stopped) timer = setTimeout(poll, 1200);
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [seat]);
  const hand = g?.players[g.me]?.hand || [];
  const handKey = hand.map((c) => c.id).join(',');
  useEffect(() => {
    setOrder((old) => [
      ...old.filter((id) => id === INCOMING || hand.some((c) => c.id === id)),
      ...hand.filter((c) => !old.includes(c.id)).map((c) => c.id),
    ]);
  }, [handKey]);
  const cards = order
    .map((id) =>
      id === INCOMING
        ? { id: INCOMING, r: 0, s: 0 }
        : hand.find((c) => c.id === id),
    )
    .filter(Boolean) as Card[];
  const mine = !!g && g.turn === g.me && g.status === 'playing';
  const mayDiscard = mine && g?.phase === 'discard';
  const other = g?.players[1 - g.me];
  const motion = useCardMotion(
    order,
    setOrder,
    setSelected,
    async (source) => {
      const result = await call(source);
      if (!result) return null;
      return (
        result.players[result.me].hand.find(
          (c) => !hand.some((old) => old.id === c.id),
        )?.id || null
      );
    },
    async (id) => {
      if (!mayDiscard) {
        setError('Draw a card on your turn before discarding.');
        return false;
      }
      return !!(await call('discard', id));
    },
    `${g?.code}/${g?.round}/${g?.status}`,
  );
  const drag = motion.drag;
  function leave() {
    localStorage.removeItem('mehfil-seat');
    setSeat(null);
    setG(null);
    setConfirm('');
    setError('');
    setOrder([]);
  }
  async function invite() {
    const url = `${location.origin}/?room=${g?.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setError('Invite link copied. Send it to your friend.');
    } catch {
      setError(`Share this room code: ${g?.code}`);
    }
  }
  return (
    <main
      className="shell"
      onPointerMove={motion.move}
      onPointerUp={(e) => void motion.end(e)}
      onPointerCancel={(e) => void motion.end(e, true)}
      onClickCapture={motion.click}
    >
      {drag && (
        <div
          ref={motion.ghost}
          className={`playing-card drag-ghost ${drag.face?.s && drag.face.s % 2 ? 'red' : ''} ${drag.source === 'draw' && !drag.face ? 'card-back deck' : ''}`}
          style={{
            left: drag.origin.left,
            top: drag.origin.top,
            width: drag.origin.width,
            height: drag.origin.height,
          }}
          aria-hidden="true"
        >
          {drag.face ? <Face c={drag.face} w={g?.wild.r} /> : <b>♠</b>}
        </div>
      )}
      <header>
        <div className="brand">
          ♠ <span>mehfil</span>
        </div>
        <span className="eyebrow">INDIAN RUMMY · 13 CARDS</span>
        <button className="quiet" onClick={() => setRules(true)}>
          How to play
        </button>
      </header>
      <section className={`table ${g ? 'in-game' : ''}`}>
        <div className="table-line" />
        {!g ? (
          <>
            <div className="welcome">
              <span className="eyebrow">A TABLE FOR TWO</span>
              <h1>
                Good cards.
                <br />
                Great company.
              </h1>
              <p>Your favourite rummy table, wherever you are.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void call('create', undefined, null);
                }}
              >
                <input
                  maxLength={20}
                  aria-label="Your name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <button disabled={busy || !name.trim()}>
                  Create a table ↗
                </button>
              </form>
              <form
                className="join"
                onSubmit={(e) => {
                  e.preventDefault();
                  void call('join', undefined, null);
                }}
              >
                <input
                  maxLength={8}
                  aria-label="Room code"
                  placeholder="Room code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                />
                <button disabled={busy || !name.trim() || code.length !== 8}>
                  Join
                </button>
              </form>
              <small>2 players · Private rooms · Just for fun</small>
              {seat && (
                <button className="quiet" onClick={leave}>
                  Clear saved seat
                </button>
              )}
            </div>
            <div className="sample">
              {[1, 13, 12, 11, 10].map((r, i) => (
                <div
                  className={`playing-card ${i % 2 ? 'red' : ''}`}
                  style={{
                    transform: `rotate(${(i - 2) * 9}deg) translateY(${Math.abs(i - 2) * 8}px)`,
                  }}
                  key={r}
                >
                  <Face c={{ id: String(r), r, s: i % 4 }} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="table-top">
              <button className="quiet room" onClick={invite}>
                ROOM {g.code} <span>↗ Invite</span>
              </button>
              <button className="quiet" onClick={() => setScores(true)}>
                Scores{' '}
                <strong>
                  {g.players[g.me].score} : {other?.score || 0}
                </strong>
              </button>
            </div>
            {g.status === 'waiting' ? (
              <div className="waiting">
                <div className="seat-orbit">♧</div>
                <span className="eyebrow">YOUR TABLE IS READY</span>
                <h1>
                  Save a seat
                  <br />
                  for your friend.
                </h1>
                <p>
                  Share the invite link. They can join from
                  <br />
                  any Wi-Fi or mobile connection.
                </p>
                <button onClick={invite}>Copy invite link ↗</button>
                <div className="room-code">{g.code}</div>
                <small>
                  Keep this browser open. Play starts when they join.
                </small>
                <button className="quiet" onClick={() => setConfirm('leave')}>
                  Leave table
                </button>
              </div>
            ) : (
              <>
                <div
                  className={`opponent ${!mine && g.status === 'playing' ? 'active-player' : ''}`}
                >
                  <div className="avatar">{other?.name[0]?.toUpperCase()}</div>
                  <div>
                    <strong>{other?.name}</strong>
                    <small>
                      {g.status === 'ended'
                        ? 'Round complete'
                        : !mine
                          ? 'Playing…'
                          : `${other?.count} cards`}
                    </small>
                  </div>
                  <span className="points">
                    {other?.score} <small>pts</small>
                  </span>
                </div>
                <div
                  className="opponent-cards"
                  aria-label={`${other?.count} hidden cards`}
                >
                  {Array.from({ length: other?.count || 13 }, (_, i) => (
                    <div className="card-back" key={i} />
                  ))}
                </div>
                <div className="center-label">
                  <span className="eyebrow">
                    ROUND {String(g.round).padStart(2, '0')}
                  </span>
                  <h2>
                    {g.status === 'ended'
                      ? 'Round complete'
                      : mine
                        ? g.phase === 'draw'
                          ? 'Your move. Pick a card.'
                          : 'Make room. Discard one.'
                        : `${other?.name}’s turn`}
                  </h2>
                </div>
                <div className="piles">
                  <div className="pile-item">
                    <div
                      className={`playing-card joker ${g.wild.s % 2 ? 'red' : ''}`}
                    >
                      <Face c={g.wild} />
                    </div>
                    <span>Wild joker</span>
                  </div>
                  <button
                    className="pile-item pile-button"
                    disabled={!mine || g.phase !== 'draw' || busy}
                    onPointerDown={(e) =>
                      motion.start(e, 'draw', INCOMING, null)
                    }
                    onClick={() => call('draw')}
                  >
                    <div className="card-back deck">♠</div>
                    <span>
                      Draw pile <small>{g.remaining}</small>
                    </span>
                  </button>
                  <button
                    data-drop="discard"
                    onPointerDown={(e) => {
                      if (
                        mine &&
                        g.phase === 'draw' &&
                        !busy &&
                        !isWild(g.pile[0], g.wild.r)
                      )
                        motion.start(e, 'open', INCOMING, g.pile[0]);
                    }}
                    className={`pile-item pile-button discard ${drag && mayDiscard ? 'drop-ready' : ''}`}
                    onClick={() =>
                      mayDiscard && selected
                        ? call('discard', selected)
                        : call('open')
                    }
                    disabled={busy || !mine}
                  >
                    <div
                      className={`playing-card ${g.pile[0]?.s % 2 ? 'red' : ''}`}
                    >
                      {g.pile[0] && <Face c={g.pile[0]} />}
                    </div>
                    <span>
                      {mayDiscard ? 'Drop card here' : 'Discard pile'}
                    </span>
                  </button>
                </div>
                <div className="table-mark">
                  M <span>MEHFIL CARD CLUB</span>
                </div>
                <div className="hand-area">
                  <div className="hand-heading">
                    <div className="you">
                      <span className={`status-dot ${mine ? 'lit' : ''}`} />
                      <strong>{g.players[g.me].name}</strong>
                      <span>You · {hand.length} cards</span>
                    </div>
                    <button
                      className="quiet"
                      onClick={() =>
                        motion.sort(
                          [...hand]
                            .sort((a, b) => a.s - b.s || a.r - b.r)
                            .map((c) => c.id),
                        )
                      }
                    >
                      ⇄ Sort by suit
                    </button>
                  </div>
                  <div
                    ref={motion.hand}
                    className={`hand ${drag && drag.source !== 'hand' ? 'hand-receiving' : ''}`}
                    aria-label="Your hand"
                  >
                    {cards.map((c, i) => (
                      <button
                        data-card={c.id}
                        aria-label={`${rank(c.r)} ${suit[c.s]}${isWild(c, g.wild.r) ? ' wild joker' : ''}`}
                        aria-pressed={selected === c.id}
                        key={c.id}
                        className={`playing-card hand-card ${c.s % 2 ? 'red' : ''} ${selected === c.id ? 'selected' : ''} ${drag?.id === c.id ? 'drag-source' : ''} ${c.id === INCOMING ? 'incoming-slot' : ''}`}
                        onPointerDown={(e) => {
                          if (c.id !== INCOMING)
                            motion.start(e, 'hand', c.id, c);
                        }}
                        onClick={() => setSelected(c.id)}
                      >
                        <Face c={c} w={g.wild.r} />
                      </button>
                    ))}
                  </div>
                  <div className="hand-hint">
                    Drag cards to rearrange · Drag from either pile into your
                    hand
                  </div>
                  <div className="actions">
                    <button
                      className="quiet"
                      disabled={busy || g.status !== 'playing'}
                      onClick={() => setConfirm('drop')}
                    >
                      Drop round
                    </button>
                    <div>
                      {g.status === 'ended' ? (
                        <button onClick={() => call('next')} disabled={busy}>
                          Play next round ↗
                        </button>
                      ) : (
                        <>
                          <button
                            className="secondary"
                            disabled={!mayDiscard || !selected || busy}
                            onClick={() => call('discard', selected!)}
                          >
                            Discard
                          </button>
                          <button
                            disabled={!mayDiscard || !selected || busy}
                            onClick={() => setConfirm('declare')}
                          >
                            Declare hand ↗
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {g.status === 'ended' && (
                    <div className="result">
                      <strong>{g.message}</strong>
                      <p>
                        {g.history
                          .at(-1)
                          ?.points.map((p, i) => `${g.players[i].name}: +${p}`)
                          .join(' · ')}{' '}
                        · Lower score wins.
                      </p>
                      <button className="quiet" onClick={() => setScores(true)}>
                        View scorecard & revealed hands
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </section>
      {error && (
        <div className="notice" role="status" onClick={() => setError('')}>
          {error}{' '}
          <button className="quiet" aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}
      {seat && !connection && (
        <div className="notice" role="alert">
          Reconnecting to your table… Your seat is saved.
          <button className="quiet" onClick={() => setConfirm('leave')}>
            Leave
          </button>
        </div>
      )}
      <footer>
        <span>
          {g ? (
            <>
              <span className={`status-dot ${connection ? 'lit' : ''}`} />
              {connection ? 'Table connected' : 'Reconnecting…'}
            </>
          ) : (
            'Make a little room for play.'
          )}
        </span>
        <span>✦ No stakes. Just bragging rights.</span>
        {g && (
          <button className="quiet" onClick={() => setConfirm('leave')}>
            Leave table
          </button>
        )}
      </footer>
      <Dialog open={rules} onOpenChange={setRules}>
        <DialogContent className="modal">
          <DialogTitle>Thirteen cards. One winning hand.</DialogTitle>
          <DialogDescription>
            Two-player Indian points rummy · House rules
          </DialogDescription>
          <ol>
            <li>
              Draw from the closed deck or the top discard, then discard one
              card.
            </li>
            <li>
              Arrange all 13 cards into sets and sequences of at least 3 cards.
              You need two sequences, including one pure sequence.
            </li>
            <li>
              A pure sequence uses consecutive cards of one suit. Aces can be
              low or high, never wrap around.
            </li>
            <li>
              Sets contain 3–4 equal ranks in different suits. Printed jokers
              and the wild rank can replace cards. A wild card used naturally
              can be in a pure sequence.
            </li>
            <li>
              Select your 14th card to discard, then declare. We check every
              possible arrangement automatically.
            </li>
          </ol>
          <p>
            Winner: 0 points. Loser: unmatched card values, capped at 80. A, J,
            Q, K = 10; jokers = 0. Without a pure sequence, all cards count.
            Without two sequences, only pure sequences are exempt.
          </p>
          <p>
            First drop: 20 · Later drop: 40 · Invalid declaration: 80. Lower
            total wins. Two decks plus two printed jokers. Discarded jokers
            cannot be picked up.
          </p>
          <a
            href="https://www.rummycircle.com/how-to-play-rummy/cards-in-Rummy.pdf"
            target="_blank"
            rel="noreferrer"
          >
            See sequence and set examples ↗
          </a>
        </DialogContent>
      </Dialog>
      <Dialog open={scores} onOpenChange={setScores}>
        <DialogContent className="modal wide">
          <DialogTitle>The scorecard</DialogTitle>
          <DialogDescription>
            Penalty points · Lower is better
          </DialogDescription>
          {g && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Round</TableHead>
                    {g.players.map((p, i) => (
                      <TableHead key={i}>{p.name}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.history.length ? (
                    g.history.map((h) => (
                      <TableRow key={h.round}>
                        <TableCell>{h.round}</TableCell>
                        {h.points.map((p, i) => (
                          <TableCell key={i}>+{p}</TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3}>
                        No completed rounds yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    {g.players.map((p, i) => (
                      <TableCell key={i}>{p.score}</TableCell>
                    ))}
                  </TableRow>
                </TableFooter>
              </Table>
              {g.status === 'ended' &&
                g.players.map((p, i) => (
                  <div key={i}>
                    <strong>{p.name}’s hand</strong>
                    <p className="revealed">
                      {p.hand.map((c) => (
                        <span key={c.id} className={c.s % 2 ? 'red' : ''}>
                          {rank(c.r)}
                          {suit[c.s]}
                        </span>
                      ))}
                    </p>
                  </div>
                ))}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v) setConfirm('');
        }}
      >
        <DialogContent className="modal">
          <DialogTitle>
            {confirm === 'declare'
              ? 'Ready to declare?'
              : confirm === 'drop'
                ? 'Drop this round?'
                : 'Leave this table?'}
          </DialogTitle>
          <DialogDescription>
            {confirm === 'declare'
              ? 'Your selected card will be discarded. The remaining 13 must form a valid hand. An invalid declaration costs 80 points.'
              : confirm === 'drop'
                ? `You will receive ${g?.players[g.me].draws ? 40 : 20} penalty points. Your friend wins the round.`
                : 'Leaving clears your saved seat on this device. You will not be able to reclaim it. If a round is active, it will be recorded as a drop.'}
          </DialogDescription>
          <button
            disabled={busy}
            onClick={async () => {
              const a = confirm;
              setConfirm('');
              if (a === 'leave') {
                if (g?.status === 'playing') {
                  const ok = await call('drop');
                  if (!ok) return;
                }
                leave();
              } else await call(a, selected || undefined);
            }}
          >
            {confirm === 'declare'
              ? 'Discard & declare'
              : confirm === 'drop'
                ? 'Drop round'
                : 'Leave table'}
          </button>
          <button className="quiet" onClick={() => setConfirm('')}>
            Keep playing
          </button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
