'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../lib/preferences';

/**
 * Animates a displayed number from its previous value to the new one. Purely visual:
 * the final frame renders exactly `format(value)` from the API's decimal string.
 */
export function CountUp({ value, format, duration = 700 }: { value: string; format: (v: string | number) => string; duration?: number }) {
  const reduced = useReducedMotion();
  const target = Number(value);
  const [display, setDisplay] = useState<string>(() => format(value));
  const from = useRef(0);

  useEffect(() => {
    if (reduced || !Number.isFinite(target)) {
      setDisplay(format(value));
      from.current = target;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      if (t < 1) {
        setDisplay(format(origin + (target - origin) * eased));
        frame = requestAnimationFrame(tick);
      } else {
        setDisplay(format(value));
        from.current = target;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, target, reduced, duration, format]);

  return <>{display}</>;
}
