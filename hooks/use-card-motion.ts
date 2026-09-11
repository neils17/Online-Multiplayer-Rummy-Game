'use client';
import { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { moveToGroup, pruneEmptiedGroups } from '@/lib/arrange';
import { flushSync } from 'react-dom';
import type { Card } from '@/lib/game';
export const INCOMING = '__incoming';
type Source = 'hand' | 'draw' | 'open';
type Gesture = {
  pointerId: number;
  id: string;
  source: Source;
  face: Card | null;
  origin: DOMRect;
  x: number;
  y: number;
  px: number;
  py: number;
  moved: boolean;
  settling: boolean;
  original: string[];
  group?: string;
  drawRequest?: Promise<Card | null>;
};
export function useCardMotion(
  order: string[],
  setOrder: React.Dispatch<React.SetStateAction<string[]>>,
  onDraw: (source: 'draw' | 'open') => Promise<Card | null>,
  onDiscard: (id: string, animate: () => Promise<void>) => Promise<boolean>,
  gameKey: string,
) {
  const [drag, setDrag] = useState<Gesture | null>(null);
  const active = useRef<Gesture | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const hand = useRef<HTMLDivElement>(null);
  const orderRef = useRef(order);
  const before = useRef(new Map<string, DOMRect>());
  const animations = useRef(new Map<HTMLElement, Animation>());
  const frame = useRef(0);
  const landingDone = useRef<(() => void) | null>(null);
  const lastPaint = useRef(0);
  const suppress = useRef(false);
  const suppressAt = useRef({ x: 0, y: 0 });
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elements = () =>
    Array.from(
      hand.current?.querySelectorAll<HTMLElement>('[data-card]') || [],
    );
  function snapshot() {
    before.current = new Map(
      elements().map((el) => [el.dataset.card!, el.getBoundingClientRect()]),
    );
  }
  function update(next: string[]) {
    next = pruneEmptiedGroups(next, orderRef.current);
    if (next.join('|') === orderRef.current.join('|')) return;
    snapshot();
    orderRef.current = next;
    setOrder(next);
  }
  useLayoutEffect(() => {
    orderRef.current = order;
    const previous = before.current;
    before.current = new Map();
    const els = elements();
    const starts = new Map(
      els.map((el) => [el, previous.get(el.dataset.card!)]),
    );
    animations.current.forEach((a) => a.cancel());
    animations.current.clear();
    const targets = els.map((el) => ({ el, r: el.getBoundingClientRect() }));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    targets.forEach(({ el, r }) => {
      const old = starts.get(el);
      if (el.dataset.card === active.current?.id) return;
      if (!old) return;
      const x = old.left - r.left,
        y = old.top - r.top;
      if (Math.abs(x) + Math.abs(y) < 1) return;
      const animation = el.animate(
        [{ translate: `${x}px ${y}px` }, { translate: '0px 0px' }],
        { duration: 340, easing: 'cubic-bezier(.2,.75,.2,1)' },
      );
      animations.current.set(el, animation);
    });
  }, [order]);
  function paint(now = performance.now()) {
    frame.current = 0;
    const d = active.current,
      el = ghost.current;
    if (!d || !el) return;
    const dx = d.px - d.x,
      dy = d.py - d.y;
    const tilt = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : Math.max(-7, Math.min(7, dx / 32));
    el.style.transform = `translate3d(${dx}px,${dy}px,0) rotate(${tilt}deg) scale(1.025)`;
    if (d.moved && !d.settling) {
      const dt = Math.min(
        32,
        Math.max(1, now - (lastPaint.current || now - 16)),
      );
      lastPaint.current = now;
      const rail = hand.current;
      if (rail && inHand(d.px, d.py)) {
        const rect = rail.getBoundingClientRect();
        const speed = (point: number, start: number, end: number) =>
          point < start + 32
            ? -Math.min(1, (start + 32 - point) / 32)
            : point > end - 32
              ? Math.min(1, (point - end + 32) / 32)
              : 0;
        rail.scrollLeft += speed(d.px, rect.left, rect.right) * dt * 0.55;
        rail.scrollTop += speed(d.py, rect.top, rect.bottom) * dt * 0.55;
        placeInHand(d, d.px, d.py);
      } else if (d.source !== 'hand' && orderRef.current.includes(INCOMING)) {
        update(orderRef.current.filter((id) => id !== INCOMING));
      }
      frame.current = requestAnimationFrame(paint);
    }
  }
  useLayoutEffect(() => {
    if (drag && !frame.current) frame.current = requestAnimationFrame(paint);
  }, [drag]);
  function start(
    e: React.PointerEvent<HTMLButtonElement>,
    source: Source,
    id: string,
    face: Card | null,
  ) {
    if (e.button !== 0 || active.current) return;
    const card =
      source === 'hand'
        ? e.currentTarget
        : e.currentTarget.querySelector<HTMLElement>('.playing-card,.deck');
    if (!card) return;
    const origin = card.getBoundingClientRect();
    const d: Gesture = {
      pointerId: e.pointerId,
      id,
      source,
      face: face ? { ...face } : null,
      origin,
      x: e.clientX,
      y: e.clientY,
      px: e.clientX,
      py: e.clientY,
      moved: false,
      settling: false,
      original: [...orderRef.current],
    };
    active.current = d;
    // A closed-deck pointer press commits exactly one draw. The server reveals
    // only the card now owned by this player; no deck preview is exposed.
    if (source !== 'hand') setDrag({ ...d });
    if (source === 'draw')
      d.drawRequest = onDraw('draw').then((card) => {
        if (card && active.current === d) {
          d.face = card;
          setDrag({ ...d });
        }
        return card;
      });
    e.currentTarget.closest('main')?.setPointerCapture(e.pointerId);
  }
  function inHand(x: number, y: number) {
    const r = hand.current?.getBoundingClientRect();
    return (
      !!r &&
      x >= r.left - 18 &&
      x <= r.right + 18 &&
      y >= r.top - 30 &&
      y <= r.bottom + 25
    );
  }
  function placeInHand(d: Gesture, x: number, y: number) {
    const zones = Array.from(
      hand.current?.querySelectorAll<HTMLElement>('[data-hand-group]') || [],
    );
    let zone = zones[0],
      distance = Infinity;
    for (const el of zones) {
      const r = el.getBoundingClientRect();
      const dx = Math.max(r.left - x, 0, x - r.right),
        dy = Math.max(r.top - y, 0, y - r.bottom);
      const score = Math.hypot(dx, dy * 1.6);
      if (score < distance) {
        zone = el;
        distance = score;
      }
    }
    // Keep a small boundary cushion while a group changes width under the pointer.
    const currentZone = zones.find((el) => el.dataset.handGroup === d.group);
    if (currentZone) {
      const r = currentZone.getBoundingClientRect();
      if (
        x >= r.left - 10 &&
        x <= r.right + 10 &&
        y >= r.top - 10 &&
        y <= r.bottom + 10
      )
        zone = currentZone;
    }
    if (!zone) return;
    const group = zone.dataset.handGroup!;
    d.group = group;
    const els = Array.from(
      zone.querySelectorAll<HTMLElement>('[data-card]'),
    ).filter((el) => el.dataset.card !== d.id);
    let anchor: string | undefined;
    for (const [index, el] of els.entries()) {
      const p = (el.offsetParent as HTMLElement)?.getBoundingClientRect();
      if (!p) continue;
      const left =
        p.left + el.offsetLeft - (el.offsetParent as HTMLElement).scrollLeft;
      const nextCard = els[index + 1];
      const step = nextCard
        ? el.offsetWidth +
          parseFloat(getComputedStyle(nextCard).marginLeft || '0')
        : el.offsetWidth;
      if (x < left + step / 2) {
        anchor = el.dataset.card;
        break;
      }
    }
    const base = orderRef.current.filter(
      (id) => !(d.source === 'draw' && id === d.face?.id),
    );
    update(moveToGroup(base, d.id, group, anchor));
  }
  function move(e: React.PointerEvent<HTMLElement>) {
    const d = active.current;
    if (!d || d.settling || e.pointerId !== d.pointerId) return;
    d.px = e.clientX;
    d.py = e.clientY;
    if (!d.moved && Math.hypot(d.px - d.x, d.py - d.y) < 5) return;
    if (!d.moved) {
      d.moved = true;
      setDrag({ ...d });
    }
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  }
  function cleanup() {
    landingDone.current?.();
    landingDone.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    lastPaint.current = 0;
    active.current = null;
    setDrag(null);
  }
  async function land(destination: DOMRect | (() => DOMRect), keep = false) {
    const d = active.current,
      el = ghost.current;
    if (!d || !el) {
      cleanup();
      return;
    }
    cancelAnimationFrame(frame.current);
    paint();
    const target = () =>
      typeof destination === 'function' ? destination() : destination;
    const dx = d.px - d.x,
      dy = d.py - d.y;
    const position = [
      d.origin.left + dx,
      d.origin.top + dy,
      d.origin.width * 1.025,
      d.origin.height * 1.025,
      Math.max(-7, Math.min(7, dx / 32)),
    ];
    const velocity = [0, 0, 0, 0, 0];
    await new Promise<void>((resolve) => {
      landingDone.current = resolve;
      let previous = 0;
      const tick = (now: number) => {
        if (active.current !== d || !ghost.current) {
          resolve();
          return;
        }
        const dt = Math.min((now - (previous || now - 16.67)) / 1000, 0.032);
        previous = now;
        const rect = target();
        const goal = [rect.left, rect.top, rect.width, rect.height, 0];
        const omega = 21,
          decay = Math.exp(-omega * dt);
        for (let i = 0; i < position.length; i++) {
          const delta = position[i] - goal[i],
            c = velocity[i] + omega * delta;
          position[i] = goal[i] + (delta + c * dt) * decay;
          velocity[i] = (velocity[i] - omega * c * dt) * decay;
        }
        const settled =
          matchMedia('(prefers-reduced-motion: reduce)').matches ||
          (position.every((p, i) => Math.abs(p - goal[i]) < 0.15) &&
            velocity.every((v) => Math.abs(v) < 2));
        const p = settled ? goal : position;
        el.style.transform = `translate3d(${p[0] - d.origin.left}px,${p[1] - d.origin.top}px,0) rotate(${p[4]}deg) scale(${p[2] / d.origin.width},${p[3] / d.origin.height})`;
        if (settled) {
          frame.current = 0;
          resolve();
          return;
        }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    });
    landingDone.current = null;
    if (!keep && active.current === d) flushSync(cleanup);
  }
  const nextFrame = () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  async function end(e: React.PointerEvent<HTMLElement>, cancel = false) {
    const d = active.current;
    if (!d || d.settling || e.pointerId !== d.pointerId) return;
    if (!d.moved && d.source !== 'draw') {
      suppress.current = true;
      suppressAt.current = { x: e.clientX, y: e.clientY };
      if (suppressTimer.current) clearTimeout(suppressTimer.current);
      suppressTimer.current = setTimeout(() => {
        suppress.current = false;
      }, 500);
      cleanup();
      if (!cancel && d.source !== 'hand') await onDraw(d.source);
      return;
    }
    d.px = e.clientX;
    d.py = e.clientY;
    if (!cancel && inHand(d.px, d.py)) placeInHand(d, d.px, d.py);
    d.settling = true;
    setDrag({ ...d });
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    suppress.current = true;
    suppressAt.current = { x: e.clientX, y: e.clientY };
    if (suppressTimer.current) clearTimeout(suppressTimer.current);
    suppressTimer.current = setTimeout(() => {
      suppress.current = false;
    }, 500);
    paint();
    if (cancel && d.source !== 'draw') {
      update(d.original);
      await nextFrame();
      await land(d.origin);
      return;
    }
    if (d.source !== 'hand') {
      if (d.source !== 'draw' && !inHand(d.px, d.py)) {
        update(orderRef.current.filter((id) => id !== INCOMING));
        await land(d.origin);
        return;
      }
      if (!orderRef.current.includes(INCOMING))
        update([...orderRef.current, INCOMING]);
      const card = await (d.drawRequest || onDraw(d.source));
      const id = card?.id;
      if (active.current !== d) return;
      if (!id) {
        update(orderRef.current.filter((id) => id !== INCOMING));
        await land(d.origin);
        return;
      }
      d.id = id;
      d.face = card;
      update(
        orderRef.current
          .filter((c) => c !== id)
          .map((c) => (c === INCOMING ? id : c)),
      );
      setDrag({ ...d });
      const discard =
        !cancel && d.source === 'draw'
          ? document
              .elementFromPoint(d.px, d.py)
              ?.closest<HTMLElement>('[data-drop="discard"]')
          : null;
      if (discard) {
        const rect = discard
          .querySelector('.playing-card')!
          .getBoundingClientRect();
        const ok = await onDiscard(id, () => land(rect, true));
        if (active.current !== d) return;
        if (ok) {
          flushSync(cleanup);
          return;
        }
      }
      await nextFrame();
      await land(
        () =>
          elements()
            .find((el) => el.dataset.card === id)
            ?.getBoundingClientRect() || d.origin,
      );
      return;
    }
    const target = document
      .elementFromPoint(d.px, d.py)
      ?.closest<HTMLElement>('[data-drop="discard"]');
    if (target) {
      const rect =
        target.querySelector('.playing-card')?.getBoundingClientRect() ||
        target.getBoundingClientRect();
      const ok = await onDiscard(d.id, () => land(rect, true));
      if (active.current !== d) return;
      if (ok) {
        cleanup();
        return;
      }
    }
    await nextFrame();
    await land(
      () =>
        elements()
          .find((el) => el.dataset.card === d.id)
          ?.getBoundingClientRect() || d.origin,
    );
  }
  function click(e: React.MouseEvent) {
    if (
      suppress.current &&
      e.detail !== 0 &&
      Math.hypot(
        e.clientX - suppressAt.current.x,
        e.clientY - suppressAt.current.y,
      ) < 8
    ) {
      e.preventDefault();
      e.stopPropagation();
      suppress.current = false;
    }
  }
  useEffect(() => {
    return () => {
      cancelAnimationFrame(frame.current);
      landingDone.current?.();
      if (suppressTimer.current) clearTimeout(suppressTimer.current);
      animations.current.forEach((a) => a.cancel());
      active.current = null;
    };
  }, []);
  useEffect(() => {
    if (active.current) {
      update(orderRef.current.filter((id) => id !== INCOMING));
      cleanup();
    }
  }, [gameKey]);
  return {
    drag,
    ghost,
    hand,
    start,
    move,
    end,
    click,
    sort: (next: string[]) =>
      update(
        orderRef.current.includes(INCOMING) && !next.includes(INCOMING)
          ? [...next, INCOMING]
          : next,
      ),
    capture: snapshot,
    isDragging: () =>
      !!active.current &&
      (active.current.moved || active.current.source === 'draw'),
    reveal: (card: Card) => {
      const d = active.current;
      if (d?.source === 'draw') {
        d.face = card;
        setDrag({ ...d });
      }
    },
    incomingRect: () =>
      elements()
        .find((el) => el.dataset.card === INCOMING)
        ?.getBoundingClientRect(),
    reserve: async () => {
      update([...orderRef.current.filter((id) => id !== INCOMING), INCOMING]);
      await nextFrame();
      return elements()
        .find((el) => el.dataset.card === INCOMING)
        ?.getBoundingClientRect();
    },
    fill: (id: string) =>
      update(
        orderRef.current
          .filter((c) => c !== id)
          .map((c) => (c === INCOMING ? id : c)),
      ),
  };
}
