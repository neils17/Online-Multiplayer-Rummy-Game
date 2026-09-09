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
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useCardFlight } from '@/hooks/use-card-flight';
import { opponentTransition } from '@/lib/transition';
import { describeGroup, splitGroups, isGroup, GROUP } from '@/lib/arrange';
import { useCardMotion, INCOMING } from '@/hooks/use-card-motion';
import { type Card, rank, suit, isWild } from '@/lib/game';
type View = {
  revision?: number;
  picked?: string | null;
  code: string;
  players: {
    name: string;
    bot?: boolean;
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
  const royal = c.r === 1 || c.r >= 11;
  const wild = w !== undefined && isWild(c, w);
  return (
    <>
      <span className={`card-index index-top ${wild ? 'wild-index' : ''}`}>
        {rank(c.r)}
        <i>{c.r ? suit[c.s] : '★'}</i>
      </span>
      <div className={`card-center ${royal ? 'royal-center' : ''}`}>
        {royal && (
          <img
            className="royal-art"
            src="/royal-crown.png"
            alt=""
            draggable={false}
          />
        )}
        <b>{c.r ? suit[c.s] : '★'}</b>
      </div>
      <span className={`card-index index-bottom ${wild ? 'wild-index' : ''}`}>
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
  const groupCounter = useRef(0);
  const [arranging, setArranging] = useState(false);
  const arrangeWorker = useRef<Worker | null>(null);
  useEffect(() => () => arrangeWorker.current?.terminate(), []);
  const handRound = useRef('');
  const [rules, setRules] = useState(false);
  const [scores, setScores] = useState(false);
  const [confirm, setConfirm] = useState('');
  const inFlight = useRef(false);
  const requestEpoch = useRef(0);
  const gRef = useRef<View | null>(null);
  const motionRef = useRef<ReturnType<typeof useCardMotion> | null>(null);
  const flightMotion = useCardFlight();
  const presenting = useRef(false);
  const opponentBefore = useRef<DOMRect[]>([]);
  const opponentAnimations = useRef<Animation[]>([]);
  function commit(next: View) {
    motionRef.current?.capture();
    opponentBefore.current = Array.from(
      document.querySelectorAll<HTMLElement>('[data-opponent-card]'),
    ).map((el) => el.getBoundingClientRect());
    gRef.current = next;
    setG(next);
  }
  async function receive(
    next: View,
    action: string,
    cardId?: string,
    animate?: () => Promise<void>,
  ) {
    const previous = gRef.current;
    if (
      previous?.code === next.code &&
      previous.revision !== undefined &&
      previous.revision >= (next.revision ?? -1)
    )
      return;
    if (animate) {
      await animate();
      commit(next);
      return;
    }
    const event = previous ? opponentTransition(previous, next) : null;
    if (event) {
      const source =
        event.kind === 'draw'
          ? document.querySelector<HTMLElement>(
              event.open ? '[data-discard-card]' : '[data-draw-card]',
            )
          : document.querySelector<HTMLElement>(
              '[data-opponent-card]:last-child',
            );
      const target = document.querySelector<HTMLElement>(
        event.kind === 'draw'
          ? '[data-opponent-card]:last-child'
          : '[data-discard-card]',
      );
      if (source && target) {
        presenting.current = true;
        setBusy(true);
        try {
          await flightMotion.fly(
            source.getBoundingClientRect(),
            event.kind === 'draw'
              ? (() => {
                  const r = target.getBoundingClientRect();
                  const step =
                    r.width +
                    parseFloat(getComputedStyle(target).marginLeft || '0');
                  return new DOMRect(
                    r.left + step / 2,
                    r.top,
                    r.width,
                    r.height,
                  );
                })()
              : target.getBoundingClientRect(),
            event.card,
            event.label,
            () => commit(next),
            event.kind === 'discard' ? source : null,
          );
        } finally {
          presenting.current = false;
          setBusy(false);
        }
        return;
      }
    }
    if (
      previous &&
      previous.round === next.round &&
      !motionRef.current?.isDragging()
    ) {
      if ((action === 'discard' || action === 'declare') && cardId) {
        const source = Array.from(
          document.querySelectorAll<HTMLElement>('[data-card]'),
        ).find((el) => el.dataset.card === cardId);
        const target = document.querySelector<HTMLElement>(
          '[data-discard-card]',
        );
        const card = previous.players[previous.me].hand.find(
          (c) => c.id === cardId,
        );
        if (source && target && card) {
          await flightMotion.fly(
            source.getBoundingClientRect(),
            target.getBoundingClientRect(),
            card,
            'Discarding your card',
            () => commit(next),
            source,
          );
          return;
        }
      }
      if (action === 'draw' || action === 'open') {
        const card = next.players[next.me].hand.find(
          (c) =>
            !previous.players[previous.me].hand.some((old) => old.id === c.id),
        );
        const source = document.querySelector<HTMLElement>(
          action === 'draw' ? '[data-draw-card]' : '[data-discard-card]',
        );
        if (card && source) {
          const from = source.getBoundingClientRect();
          const to = await motionRef.current?.reserve();
          if (to) {
            await flightMotion.fly(from, to, card, 'Drawing your card', () => {
              motionRef.current?.fill(card.id);
              commit(next);
            });
            return;
          }
        }
      }
    }
    commit(next);
  }
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mehfil-seat');
      if (saved) setSeat(JSON.parse(saved));
      setName(localStorage.getItem('mehfil-name') || '');
      setCode(new URLSearchParams(location.search).get('room') || '');
    } catch {}
  }, []);
  async function call(
    action: string,
    cardId?: string,
    current = seat,
    animate?: () => Promise<void>,
  ) {
    if (presenting.current) return;
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
      await receive(data.game, action, cardId, animate);
      setConnection(true);
      if (action === 'create' || action === 'join' || action === 'practice') {
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
  useLayoutEffect(() => {
    const key = `${g?.code}/${g?.round}`;
    setOrder((old) => {
      if (handRound.current !== key) {
        handRound.current = key;
        return [
          GROUP + 'a',
          ...hand.slice(0, 7).map((c) => c.id),
          GROUP + 'b',
          ...hand.slice(7).map((c) => c.id),
        ];
      }
      const retained = old.filter(
        (id) => isGroup(id) || id === INCOMING || hand.some((c) => c.id === id),
      );
      return [
        ...(retained.some(isGroup) ? retained : [GROUP + 'a']),
        ...hand.filter((c) => !retained.includes(c.id)).map((c) => c.id),
      ];
    });
  }, [handKey, g?.code, g?.round]);
  const mine = !!g && g.turn === g.me && g.status === 'playing';
  const mayDiscard = mine && g?.phase === 'discard';
  const other = g?.players[1 - g.me];
  useLayoutEffect(() => {
    const previous = opponentBefore.current;
    opponentBefore.current = [];
    opponentAnimations.current.forEach((a) => a.cancel());
    opponentAnimations.current = [];
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document
      .querySelectorAll<HTMLElement>('[data-opponent-card]')
      .forEach((el, i) => {
        const old = previous[i];
        if (!old) return;
        const r = el.getBoundingClientRect();
        if (Math.abs(old.left - r.left) < 1) return;
        opponentAnimations.current.push(
          el.animate(
            [
              { translate: `${old.left - r.left}px ${old.top - r.top}px` },
              { translate: '0 0' },
            ],
            { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' },
          ),
        );
      });
  }, [other?.count]);
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
        ) || null
      );
    },
    async (id, animate) => {
      if (!mayDiscard) {
        setError('Draw a card on your turn before discarding.');
        return false;
      }
      return !!(await call('discard', id, seat, animate));
    },
    `${g?.code}/${g?.round}/${g?.status}`,
  );
  motionRef.current = motion;
  const drag = motion.drag;
  const handGroups = splitGroups(order).map((group) => ({
    ...group,
    cards: group.ids
      .map((id) =>
        id === INCOMING
          ? { id: INCOMING, r: 0, s: 0 }
          : hand.find((c) => c.id === id),
      )
      .filter((c): c is Card => !!c)
      .filter(
        (c) =>
          !(
            drag?.source === 'draw' &&
            drag.id === INCOMING &&
            c.id === drag.face?.id
          ),
      ),
  }));
  const groupInfo = handGroups.map((group) =>
    describeGroup(
      group.cards.filter((c) => c.id !== INCOMING),
      g?.wild.r || 1,
    ),
  );
  const validCount = handGroups.reduce(
    (sum, group, i) =>
      sum +
      (groupInfo[i].valid
        ? group.cards.filter((c) => c.id !== INCOMING).length
        : 0),
    0,
  );
  const sequenceCount = groupInfo.filter((info) => info.sequence).length;
  async function arrange() {
    if (!hand.length || arranging) return;
    setArranging(true);
    try {
      if (!arrangeWorker.current)
        arrangeWorker.current = new Worker(
          new URL('../lib/arrange.worker.ts', import.meta.url),
          { type: 'module' },
        );
      const worker = arrangeWorker.current;
      while (gRef.current) {
        const current = gRef.current;
        const currentHand = current.players[current.me].hand;
        const fingerprint = JSON.stringify([
          current.code,
          current.round,
          currentHand,
          current.wild,
          current.picked,
        ]);
        const groups = await new Promise<string[][]>((resolve, reject) => {
          worker.onmessage = (
            event: MessageEvent<{ groups?: string[][]; error?: string }>,
          ) =>
            event.data.error
              ? reject(new Error(event.data.error))
              : resolve(event.data.groups || []);
          worker.onerror = () => {
            worker.terminate();
            arrangeWorker.current = null;
            reject(new Error('Arrange could not finish. Please try again.'));
          };
          worker.postMessage({
            hand: currentHand,
            wild: current.wild.r,
            picked: current.picked || null,
          });
        });
        const latest = gRef.current;
        if (!latest) break;
        if (
          fingerprint !==
          JSON.stringify([
            latest.code,
            latest.round,
            latest.players[latest.me].hand,
            latest.wild,
            latest.picked,
          ])
        )
          continue;
        motion.sort(
          groups.flatMap((ids) => [
            GROUP + String(++groupCounter.current),
            ...ids,
          ]),
        );
        setSelected(null);
        break;
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not arrange this hand.',
      );
    } finally {
      setArranging(false);
    }
  }
  function leave() {
    localStorage.removeItem('mehfil-seat');
    setSeat(null);
    gRef.current = null;
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
      {flightMotion.flight && (
        <div
          ref={flightMotion.element}
          className={`playing-card flight-card ${flightMotion.flight.card?.s && flightMotion.flight.card.s % 2 ? 'red' : ''} ${!flightMotion.flight.card ? 'card-back' : ''}`}
          style={{
            left: flightMotion.flight.from.left,
            top: flightMotion.flight.from.top,
            width: flightMotion.flight.width,
            height: flightMotion.flight.height,
            transform: `scale(${flightMotion.flight.from.width / flightMotion.flight.width},${flightMotion.flight.from.height / flightMotion.flight.height})`,
          }}
          aria-hidden="true"
        >
          {flightMotion.flight.card ? (
            <Face c={flightMotion.flight.card} />
          ) : (
            <b>✦</b>
          )}
        </div>
      )}
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
          <span className="brand-icon">♠</span>
          <span>
            mehfil<span className="brand-dot">.</span>
          </span>
          <small>THE RUMMY CLUB</small>
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
              <span className="eyebrow welcome-badge">
                ✦ BIG FUN. THIRTEEN CARDS.
              </span>
              <h1>
                Your table.
                <br />
                <span>Your happy place.</span>
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
              <div className="practice-option">
                <span>OR PRACTISE SOLO</span>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => call('practice', undefined, null)}
                >
                  ♧ Play against bot
                </button>
                <small>No invite needed. Same rules, your own pace.</small>
              </div>
              <small>Private tables · Just for fun</small>
              {seat && (
                <button className="quiet" onClick={leave}>
                  Clear saved seat
                </button>
              )}
            </div>
            <div className="welcome-buddy">
              <img src="/buddy.png" alt="Your cheerful robot card buddy" />
              <span>
                Meet your new
                <br />
                <strong>card buddy!</strong>
              </span>
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
              {other?.bot ? (
                <span className="practice-label">♧ PRACTICE TABLE</span>
              ) : (
                <button className="quiet room" onClick={invite}>
                  ROOM {g.code} <span>↗ Invite</span>
                </button>
              )}
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
                  <div className="avatar">
                    {other?.bot ? (
                      <img src="/buddy.png" alt="" />
                    ) : (
                      other?.name[0]?.toUpperCase()
                    )}
                  </div>
                  <div>
                    <strong>{other?.name}</strong>
                    <small>
                      {g.status === 'ended'
                        ? 'Round complete'
                        : !mine
                          ? other?.bot
                            ? g.phase === 'draw'
                              ? 'Drawing…'
                              : 'Choosing a discard…'
                            : 'Playing…'
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
                    <div data-opponent-card className="card-back" key={i}>
                      ✦
                    </div>
                  ))}
                </div>
                <div className="center-label">
                  <span className="eyebrow">
                    ROUND {String(g.round).padStart(2, '0')}
                  </span>
                  <h2>
                    {flightMotion.flight
                      ? flightMotion.flight.label
                      : g.status === 'ended'
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
                    <div data-draw-card className="card-back deck">
                      <span>✦</span>
                    </div>
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
                      data-discard-card
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
                  ✦
                  <span>
                    GOOD CARDS.
                    <br />
                    GREAT COMPANY.
                  </span>
                </div>
                <div className="hand-area">
                  <div className="hand-heading">
                    <div className="you">
                      <span className={`status-dot ${mine ? 'lit' : ''}`} />
                      <strong>{g.players[g.me].name}</strong>
                      <span>You · {hand.length} cards</span>
                    </div>
                    <div className="hand-tools">
                      <button
                        className="quiet"
                        disabled={
                          !hand.length ||
                          handGroups.length >= hand.length + 1 ||
                          !!drag ||
                          !!flightMotion.flight ||
                          arranging
                        }
                        onClick={() =>
                          motion.sort([
                            ...order,
                            GROUP + String(++groupCounter.current),
                          ])
                        }
                      >
                        + Group
                      </button>
                      <button
                        className="arrange-button"
                        disabled={
                          !hand.length ||
                          !!drag ||
                          !!flightMotion.flight ||
                          arranging
                        }
                        onClick={arrange}
                      >
                        {arranging ? 'Arranging…' : '✦ Arrange'}
                      </button>
                    </div>
                  </div>
                  <div
                    ref={motion.hand}
                    className={`hand ${drag && drag.source !== 'hand' ? 'hand-receiving' : ''}`}
                    aria-label="Your hand"
                  >
                    {handGroups.map((group, index) => {
                      const info = groupInfo[index];
                      return (
                        <section
                          key={group.id}
                          data-hand-group={group.id}
                          className={`hand-group group-${info.kind} ${group.cards.length > 7 ? 'group-scroll' : ''}`}
                        >
                          <div className="group-label">
                            <span>
                              {info.valid ? '✓ ' : ''}
                              {info.label}
                            </span>
                            <small>
                              {
                                group.cards.filter((c) => c.id !== INCOMING)
                                  .length
                              }
                            </small>
                          </div>
                          <div className="group-cards">
                            {group.cards.map((c) => (
                              <button
                                data-card={c.id}
                                aria-label={`${rank(c.r)} ${suit[c.s]}`}
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
                            {!group.cards.length && (
                              <span className="empty-group">
                                Drop a card here
                              </span>
                            )}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                  <div className="group-progress" aria-live="polite">
                    <span
                      className={
                        groupInfo.some((info) => info.pure) ? 'complete' : ''
                      }
                    >
                      {groupInfo.some((info) => info.pure) ? '✓' : '○'} Pure
                      sequence
                    </span>
                    <span className={sequenceCount >= 2 ? 'complete' : ''}>
                      {Math.min(sequenceCount, 2)}/2 sequences
                    </span>
                    <span>
                      {validCount}/{hand.length} grouped
                    </span>
                  </div>
                  <div className="hand-hint">
                    Arrange prioritizes a pure sequence, two sequences, then the
                    most grouped cards. Drag between groups to adjust.
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
