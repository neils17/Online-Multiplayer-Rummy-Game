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
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useViewportStage, useHandFit } from '@/hooks/use-table-layout';
import { preloadDeck } from '@/lib/card-preload';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { RulesPages } from '@/components/game/rules-pages';
import { RoundHands } from '@/components/game/round-hands';
import { CardFace as Face } from '@/components/game/card-face';
import { useCardFlight } from '@/hooks/use-card-flight';
import { opponentTransition, visibleDiscard } from '@/lib/transition';
import {
  describeGroup,
  splitGroups,
  removeGroup,
  pruneEmptiedGroups,
  isGroup,
  GROUP,
} from '@/lib/arrange';
import ArrangeWorker from '@/lib/arrange.worker?worker';
import { useCardMotion, INCOMING } from '@/hooks/use-card-motion';
import { type Card, type RoundResult, rank, suit } from '@/lib/game';
type View = {
  expert: boolean;
  maxScore: number;
  match: number;
  matchOver?: boolean;
  winner?: number | null;
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
  underDiscard?: Card | null;
  remaining: number;
  message: string;
  history: RoundResult[];
};
type Seat = { code: string; token: string };
export default function Home() {
  useViewportStage();
  useEffect(() => {
    void preloadDeck();
  }, []);
  const [name, setName] = useState('');
  const [expert, setExpert] = useState(false);
  const [maxScore, setMaxScore] = useState(101);
  const validOptions =
    Number.isInteger(maxScore) && maxScore >= 101 && maxScore <= 151;
  const [code, setCode] = useState('');
  const [seat, setSeat] = useState<Seat | null>(null);
  const [g, setG] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState(true);
  const [departingCard, setDepartingCard] = useState<string | null>(null);
  const [landingDiscard, setLandingDiscard] = useState<{
    card: Card | null;
  } | null>(null);
  const [liftedDiscard, setLiftedDiscard] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const groupCounter = useRef(0);
  const [arranging, setArranging] = useState(false);
  const arrangeWorker = useRef<Worker | null>(null);
  useEffect(() => () => arrangeWorker.current?.terminate(), []);
  const handRound = useRef('');
  const [rules, setRules] = useState(false);
  const [scores, setScores] = useState(false);
  const [scoreTab, setScoreTab] = useState(-1);
  const [scorePage, setScorePage] = useState(0);
  const [rulePage, setRulePage] = useState(0);
  const [confirm, setConfirm] = useState('');
  const inFlight = useRef(false);
  const requestEpoch = useRef(0);
  const actionQueue = useRef<Promise<unknown>>(Promise.resolve());
  const pendingActions = useRef(
    new Map<string, Promise<View | false | undefined>>(),
  );
  const gRef = useRef<View | null>(null);
  const motionRef = useRef<ReturnType<typeof useCardMotion> | null>(null);
  const flightMotion = useCardFlight();
  const presenting = useRef(false);
  const opponentBefore = useRef<DOMRect[]>([]);
  const opponentAnimations = useRef<Animation[]>([]);
  function commit(next: View) {
    const previous = gRef.current;
    if (
      !previous ||
      previous.code !== next.code ||
      previous.match !== next.match ||
      previous.round !== next.round ||
      previous.status !== next.status
    ) {
      setScores(next.status === 'ended');
      setScoreTab(-1);
      setScorePage(Math.max(0, Math.ceil(next.history.length / 5) - 1));
    }
    const key = `${next.code}/${next.match}/${next.round}`;
    if (
      handRound.current !== key ||
      (gRef.current?.status === 'waiting' && next.status === 'playing')
    ) {
      motionRef.current?.reset();
      handRound.current = key;
      const hand = next.players[next.me]?.hand || [];
      setOrder(
        next.expert
          ? [GROUP + 'expert', ...hand.map((c) => c.id)]
          : [
              GROUP + 'a',
              ...hand.slice(0, 7).map((c) => c.id),
              GROUP + 'b',
              ...hand.slice(7).map((c) => c.id),
            ],
      );
    } else motionRef.current?.capture();
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
    const epoch = requestEpoch.current;
    const apply = () => {
      if (epoch === requestEpoch.current) commit(next);
    };
    if (!gRef.current || gRef.current.code !== next.code) await preloadDeck();
    if (epoch !== requestEpoch.current) return;
    const previous = gRef.current;
    if (
      previous?.code === next.code &&
      previous.revision !== undefined &&
      previous.revision >= (next.revision ?? -1)
    )
      return;
    if (animate) {
      await animate();
      apply();
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
              `[data-opponent-slot="${(previous!.players[1 - previous!.me].count || 13) - 1}"]`,
            );
      const target = document.querySelector<HTMLElement>(
        event.kind === 'draw'
          ? `[data-opponent-slot="${next.players[1 - next.me].count - 1}"]`
          : '[data-discard-card]',
      );
      if (source && target) {
        presenting.current = true;
        try {
          if (event.kind === 'draw' && event.open)
            setLiftedDiscard(previous!.pile[0]?.id || null);
          await flightMotion.fly(
            source.getBoundingClientRect(),
            () => target.getBoundingClientRect(),
            event.card,
            event.label,
            () => {
              if (event.kind === 'discard') {
                setLandingDiscard(null);
                if (next.status !== 'playing') apply();
              } else apply();
            },
            event.kind === 'discard' && next.status !== 'playing'
              ? source
              : null,
            event.kind === 'discard'
              ? () => {
                  if (next.status === 'playing') {
                    setLandingDiscard({ card: previous!.pile[0] || null });
                    apply();
                  }
                }
              : undefined,
          );
        } finally {
          presenting.current = false;
          setLiftedDiscard(null);
          setLandingDiscard(null);
        }
        return;
      }
    }
    if (
      previous &&
      previous.round === next.round &&
      !motionRef.current?.isDragging()
    ) {
      const discardedId =
        action === 'declare'
          ? previous.players[previous.me].hand.find(
              (c) => !next.players[next.me].hand.some((n) => n.id === c.id),
            )?.id
          : cardId;
      if ((action === 'discard' || action === 'declare') && discardedId) {
        const source = Array.from(
          document.querySelectorAll<HTMLElement>('[data-card]'),
        ).find((el) => el.dataset.card === discardedId);
        const target = document.querySelector<HTMLElement>(
          '[data-discard-card]',
        );
        const card = previous.players[previous.me].hand.find(
          (c) => c.id === discardedId,
        );
        if (source && target && card) {
          await flightMotion.fly(
            source.getBoundingClientRect(),
            target.getBoundingClientRect(),
            card,
            'Discarding your card',
            () => {
              if (next.status !== 'playing') apply();
              setLandingDiscard(null);
              setDepartingCard(null);
            },
            source,
            () => {
              if (next.status === 'playing') {
                setLandingDiscard({ card: previous.pile[0] || null });
                apply();
              } else setDepartingCard(card.id);
            },
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
            if (action === 'open')
              setLiftedDiscard(previous.pile[0]?.id || null);
            try {
              await flightMotion.fly(
                from,
                () => motionRef.current?.incomingRect() || to,
                card,
                'Drawing your card',
                () => {
                  if (epoch !== requestEpoch.current) return;
                  motionRef.current?.fill(card.id);
                  apply();
                },
              );
            } finally {
              setLiftedDiscard(null);
            }
            return;
          }
        }
      }
    }
    if (action === 'draw' && previous) {
      const drawn = next.players[next.me].hand.find(
        (c) =>
          !previous.players[previous.me].hand.some((old) => old.id === c.id),
      );
      if (drawn) motionRef.current?.reveal(drawn);
    }
    apply();
  }
  useEffect(() => {
    try {
      const saved =
        localStorage.getItem('rummy-seat') ||
        localStorage.getItem('mehfil-seat');
      if (saved) localStorage.setItem('rummy-seat', saved);
      localStorage.removeItem('mehfil-seat');
      if (saved) setSeat(JSON.parse(saved));
      setName(
        localStorage.getItem('rummy-name') ||
          localStorage.getItem('mehfil-name') ||
          '',
      );
      localStorage.removeItem('mehfil-name');
      setCode(new URLSearchParams(location.search).get('room') || '');
    } catch {}
  }, []);
  async function executeCall(
    action: string,
    cardId?: string,
    current = seat,
    animate?: () => Promise<void>,
  ) {
    if (
      !gRef.current &&
      !['create', 'join', 'practice', 'poll'].includes(action)
    )
      return false;
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
          expert,
          maxScore,
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
      if (epoch !== requestEpoch.current) return false;
      await receive(data.game, action, cardId, animate);
      if (epoch !== requestEpoch.current) return false;
      setConnection(true);
      if (action === 'create' || action === 'join' || action === 'practice') {
        const s = { code: data.game.code, token: data.token };
        setSeat(s);
        localStorage.setItem('rummy-seat', JSON.stringify(s));
        localStorage.setItem('rummy-name', name);
      }
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
  function call(
    action: string,
    cardId?: string,
    current = seat,
    animate?: () => Promise<void>,
  ) {
    if (action === 'poll') {
      if (pendingActions.current.size || inFlight.current || presenting.current)
        return Promise.resolve(false as const);
      const poll = actionQueue.current.then(() =>
        executeCall(action, cardId, current, animate),
      );
      actionQueue.current = poll.catch(() => undefined);
      return poll;
    }
    const key = `${current?.code || code}/${action}/${cardId || ''}`;
    const pending = pendingActions.current.get(key);
    if (pending) return pending;
    const request = actionQueue.current.then(() =>
      executeCall(action, cardId, current, animate),
    );
    pendingActions.current.set(key, request);
    actionQueue.current = request.catch(() => undefined);
    void request.finally(() => pendingActions.current.delete(key));
    return request;
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
    const key = `${g?.code}/${g?.match}/${g?.round}`;
    setOrder((old) => {
      if (handRound.current !== key) {
        handRound.current = key;
        if (g?.expert) return [GROUP + 'expert', ...hand.map((c) => c.id)];
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
      const next = pruneEmptiedGroups(
        [
          ...(retained.some(isGroup) ? retained : [GROUP + 'a']),
          ...hand.filter((c) => !retained.includes(c.id)).map((c) => c.id),
        ],
        old,
      );
      return next.join('|') === old.join('|') ? old : next;
    });
  }, [handKey, g?.code, g?.match, g?.round, g?.expert]);
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
    async (source) => {
      const before = gRef.current?.players[gRef.current.me].hand || [];
      const result = await call(source);
      if (!result) return null;
      return (
        result.players[result.me].hand.find(
          (c) => !before.some((old) => old.id === c.id),
        ) || null
      );
    },
    async (id, animate) => {
      const latest = gRef.current;
      if (
        !latest ||
        latest.status !== 'playing' ||
        latest.turn !== latest.me ||
        latest.phase !== 'discard'
      ) {
        setError('Draw a card on your turn before discarding.');
        return false;
      }
      return !!(await call('discard', id, seat, animate));
    },
    `${g?.code}/${g?.match}/${g?.round}/${g?.status}`,
    (id) => {
      const latest = gRef.current;
      if (
        latest?.status === 'playing' &&
        latest.turn === latest.me &&
        latest.phase === 'discard' &&
        latest.players[latest.me].hand.length === 14 &&
        latest.picked !== id
      )
        void call('discard', id);
    },
  );
  motionRef.current = motion;
  const drag = motion.drag;
  const discardFace = landingDiscard
    ? landingDiscard.card
    : visibleDiscard(
        g?.pile[0],
        g?.underDiscard,
        drag?.source === 'open' ? drag.face?.id : liftedDiscard,
      );
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
  const handFit = useHandFit(
    motion.hand,
    handGroups.map((group) => group.cards.length),
    !!g?.expert,
  );
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
    if (!hand.length || arranging || g?.expert) return;
    setArranging(true);
    try {
      if (!arrangeWorker.current) arrangeWorker.current = new ArrangeWorker();
      const worker = arrangeWorker.current;
      while (gRef.current) {
        const current = gRef.current;
        if (current.expert) break;
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
    requestEpoch.current++;
    setScores(false);
    localStorage.removeItem('rummy-seat');
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
      className={`shell casino ${g ? 'game-shell' : ''} ${g?.expert ? 'expert-mode' : ''}`}
      onPointerMove={motion.move}
      onPointerUp={(e) => void motion.end(e)}
      onPointerCancel={(e) => void motion.end(e, true)}
      onClickCapture={motion.click}
    >
      {flightMotion.flight &&
        createPortal(
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
          </div>,
          document.body,
        )}
      {drag &&
        createPortal(
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
          </div>,
          document.body,
        )}
      <header>
        <div className="brand">
          <span className="brand-icon">♠</span>
          <span>Rummy</span>
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
                PRIVATE TABLES · CLASSIC RUMMY
              </span>
              <h1>
                Take your seat.
                <br />
                <span>Play your hand.</span>
              </h1>
              <p>Thirteen cards. Two players. A table of your own.</p>
              <div className="game-settings">
                <div className="expert-setting">
                  <div>
                    <label htmlFor="expert-mode">Expert mode</label>
                    <small>One row of cards. Arrange your hand yourself.</small>
                  </div>
                  <Switch
                    id="expert-mode"
                    checked={expert}
                    onCheckedChange={setExpert}
                  />
                </div>
                <div className="score-setting">
                  <label htmlFor="max-score">
                    Score limit <small>101–151 points</small>
                  </label>
                  <input
                    id="max-score"
                    type="number"
                    min={101}
                    max={151}
                    step={1}
                    value={maxScore || ''}
                    onChange={(e) => setMaxScore(Number(e.target.value))}
                  />
                </div>
                <input
                  className="score-slider"
                  aria-label="Score limit slider"
                  type="range"
                  min={101}
                  max={151}
                  step={1}
                  value={maxScore || 101}
                  onChange={(e) => setMaxScore(Number(e.target.value))}
                />
                <small>
                  Settings apply to new tables and bot games. Joining uses the
                  host’s settings.
                </small>
              </div>
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
                <button disabled={busy || !name.trim() || !validOptions}>
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
                  disabled={busy || !validOptions}
                  onClick={() => call('practice', undefined, null)}
                >
                  Play against the dealer
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
            <div className="casino-emblem" aria-hidden="true">
              <span className="emblem-suits">♠ ♦ ♣ ♥</span>
              <span className="emblem-name">RUMMY</span>
              <span className="emblem-rule" />
              <span className="emblem-caption">THE RUMMY CLUB</span>
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
                {g.expert ? 'Expert · ' : ''}Scores{' '}
                <strong>
                  {g.players[g.me].score} : {other?.score || 0}
                  <small className="score-limit"> / {g.maxScore}</small>
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
                <p>
                  {g.expert ? 'Expert mode' : 'Standard mode'} · {g.maxScore}
                  -point limit
                </p>
                <small>
                  Keep this browser open. Play starts when they join.
                </small>
                <button className="quiet" onClick={() => setConfirm('leave')}>
                  Leave table
                </button>
              </div>
            ) : (
              <>
                <div className="opponent-seat">
                  <div
                    className={`opponent ${!mine && g.status === 'playing' ? 'active-player' : ''}`}
                  >
                    <div className="avatar">
                      {other?.bot ? (
                        <span className="dealer-monogram">R</span>
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
                    {Array.from({ length: 14 }, (_, i) => (
                      <div
                        data-opponent-card={
                          i < (other?.count || 13) ? true : undefined
                        }
                        data-opponent-slot={i}
                        style={{
                          visibility:
                            i < (other?.count || 13) ? 'visible' : 'hidden',
                        }}
                        className="card-back"
                        key={i}
                      >
                        ✦
                      </div>
                    ))}
                  </div>
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
                    disabled={!mine || g.phase !== 'draw'}
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
                      if (mine && g.phase === 'draw' && !!g.pile[0])
                        motion.start(e, 'open', INCOMING, g.pile[0]);
                    }}
                    className={`pile-item pile-button discard ${drag && mayDiscard ? 'drop-ready' : ''}`}
                    onClick={() => {
                      if (g.phase === 'draw') void call('open');
                    }}
                    disabled={!mine || (g.phase === 'draw' && !g.pile[0])}
                  >
                    <div
                      data-discard-card
                      className={`playing-card ${discardFace?.s && discardFace.s % 2 ? 'red' : ''} ${!discardFace ? 'empty-discard' : ''}`}
                    >
                      {discardFace && <Face c={discardFace} />}
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
                    {!g.expert && (
                      <div className="hand-tools">
                        <button
                          className="quiet"
                          disabled={
                            !hand.length ||
                            handGroups.length >= hand.length + 1 ||
                            (!!drag && !drag.settling) ||
                            arranging
                          }
                          onClick={() => {
                            const id = GROUP + String(++groupCounter.current);
                            motion.sort([...order, id]);
                          }}
                        >
                          + Group
                        </button>
                        <button
                          className="arrange-button"
                          disabled={
                            !hand.length ||
                            (!!drag && !drag.settling) ||
                            arranging
                          }
                          onClick={arrange}
                        >
                          {arranging ? 'Arranging…' : '✦ Arrange'}
                        </button>
                      </div>
                    )}
                  </div>
                  <div
                    ref={motion.hand}
                    className={`hand ${drag && drag.source !== 'hand' ? 'hand-receiving' : ''}`}
                    style={
                      {
                        '--hand-card-width': `${handFit.card}px`,
                        '--hand-card-step': `${handFit.step}px`,
                      } as CSSProperties
                    }
                    aria-label="Your hand"
                  >
                    {handGroups.map((group, index) => {
                      const info = groupInfo[index];
                      return (
                        <section
                          key={group.id}
                          data-hand-group={group.id}
                          style={{
                            width: Math.max(
                              g.expert ? 0 : 64,
                              handFit.card +
                                Math.max(0, group.cards.length - 1) *
                                  handFit.step +
                                (g.expert ? 0 : 14),
                            ),
                          }}
                          className={`hand-group ${g.expert ? '' : `group-${info.kind}`} ${group.cards.length > 7 ? 'group-scroll' : ''}`}
                        >
                          {!g.expert && (
                            <div className="group-label">
                              <span title={info.label}>
                                {info.valid ? '✓ ' : ''}
                                {info.label}
                              </span>
                              <div className="group-label-tools">
                                <small>
                                  {
                                    group.cards.filter((c) => c.id !== INCOMING)
                                      .length
                                  }
                                </small>
                                <button
                                  className="remove-group"
                                  aria-label={`Remove ${info.label.toLowerCase()} group; keep its cards`}
                                  disabled={
                                    handGroups.length < 2 ||
                                    (!!drag && !drag.settling) ||
                                    arranging
                                  }
                                  onClick={() =>
                                    motion.sort(removeGroup(order, group.id))
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="group-cards">
                            {group.cards.map((c) => (
                              <button
                                data-card={c.id}
                                aria-label={`${rank(c.r)} ${suit[c.s]}`}
                                key={c.id}
                                className={`playing-card hand-card ${c.s % 2 ? 'red' : ''} ${drag?.id === c.id || departingCard === c.id ? 'drag-source' : ''} ${c.id === INCOMING ? 'incoming-slot' : ''}`}
                                onPointerDown={(e) => {
                                  if (c.id !== INCOMING)
                                    motion.start(e, 'hand', c.id, c);
                                }}
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
                  {!g.expert && (
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
                  )}
                  <div className="hand-hint">
                    Arrange prioritizes a pure sequence, two sequences, then the
                    most grouped cards. Invalid declarations cost 80 points.
                  </div>
                  <div className="actions">
                    <button
                      className="quiet"
                      disabled={g.status !== 'playing'}
                      onClick={() => setConfirm('drop')}
                    >
                      Drop round
                    </button>
                    <div>
                      {g.status === 'ended' ? (
                        <button
                          onClick={() =>
                            g.matchOver ? setScores(true) : call('next')
                          }
                          disabled={busy}
                        >
                          {g.matchOver
                            ? 'Final scoreboard ↗'
                            : 'Play next round ↗'}
                        </button>
                      ) : (
                        <>
                          <button
                            disabled={!mayDiscard || hand.length !== 14}
                            onClick={() => call('declare')}
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
          <span>{error}</span>
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
            'The private rummy club.'
          )}
        </span>
        <span>
          {g ? 'Drag or double-tap to discard' : 'PLAY FOR POINTS · NO STAKES'}
        </span>
        {g && (
          <button className="quiet" onClick={() => setConfirm('leave')}>
            Leave table
          </button>
        )}
      </footer>
      <Dialog open={rules} onOpenChange={setRules}>
        <DialogContent className="modal rules-modal">
          <DialogTitle>Thirteen cards. One winning hand.</DialogTitle>
          <DialogDescription>
            Two-player Indian points rummy · House rules
          </DialogDescription>
          <RulesPages page={rulePage} setPage={setRulePage} />
        </DialogContent>
      </Dialog>
      <Dialog open={scores} onOpenChange={setScores}>
        <DialogContent className="modal wide score-modal">
          <DialogTitle>
            {g?.matchOver
              ? 'Final scoreboard'
              : g?.status === 'ended'
                ? `Round ${g.round} · Table results`
                : 'The scorecard'}
          </DialogTitle>
          <DialogDescription>
            Penalty points · Lower is better
            {g ? ` · ${g.maxScore}-point limit` : ''}
          </DialogDescription>
          {g && (
            <>
              {g.matchOver && (
                <div className="match-winner">
                  <span>♠ MATCH COMPLETE</span>
                  <h2>
                    {g.winner === null || g.winner === undefined
                      ? 'A tied match'
                      : `${g.players[g.winner].name} wins`}
                  </h2>
                  <p>The {g.maxScore}-point limit has been reached.</p>
                  <div>
                    <button onClick={leave} className="secondary">
                      Return to menu
                    </button>
                    <button disabled={busy} onClick={() => call('restart')}>
                      Play again ↗
                    </button>
                  </div>
                </div>
              )}
              <nav className="panel-tabs" aria-label="Scoreboard views">
                <button
                  className={scoreTab === -1 ? 'chosen' : ''}
                  onClick={() => setScoreTab(-1)}
                >
                  Scores
                </button>
                {g.status === 'ended' &&
                  g.players.map((p, i) => (
                    <button
                      key={i}
                      className={scoreTab === i ? 'chosen' : ''}
                      onClick={() => setScoreTab(i)}
                    >
                      {p.name}’s hand
                    </button>
                  ))}
              </nav>
              <div className="score-panel" hidden={scoreTab !== -1}>
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
                      g.history
                        .slice(scorePage * 5, scorePage * 5 + 5)
                        .map((h) => (
                          <TableRow key={h.round}>
                            <TableCell>
                              {h.round}
                              {h.multiplier === 2 && (
                                <small className="bonus-tag">
                                  2× natural {h.bonus}
                                </small>
                              )}
                            </TableCell>
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
                <nav className="page-controls" aria-label="Score history pages">
                  <button
                    disabled={scorePage === 0}
                    onClick={() => setScorePage((p) => p - 1)}
                  >
                    ← Previous
                  </button>
                  <span>
                    {scorePage + 1} /{' '}
                    {Math.max(1, Math.ceil(g.history.length / 5))}
                  </span>
                  <button
                    disabled={(scorePage + 1) * 5 >= g.history.length}
                    onClick={() => setScorePage((p) => p + 1)}
                  >
                    Next →
                  </button>
                </nav>
              </div>
              {g.status === 'ended' && (
                <div className="score-panel" hidden={scoreTab === -1}>
                  <RoundHands game={g} playerIndex={Math.max(0, scoreTab)} />
                </div>
              )}
              {g.status === 'ended' && !g.matchOver && (
                <button
                  className="score-next"
                  disabled={busy}
                  onClick={() => call('next')}
                >
                  Play next round ↗
                </button>
              )}
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
            {confirm === 'drop' ? 'Drop this round?' : 'Leave this table?'}
          </DialogTitle>
          <DialogDescription>
            {confirm === 'drop'
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
              } else await call(a);
            }}
          >
            {confirm === 'drop' ? 'Drop round' : 'Leave table'}
          </button>
          <button className="quiet" onClick={() => setConfirm('')}>
            Keep playing
          </button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
