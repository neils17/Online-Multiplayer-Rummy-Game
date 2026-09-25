'use client';
import { useLayoutEffect, useState, useRef, type RefObject } from 'react';
import { fitHand, fitViewport } from '@/lib/layout';
export function useViewportStage() {
  useLayoutEffect(() => {
    let frame = 0;
    const root = document.documentElement;
    const insetProbe = document.createElement('div');
    insetProbe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(insetProbe);
    const measure = () => {
      const viewport = window.visualViewport;
      const inset = getComputedStyle(insetProbe);
      const left = parseFloat(inset.paddingLeft) || 0,
        right = parseFloat(inset.paddingRight) || 0;
      const top = parseFloat(inset.paddingTop) || 0,
        bottom = parseFloat(inset.paddingBottom) || 0;
      const stage = fitViewport(
        (viewport?.width || innerWidth) - left - right,
        (viewport?.height || innerHeight) - top - bottom,
      );
      root.style.setProperty('--ui-scale', String(stage.scale));
      root.style.setProperty('--stage-width', `${stage.width}px`);
      root.style.setProperty('--stage-height', `${stage.height}px`);
      root.style.setProperty(
        '--viewport-left',
        `${(viewport?.offsetLeft || 0) + left}px`,
      );
      root.style.setProperty(
        '--viewport-top',
        `${(viewport?.offsetTop || 0) + top}px`,
      );
      root.dataset.layout = stage.landscape ? 'landscape' : 'portrait';
    };
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    return () => {
      cancelAnimationFrame(frame);
      insetProbe.remove();
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('scroll', resize);
    };
  }, []);
}
export function useHandFit(
  ref: RefObject<HTMLDivElement | null>,
  counts: number[],
  expert: boolean,
  fixedDiscard = false,
  freeze = false,
) {
  const [size, setSize] = useState({ width: 400, height: 220 });
  const hasCards = counts.some((count) => count > 0);
  useLayoutEffect(() => {
    const el = fixedDiscard ? ref.current?.parentElement : ref.current;
    if (!el) return;
    const measure = () =>
      setSize((old) => {
        const next = { width: el.clientWidth - 8, height: el.clientHeight - 8 };
        return old.width === next.width && old.height === next.height
          ? old
          : next;
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, hasCards, fixedDiscard]);
  // Reserve the fourteenth card's space before drawing, so a tap draw does
  // not resize the other thirteen cards when its placeholder arrives.
  const capacity = [...counts];
  if (capacity.length && capacity.reduce((sum, n) => sum + n, 0) === 13)
    capacity[capacity.length - 1]++;
  const fitted = fitHand(
    capacity,
    size.width,
    size.height,
    expert,
    fixedDiscard,
  );
  const stable = useRef(fitted);
  if (!freeze) stable.current = fitted;
  return stable.current;
}
