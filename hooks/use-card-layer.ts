'use client';
import { useLayoutEffect, useState } from 'react';
export function useCardLayer() {
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const element = document.createElement('div');
    element.className = 'card-motion-layer';
    element.setAttribute('aria-hidden', 'true');
    document.body.appendChild(element);
    setLayer(element);
    return () => {
      element.remove();
    };
  }, []);
  return layer;
}
