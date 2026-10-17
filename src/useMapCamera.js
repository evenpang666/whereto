import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cameraProjection, interpolateCamera } from './map-camera.js';

export function useMapCamera(target, immediate) {
  const [camera, setCamera] = useState(target);
  const current = useRef(target);

  useLayoutEffect(() => {
    const from = current.current;
    if (from === target) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame;
    const update = next => { current.current = next; setCamera(next); };
    const finish = () => { cancelAnimationFrame(frame); update(target); };
    if (immediate || motion.matches) {
      finish();
      return;
    }
    const started = performance.now();
    const animate = now => {
      const t = Math.min(1, (now - started) / 850);
      const eased = t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      update(interpolateCamera(from, target, eased));
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const onMotion = () => { if (motion.matches) finish(); };
    motion.addEventListener('change', onMotion);
    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener('change', onMotion);
    };
  }, [target, immediate]);

  return useMemo(() => cameraProjection(camera), [camera]);
}
