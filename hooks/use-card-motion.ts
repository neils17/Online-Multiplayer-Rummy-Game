'use client';
import { useLayoutEffect, useRef, useState, useEffect } from 'react';
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
  drawRequest?: Promise<Card | null>;
};
export function useCardMotion(
  order: string[],
  setOrder: React.Dispatch<React.SetStateAction<string[]>>,
  select: (id: string | null) => void,
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
  const suppress = useRef(false);
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
      if (!old || el.dataset.card === active.current?.id) return;
      const x = old.left - r.left,
        y = old.top - r.top;
      if (Math.abs(x) + Math.abs(y) < 1) return;
      const animation = el.animate(
        [{ translate: `${x}px ${y}px` }, { translate: '0px 0px' }],
        { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' },
      );
      animations.current.set(el, animation);
    });
  }, [order]);
  function paint() {
    const d = active.current,
      el = ghost.current;
    if (!d || !el) return;
    const dx = d.px - d.x,
      dy = d.py - d.y;
    const tilt = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : Math.max(-7, Math.min(7, dx / 32));
    el.style.transform = `translate3d(${dx}px,${dy}px,0) rotate(${tilt}deg) scale(1.025)`;
  }
  useLayoutEffect(() => {
    if (drag) paint();
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
    // Lift the known discard face immediately, including before the drag threshold.
    if (source === 'open') setDrag({ ...d });
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
  function nearest(x: number, y: number) {
    let best = 0,
      dist = Infinity;
    elements().forEach((el, i) => {
      const parent = el.offsetParent as HTMLElement | null;
      const p = parent?.getBoundingClientRect();
      if (!p) return; // Layout slots stay still even while their cards animate.
      const cx = p.left + el.offsetLeft + el.offsetWidth / 2,
        cy = p.top + el.offsetTop + el.offsetHeight / 2;
      const distance = Math.hypot(cx - x, (cy - y) * 1.6);
      if (distance < dist) {
        dist = distance;
        best = i;
      }
    });
    return best;
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
      if (d.source === 'hand') select(d.id);
      if (d.source === 'draw') {
        // Commit the draw on lift: a revealed card can never be returned to the deck.
        d.drawRequest = onDraw('draw').then((card) => {
          if (card && active.current === d) {
            d.face = card;
            update(orderRef.current.filter((id) => id !== card.id));
            setDrag({ ...d });
          }
          return card;
        });
      }
    }
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(paint);
    if (inHand(d.px, d.py)) {
      const index = nearest(d.px, d.py);
      const next = orderRef.current.filter(
        (id) => id !== d.id && !(d.source === 'draw' && id === d.face?.id),
      );
      next.splice(Math.min(index, next.length), 0, d.id);
      update(next);
    } else if (d.source !== 'hand' && orderRef.current.includes(INCOMING))
      update(orderRef.current.filter((id) => id !== INCOMING));
  }
  function cleanup() {
    cancelAnimationFrame(frame.current);
    // A completed drag returns to the normal hand layer, not the selected layer.
    if (active.current?.moved) select(null);
    active.current = null;
    setDrag(null);
  }
  async function land(rect: DOMRect, keep = false) {
    const d = active.current,
      el = ghost.current;
    if (!d || !el) {
      cleanup();
      return;
    }
    cancelAnimationFrame(frame.current);
    paint();
    const animation = el.animate(
      [
        { transform: el.style.transform },
        {
          transform: `translate3d(${rect.left - d.origin.left}px,${rect.top - d.origin.top}px,0) rotate(0deg) scale(${rect.width / d.origin.width},${rect.height / d.origin.height})`,
        },
      ],
      {
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 0
          : 260,
        easing: 'cubic-bezier(.22,1,.36,1)',
        fill: 'forwards',
      },
    );
    try {
      await animation.finished;
    } catch {}
    if (!keep) cleanup();
  }
  const nextFrame = () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  async function end(e: React.PointerEvent<HTMLElement>, cancel = false) {
    const d = active.current;
    if (!d || d.settling || e.pointerId !== d.pointerId) return;
    if (!d.moved) {
      suppress.current = true;
      if (suppressTimer.current) clearTimeout(suppressTimer.current);
      suppressTimer.current = setTimeout(() => {
        suppress.current = false;
      }, 500);
      cleanup();
      if (!cancel) {
        if (d.source === 'hand') select(d.id);
        else await onDraw(d.source);
      }
      return;
    }
    d.px = e.clientX;
    d.py = e.clientY;
    d.settling = true;
    suppress.current = true;
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
      select(id);
      update(
        orderRef.current
          .filter((c) => c !== id)
          .map((c) => (c === INCOMING ? id : c)),
      );
      setDrag({ ...d });
      await nextFrame();
      const target = elements().find((el) => el.dataset.card === id);
      await land(target?.getBoundingClientRect() || d.origin);
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
    const slot = elements().find((el) => el.dataset.card === d.id);
    await land(slot?.getBoundingClientRect() || d.origin);
  }
  function click(e: React.MouseEvent) {
    if (suppress.current) {
      e.preventDefault();
      e.stopPropagation();
      suppress.current = false;
    }
  }
  useEffect(() => {
    return () => {
      cancelAnimationFrame(frame.current);
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
    sort: (next: string[]) => update(next),
    capture: snapshot,
    isDragging: () => !!active.current?.moved,
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
