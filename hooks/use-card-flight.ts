'use client';
import { useRef, useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import type { Card } from '@/lib/game';
export type Flight = {
  from: DOMRect;
  card: Card | null;
  label: string;
  width: number;
  height: number;
};
export function useCardFlight() {
  const [flight, setFlight] = useState<Flight | null>(null);
  const element = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancel.current?.();
    };
  }, []);
  async function fly(
    from: DOMRect,
    destination: DOMRect | (() => DOMRect),
    card: Card | null,
    label: string,
    commit: () => void,
    source?: HTMLElement | null,
    begin?: () => void,
  ) {
    if (!alive.current) return;
    // The action queue owns flight order; each flight cleans up its own layer.
    cancel.current?.();
    const target = () =>
      typeof destination === 'function' ? destination() : destination;
    const to = target();
    const width = Math.max(from.width, to.width),
      height = Math.max(from.height, to.height);
    const visibility = source?.style.visibility;
    flushSync(() => {
      setFlight({ from, card, label, width, height });
      begin?.();
    });
    if (source) source.style.visibility = 'hidden';
    try {
      await new Promise<void>((resolve) => {
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        let raf = 0,
          previous = 0,
          elapsed = 0;
        const position = [from.left, from.top, from.width, from.height];
        const velocity = [0, 0, 0, 0];
        const stop = () => {
          cancelAnimationFrame(raf);
          resolve();
        };
        cancel.current = stop;
        const tick = (now: number) => {
          if (!alive.current) {
            stop();
            return;
          }
          const dt = Math.min((now - (previous || now - 16.67)) / 1000, 0.032);
          previous = now;
          elapsed += dt;
          const r = target(),
            goal = [r.left, r.top, r.width, r.height];
          // Analytic critically damped spring: continuous velocity even if Arrange
          // or a hand drag changes the receiving slot during the flight.
          const omega = 18,
            decay = Math.exp(-omega * dt);
          for (let i = 0; i < 4; i++) {
            const delta = position[i] - goal[i];
            const coefficient = velocity[i] + omega * delta;
            position[i] = goal[i] + (delta + coefficient * dt) * decay;
            velocity[i] = (velocity[i] - omega * coefficient * dt) * decay;
          }
          const settled =
            position.every((p, i) => Math.abs(p - goal[i]) < 0.2) &&
            velocity.every((v) => Math.abs(v) < 3);
          if (reduced || (elapsed > 0.35 && settled)) {
            if (element.current)
              element.current.style.transform = `translate3d(${r.left - from.left}px,${r.top - from.top}px,0) scale(${r.width / width},${r.height / height})`;
            stop();
            return;
          }
          const tilt = Math.max(-3, Math.min(3, velocity[0] / 140));
          if (element.current)
            element.current.style.transform = `translate3d(${position[0] - from.left}px,${position[1] - from.top}px,0) rotate(${tilt}deg) scale(${position[2] / width},${position[3] / height})`;
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      });
      if (alive.current)
        flushSync(() => {
          commit();
          setFlight(null);
        });
    } finally {
      if (source) source.style.visibility = visibility || '';
      cancel.current = null;
    }
  }
  return { flight, element, fly };
}
