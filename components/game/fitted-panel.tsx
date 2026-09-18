'use client';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
export function FittedPanel({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null),
    inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const measure = () => {
      if (outer.current && inner.current) {
        const height = inner.current.scrollHeight;
        if (height && outer.current.clientHeight)
          setScale(Math.min(1, outer.current.clientHeight / height));
      }
    };
    const observer = new ResizeObserver(measure);
    if (outer.current) observer.observe(outer.current);
    if (inner.current) observer.observe(inner.current);
    measure();
    return () => observer.disconnect();
  }, []);
  return (
    <div className="fitted-panel" ref={outer}>
      <div ref={inner} style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
