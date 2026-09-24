'use client';
import {
  useLayoutEffect,
  useRef,
  useState,
  useEffect,
  type RefObject,
} from 'react';
import { reorderGroup, isGroup, DISCARD_GROUP } from '@/lib/arrange';

type Active = {
  id: string;
  pointer: number;
  x: number;
  y: number;
  px: number;
  py: number;
  origin: DOMRect;
  slots: DOMRect[];
  moved: boolean;
  original: string[];
};
export function useGroupMotion(
  hand: RefObject<HTMLDivElement | null>,
  order: string[],
  setOrder: (order: string[]) => void,
  gameKey: string,
) {
  const active = useRef<Active | null>(null),
    current = useRef(order),
    before = useRef(new Map<string, DOMRect>()),
    animations = useRef(new Map<HTMLElement, Animation>()),
    frame = useRef(0);
  const [dragging, setDragging] = useState(false);
  const elements = () =>
    Array.from(
      hand.current?.querySelectorAll<HTMLElement>('[data-hand-group]') || [],
    ).filter((el) => el.dataset.handGroup !== DISCARD_GROUP);
  current.current = order;
  function clearAnimations() {
    animations.current.forEach((a) => a.cancel());
    animations.current.clear();
  }
  function paint() {
    const d = active.current;
    if (!d?.moved) return;
    const el = elements().find((el) => el.dataset.handGroup === d.id);
    if (!el) return;
    el.style.translate = 'none';
    const r = el.getBoundingClientRect(),
      scale = el.offsetWidth ? r.width / el.offsetWidth : 1;
    el.style.translate = `${(d.origin.left + d.px - d.x - r.left) / scale}px ${(d.origin.top + d.py - d.y - r.top) / scale}px`;
    el.dataset.groupDragging = 'true';
  }
  useLayoutEffect(() => {
    const previous = before.current;
    before.current = new Map();
    if (!previous.size) return;
    clearAnimations();
    for (const el of elements()) {
      if (el.dataset.handGroup === active.current?.id) continue;
      const old = previous.get(el.dataset.handGroup!),
        r = el.getBoundingClientRect();
      if (!old) continue;
      const scale = el.offsetWidth ? r.width / el.offsetWidth : 1;
      const x = (old.left - r.left) / scale,
        y = (old.top - r.top) / scale;
      if (Math.abs(x) + Math.abs(y) < 0.5) continue;
      const a = el.animate(
        [{ translate: `${x}px ${y}px` }, { translate: '0px 0px' }],
        { duration: 300, easing: 'cubic-bezier(.2,.75,.2,1)' },
      );
      animations.current.set(el, a);
    }
    paint();
  }, [order]);
  function start(e: React.PointerEvent<HTMLElement>, id: string) {
    if (
      e.button !== 0 ||
      active.current ||
      (e.target as HTMLElement).closest('button')
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    const els = elements(),
      el = els.find((el) => el.dataset.handGroup === id);
    if (!el) return;
    clearAnimations();
    active.current = {
      id,
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      px: e.clientX,
      py: e.clientY,
      origin: el.getBoundingClientRect(),
      slots: els.map((el) => el.getBoundingClientRect()),
      moved: false,
      original: [...current.current],
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLElement>) {
    const d = active.current;
    if (!d || e.pointerId !== d.pointer) return;
    d.px = e.clientX;
    d.py = e.clientY;
    if (!d.moved && Math.hypot(d.px - d.x, d.py - d.y) < 5) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const d = active.current;
      if (!d) return;
      paint();
      let target = 0,
        best = Infinity;
      d.slots.forEach((r, i) => {
        const dx = Math.max(r.left - d.px, 0, d.px - r.right),
          dy = Math.max(r.top - d.py, 0, d.py - r.bottom);
        const distance = Math.hypot(dx, dy * 1.6);
        if (distance < best) {
          best = distance;
          target = i;
        }
      });
      const next = reorderGroup(current.current, d.id, target);
      if (next !== current.current) {
        before.current = new Map(
          elements().map((el) => [
            el.dataset.handGroup!,
            el.getBoundingClientRect(),
          ]),
        );
        current.current = next;
        setOrder(next);
      }
    });
  }
  function end(e: React.PointerEvent<HTMLElement>, cancel = false) {
    const d = active.current;
    if (!d || e.pointerId !== d.pointer) return;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    const el = elements().find((el) => el.dataset.handGroup === d.id);
    const from = el?.getBoundingClientRect();
    active.current = null;
    setDragging(false);
    if (el) {
      el.style.translate = 'none';
      delete el.dataset.groupDragging;
    }
    if (cancel) {
      before.current = new Map(
        elements().map((node) => [
          node.dataset.handGroup!,
          node === el && from ? from : node.getBoundingClientRect(),
        ]),
      );
      current.current = d.original;
      setOrder(d.original);
      return;
    }
    if (el && from && d.moved) {
      const r = el.getBoundingClientRect(),
        scale = el.offsetWidth ? r.width / el.offsetWidth : 1;
      const a = el.animate(
        [
          {
            translate: `${(from.left - r.left) / scale}px ${(from.top - r.top) / scale}px`,
          },
          { translate: '0px 0px' },
        ],
        { duration: 320, easing: 'cubic-bezier(.2,.75,.2,1)' },
      );
      animations.current.set(el, a);
    }
  }
  function keyboard(e: React.KeyboardEvent<HTMLElement>, id: string) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
      return;
    e.preventDefault();
    const index = current.current
      .filter((id) => isGroup(id) && id !== DISCARD_GROUP)
      .indexOf(id);
    before.current = new Map(
      elements().map((el) => [
        el.dataset.handGroup!,
        el.getBoundingClientRect(),
      ]),
    );
    setOrder(
      reorderGroup(
        current.current,
        id,
        index + (['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 1),
      ),
    );
  }
  useEffect(() => {
    active.current = null;
    setDragging(false);
    before.current.clear();
    clearAnimations();
    elements().forEach((el) => {
      el.style.translate = 'none';
      delete el.dataset.groupDragging;
    });
  }, [gameKey]);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      clearAnimations();
    },
    [],
  );
  return {
    start,
    move,
    end,
    keyboard,
    dragging,
    isActive: () => !!active.current,
  };
}
