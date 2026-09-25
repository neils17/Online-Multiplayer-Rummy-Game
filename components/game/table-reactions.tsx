'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@/components/ui/popover';
import { REACTIONS } from '@/lib/reactions';
import type { TableReaction } from '@/lib/game';
export function TableReactions({
  seat,
  players,
  me,
  reactions,
}: {
  seat: { code: string; token: string };
  players: { name: string }[];
  me: number;
  reactions: TableReaction[];
}) {
  const [open, setOpen] = useState(false),
    [sending, setSending] = useState(false),
    [error, setError] = useState('');
  const [local, setLocal] = useState<TableReaction | null>(null),
    [now, setNow] = useState(Date.now);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const all = [...reactions, ...(local ? [local] : [])];
  const latest = players.map(
    (_, i) => all.filter((r) => r.player === i).sort((a, b) => b.at - a.at)[0],
  );
  const fingerprint = latest.map((r) => r?.id).join('|');
  useEffect(() => {
    const remaining = latest
      .filter((r) => r && r.at + 7000 > now)
      .map((r) => r!.at + 7000 - Date.now());
    if (!remaining.length) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(20, Math.min(...remaining) + 20),
    );
    return () => clearTimeout(timer);
  }, [fingerprint, now]);
  async function send(gif: string) {
    if (sending) return;
    setSending(true);
    setOpen(false);
    setError('');
    try {
      const r = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...seat,
          action: 'reaction',
          gif,
          reactionId: crypto.randomUUID(),
        }),
      });
      const data = await r.json() as { error?: string; reaction: TableReaction };
      if (!r.ok) throw Error(data.error || 'Reaction could not be sent.');
      if (mounted.current) setLocal(data.reaction);
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : 'Reaction could not be sent.',
        );
    } finally {
      if (mounted.current) setSending(false);
    }
  }
  return (
    <div className="table-reactions">
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger
          className="reaction-trigger"
          disabled={sending}
          aria-label="Send a GIF reaction"
        >
          ☺ GIF
        </PopoverTrigger>
        <PopoverContent className="reaction-menu" align="end" side="bottom">
          <PopoverTitle>Send a reaction</PopoverTitle>
          <div className="reaction-options">
            {REACTIONS.map((r) => (
              <button
                key={r.id}
                onClick={() => send(r.id)}
                aria-label={`Send ${r.label}`}
              >
                <img
                  src={`/reactions/${r.id}.gif`}
                  alt=""
                  width={120}
                  height={74}
                  loading="lazy"
                />
                <span>{r.label}</span>
              </button>
            ))}
          </div>
          <small>Both players see it. Play keeps going.</small>
        </PopoverContent>
      </Popover>
      <div className="reaction-bubbles" aria-live="polite" aria-atomic="true">
        {latest.map(
          (r, i) =>
            r &&
            r.at + 7000 > now &&
            REACTIONS.some((g) => g.id === r.gif) && (
              <div key={r.id} className="reaction-bubble">
                <strong>{i === me ? 'You' : players[i].name}</strong>
                <img
                  src={`/reactions/${r.gif}.gif`}
                  alt={REACTIONS.find((g) => g.id === r.gif)!.label}
                  width={150}
                  height={92}
                />
              </div>
            ),
        )}
      </div>
      {error && (
        <span
          className="reaction-error"
          role="status"
          onClick={() => setError('')}
        >
          {error}
        </span>
      )}
    </div>
  );
}
