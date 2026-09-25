'use client';
import {
  useEffect,
  useState,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from 'react';
import { fitReview } from '@/lib/review-layout';
import ArrangeWorker from '@/lib/arrange.worker?worker';
import { describeGroup } from '@/lib/arrange';
import {
  type Card,
  type RoundResult,
  type HandLayout,
  value,
} from '@/lib/game';
import { CardFace } from './card-face';
type ResultGame = {
  code: string;
  round: number;
  message: string;
  wild: Card;
  players: {
    name: string;
    hand: Card[];
    score: number;
    draws: number;
    layout?: HandLayout;
  }[];
  history: RoundResult[];
};
export function RoundHands({
  game,
  playerIndex = 0,
}: {
  game: ResultGame;
  playerIndex?: number;
}) {
  const [grouped, setGrouped] = useState<string[][][] | null>(null);
  const [optimalViews, setOptimalViews] = useState([false, false]);
  const [failed, setFailed] = useState(false);
  const fingerprint = JSON.stringify([
    game.code,
    game.round,
    game.players.map((p) => p.hand),
  ]);
  useEffect(() => {
    setGrouped(null);
    setOptimalViews([false, false]);
    setFailed(false);
    const worker = new ArrangeWorker();
    let player = 0;
    const results: string[][][] = [];
    worker.onmessage = (
      event: MessageEvent<{ groups?: string[][]; error?: string }>,
    ) => {
      if (event.data.error || !event.data.groups) {
        setFailed(true);
        worker.terminate();
        return;
      }
      results.push(event.data.groups);
      player++;
      if (player < game.players.length)
        worker.postMessage({
          hand: game.players[player].hand,
          wild: game.wild.r,
          forPoints: true,
        });
      else {
        setGrouped(results);
        worker.terminate();
      }
    };
    worker.onerror = () => {
      setFailed(true);
      worker.terminate();
    };
    worker.postMessage({
      hand: game.players[0].hand,
      wild: game.wild.r,
      forPoints: true,
    });
    return () => worker.terminate();
  }, [fingerprint]);
  const round = game.history.at(-1);
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 280 });
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      setSize((old) =>
        old.width === el.clientWidth && old.height === el.clientHeight
          ? old
          : { width: el.clientWidth, height: el.clientHeight },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [playerIndex]);
  const counts = game.players.flatMap((p, i) => {
    const layout = round?.actualLayouts?.[i] || p.layout;
    const actual = (layout?.groups || [p.hand.map((c) => c.id)])
      .map((g) => g.filter((id) => p.hand.some((c) => c.id === id)).length)
      .filter(Boolean);
    if (layout?.discardId && p.hand.some((c) => c.id === layout.discardId))
      actual.push(1);
    const optimal =
      grouped?.[i]?.map((g) => g.length).filter(Boolean) || actual;
    if (round?.discard && round.winner === i) {
      actual.push(1);
      if (optimal !== actual) optimal.push(1);
    }
    return [actual, optimal];
  });
  const fit = fitReview(counts, size.width, size.height);
  const showOptimal = optimalViews[playerIndex] || false;
  const layout =
    round?.actualLayouts?.[playerIndex] || game.players[playerIndex]?.layout;
  const actualGroups = layout?.groups ||
    (round?.declaredGroups?.player === playerIndex
      ? round.declaredGroups.groups
      : null) || [game.players[playerIndex].hand.map((c) => c.id)];
  return (
    <div
      className="round-review"
      style={
        {
          '--review-card': `${fit.card}px`,
          '--review-row': `${fit.rowHeight}px`,
        } as CSSProperties
      }
    >
      <div className="round-verdict">
        <span className="verdict-suit">♠</span>
        <div>
          <strong>{game.message}</strong>
          <p>
            Both hands revealed · Wild cards marked W · Dropped jokers marked
            Was Joker
          </p>
          {round?.multiplier === 2 && (
            <p className="bonus-calculation">
              {round.basePoints} base penalty × 2 ={' '}
              {round.points.find((p) => p > 0) || 0} points · Natural{' '}
              {round.bonus}
            </p>
          )}
        </div>
      </div>
      <div
        className="review-view-toggle"
        role="group"
        aria-label={`${game.players[playerIndex].name}'s grouping view`}
      >
        <button
          aria-pressed={!showOptimal}
          onClick={() =>
            setOptimalViews((old) =>
              old.map((v, i) => (i === playerIndex ? false : v)),
            )
          }
        >
          Player’s groups
        </button>
        <button
          aria-pressed={showOptimal}
          onClick={() =>
            setOptimalViews((old) =>
              old.map((v, i) => (i === playerIndex ? true : v)),
            )
          }
        >
          Optimal for points
        </button>
      </div>
      <p className="review-note">
        {showOptimal
          ? !grouped
            ? failed
              ? 'Optimal analysis unavailable. Showing the player’s groups.'
              : 'Finding the lowest possible hand penalty…'
            : 'Lowest possible hand penalty. Recorded round points stay unchanged.'
          : 'The player’s actual groups and card order at the end of the round.'}
      </p>
      {game.players.map((p, i) => {
        if (i !== playerIndex) return null;
        const optimal = showOptimal && grouped?.[i];
        let ids = optimal || actualGroups;
        const optimalDiscard =
          optimal && p.hand.length === 14 ? optimal.at(-1)?.[0] : undefined;
        if (optimalDiscard) ids = ids.slice(0, -1);
        const slotId = !optimal ? layout?.discardId : optimalDiscard;
        const slotCard = p.hand.find((c) => c.id === slotId);
        const groups = ids
          .filter((group) =>
            group.some((id) => p.hand.some((c) => c.id === id)),
          )
          .map((group) =>
            group
              .map((id) => p.hand.find((c) => c.id === id))
              .filter((c): c is Card => !!c),
          );
        const infos = groups.map((cards) => describeGroup(cards, game.wild.r));
        const pure = infos.filter((info) => info.pure).length;
        const sequences = infos.filter((info) => info.sequence).length;
        const melded = groups.reduce(
          (n, cards, j) => n + (infos[j].valid ? cards.length : 0),
          0,
        );
        return (
          <section className="review-player" key={i}>
            <div className="review-player-heading">
              <div>
                <h3>{p.name}</h3>
                <span>
                  {p.hand.length} cards · {p.draws} draws
                </span>
              </div>
              <div className="review-score">
                <strong>+{round?.points[i] || 0}</strong>
                <span>this round · {p.score} total</span>
              </div>
            </div>
            {round?.winner === i && round.bonus === 'sets' ? (
              <div className="review-requirements">
                <span className="met">
                  ✓ All-natural sets · Special winning hand · 2× points
                </span>
              </div>
            ) : (
              <div className="review-requirements">
                <span className={pure ? 'met' : ''}>
                  {pure ? '✓' : '○'} Pure sequence
                </span>
                <span className={sequences >= 2 ? 'met' : ''}>
                  {Math.min(sequences, 2)}/2 sequences
                </span>
                <span>
                  {melded}/{p.hand.length} in melds
                </span>
              </div>
            )}
            <div className="review-groups" ref={area}>
              {round?.discard && round.winner === i && (
                <div className="review-group winning-discard">
                  <div className="review-group-label">
                    <strong>Close Card</strong>
                  </div>
                  <div className="review-cards">
                    <div className="playing-card">
                      <CardFace c={round.discard} />
                    </div>
                  </div>
                </div>
              )}
              {slotCard && (
                <div className="review-group winning-discard">
                  <div className="review-group-label">
                    <strong>Close Card</strong>
                  </div>
                  <div className="review-cards">
                    <div className="playing-card">
                      <CardFace c={slotCard} w={game.wild.r} />
                    </div>
                  </div>
                </div>
              )}
              {groups.map((cards, j) => (
                <div
                  className={`review-group group-${infos[j].kind}`}
                  key={j}
                  style={{
                    width: Math.max(82, cards.length * (fit.card + 3) - 3 + 14),
                  }}
                >
                  <div className="review-group-label">
                    <strong>{infos[j].label}</strong>
                    <span>{cards.length} cards</span>
                  </div>
                  <div className="review-cards">
                    {cards.map((c) => (
                      <div className="playing-card" key={c.id}>
                        <CardFace c={c} w={game.wild.r} />
                      </div>
                    ))}
                  </div>
                  {!infos[j].valid && (
                    <small>
                      {cards.reduce((n, c) => n + value(c, game.wild.r), 0)}{' '}
                      card points · incomplete group
                    </small>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
