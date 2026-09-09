'use client';
import { useRef, useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
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
    const width = Math.max(from.width, to.width),
      height = Math.max(from.height, to.height);
    flushSync(() => setFlight({ from, to, card, label, width, height }));
    if (source) source.style.visibility = 'hidden';
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
      // Sample one continuous arc so direction and rotation never kink mid-flight.
      const frames = Array.from({ length: 31 }, (_, index) => {
        const t = index / 30;
        const x = dx * t;
        const y = dy * t - 60 * t * (1 - t);
        const turn = Math.sin(Math.PI * t) * (dx < 0 ? -4 : 4);
        return {
          offset: t,
          transform: `translate3d(${x}px,${y}px,0) rotate(${turn}deg) scale(${startX + (sx - startX) * t},${startY + (sy - startY) * t})`,
        };
      });
      const animation = el.animate(frames, {
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 0
          : Math.min(680, 440 + Math.hypot(dx, dy) * 0.22),
        easing: 'cubic-bezier(.22,.61,.36,1)',
        fill: 'forwards',
      });
      running.current = animation;
      try {
        await animation.finished;
      } catch {}
    }
    if (alive.current) {
      flushSync(() => {
        commit();
        setFlight(null);
      });
      if (source) source.style.visibility = visibility || '';
    }
    running.current = null;
  }
  return { flight, element, fly };
}
