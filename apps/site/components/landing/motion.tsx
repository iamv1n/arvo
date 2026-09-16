'use client';

import { useEffect, useRef, useState } from 'react';
import { css, keyframes } from 'styled-components';

/** Fires once when the element scrolls into view. Falls back to visible when IO is unavailable. */
export function useInView<T extends Element>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Counts from 0 to target once `active` becomes true. */
export function useCountUp(target: number, active: boolean, durationMs = 1400) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reduced) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, target, durationMs, reduced]);
  return value;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const formatINR = (value: number) => inr.format(value);

export const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
`;
export const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;
export const growY = keyframes`
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
`;
export const growX = keyframes`
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
`;
export const drawStroke = keyframes`
  from { stroke-dashoffset: 1; }
  to { stroke-dashoffset: 0; }
`;
export const donutSeg = keyframes`
  from { stroke-dasharray: 0 100; }
`;
export const popIn = keyframes`
  from { opacity: 0; transform: scale(0.85); }
  to { opacity: 1; transform: scale(1); }
`;
export const dashFlow = keyframes`
  to { stroke-dashoffset: -24; }
`;
export const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`;
export const float = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
`;

/**
 * Paused-until-visible animation. The animation's `from` state is held (fill-mode both)
 * while paused, so elements stay hidden until `$on` flips to true.
 */
export const play = (on: boolean, delayMs = 0, duration = '700ms') => css`
  animation-duration: ${duration};
  animation-delay: ${delayMs}ms;
  animation-fill-mode: both;
  animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
  animation-play-state: ${on ? 'running' : 'paused'};
`;
