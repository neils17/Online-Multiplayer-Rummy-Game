'use client';
import { useRef, useState, useEffect } from 'react';
import type { Card } from '@/lib/game';
export type Flight = {
  from: DOMRect;
  to: DOMRect;
  card: Card | null;
  label: string;
  width: number;
  height: number;
};
export function useCardFlight() {
  const [flight, setFlight] = useState<Flight | null>(null);
  const element = useRef<HTMLDivElement>(null);
  const running = useRef<Animation | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      running.current?.cancel();
    };
  }, []);
  async function fly(
    from: DOMRect,
    to: DOMRect,
    card: Card | null,
    label: string,
    commit: () => void,
    source?: HTMLElement | null,
  ) {
    if (!alive.current) return;
    const visibility = source?.style.visibility;
    if (source) source.style.visibility = 'hidden';
    const width = Math.max(from.width, to.width),
      height = Math.max(from.height, to.height);
    setFlight({ from, to, card, label, width, height });
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    const el = element.current;
    if (el && alive.current) {
      const dx = to.left - from.left,
        dy = to.top - from.top;
      const sx = to.width / width,
        sy = to.height / height,
        startX = from.width / width,
        startY = from.height / height;
      const animation = el.animate(
        [
          {
            transform: `translate3d(0,0,0) rotate(0deg) scale(${startX},${startY})`,
          },
          {
            transform: `translate3d(${dx * 0.48}px,${dy * 0.48 - 24}px,0) rotate(${dx < 0 ? -5 : 5}deg) scale(${(startX + sx) / 2},${(startY + sy) / 2})`,
            offset: 0.48,
          },
          {
            transform: `translate3d(${dx}px,${dy}px,0) rotate(0deg) scale(${sx},${sy})`,
          },
        ],
        {
          duration: matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 0
            : 540,
          easing: 'cubic-bezier(.3,.05,.18,1)',
          fill: 'forwards',
        },
      );
      running.current = animation;
      try {
        await animation.finished;
      } catch {}
    }
    if (alive.current) {
      commit();
      if (source) source.style.visibility = visibility || '';
      setFlight(null);
    }
    running.current = null;
  }
  return { flight, element, fly };
}
