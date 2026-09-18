'use client';
import { useEffect, useState } from 'react';
import ArrangeWorker from '@/lib/arrange.worker?worker';
import { describeGroup } from '@/lib/arrange';
import { type Card, type RoundResult, value } from '@/lib/game';
import { CardFace } from './card-face';
type ResultGame = {
  code: string;
  round: number;
  message: string;
  wild: Card;
  players: { name: string; hand: Card[]; score: number; draws: number }[];
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
  const [failed, setFailed] = useState(false);
  const fingerprint = JSON.stringify([
    game.code,
    game.round,
    game.players.map((p) => p.hand),
  ]);
  useEffect(() => {
    setGrouped(null);
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
    worker.postMessage({ hand: game.players[0].hand, wild: game.wild.r });
    return () => worker.terminate();
  }, [fingerprint]);
  const round = game.history.at(-1);
  return (
    <div className="round-review">
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
      <p className="review-note">
        Best available groups for each final hand. Round penalties follow the
        declaration or drop result; grouping does not change the recorded score.
      </p>
      {!grouped && (
        <p role="status">
          {failed
            ? 'Showing final hands. Group analysis is unavailable.'
            : 'Finding each hand’s best sequences and sets…'}
        </p>
      )}
      {game.players.map((p, i) => {
        if (i !== playerIndex) return null;
        const groups = grouped?.[i]?.map((ids) =>
          ids.map((id) => p.hand.find((c) => c.id === id)!),
        ) || [p.hand];
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
              grouped && (
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
              )
            )}
            <div className="review-groups">
              {round?.discard && round.winner === i && (
                <div className="review-group winning-discard">
                  <div className="review-group-label">
                    <strong>Winning discard</strong>
                  </div>
                  <div className="review-cards">
                    <div className="playing-card">
                      <CardFace c={round.discard} />
                    </div>
                  </div>
                </div>
              )}
              {groups.map((cards, j) => (
                <div className={`review-group group-${infos[j].kind}`} key={j}>
                  <div className="review-group-label">
                    <strong>{grouped ? infos[j].label : 'Final hand'}</strong>
                    <span>{cards.length} cards</span>
                  </div>
                  <div className="review-cards">
                    {cards.map((c) => (
                      <div className="playing-card" key={c.id}>
                        <CardFace c={c} w={game.wild.r} />
                      </div>
                    ))}
                  </div>
                  {grouped && !infos[j].valid && (
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
