import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { animate, useMotionValue, useReducedMotion, type AnimationPlaybackControls } from "framer-motion";

type SwipeGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
  dragging: boolean;
  direction: -1 | 1 | null;
};

const DESKTOP_QUERY = "(min-width: 1024px)";
const DIRECTION_DISTANCE = 12;

export function useMobileSwipeBack(enabled: boolean, onBack: () => void) {
  const x = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const [revealing, setRevealing] = useState(false);
  const gestureRef = useRef<SwipeGesture | null>(null);
  const animationRef = useRef<AnimationPlaybackControls | null>(null);
  const settlingRef = useRef(false);

  const reset = useCallback(() => {
    animationRef.current?.stop();
    animationRef.current = null;
    gestureRef.current = null;
    settlingRef.current = false;
    x.set(0);
    setRevealing(false);
  }, [x]);

  useEffect(() => {
    function handleInterruption() {
      if (document.hidden || window.matchMedia(DESKTOP_QUERY).matches) reset();
    }
    window.addEventListener("resize", handleInterruption);
    document.addEventListener("visibilitychange", handleInterruption);
    return () => {
      window.removeEventListener("resize", handleInterruption);
      document.removeEventListener("visibilitychange", handleInterruption);
      animationRef.current?.stop();
    };
  }, [reset]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || settlingRef.current || event.pointerType !== "touch" || !event.isPrimary || window.matchMedia(DESKTOP_QUERY).matches) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.closest("[data-swipe-back-area]")) return;
    if (target.closest("button, a, input, textarea, select, [contenteditable], [draggable='true'], [role='button'], [role='menu'], [role='dialog'], img, video, audio, canvas, [data-swipe-back-ignore]")) return;
    if (event.currentTarget.querySelector("[data-audio-recording='true'], [role='menu'], [role='dialog']")) return;
    if (window.getSelection()?.type === "Range") return;

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: event.currentTarget.clientWidth,
      dragging: false,
      direction: null,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.querySelector("[data-audio-recording='true']")) {
      finish(false);
      return;
    }

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.dragging) {
      if (window.getSelection()?.type === "Range" || (Math.abs(dy) > DIRECTION_DISTANCE && Math.abs(dy) >= Math.abs(dx))) {
        gestureRef.current = null;
        return;
      }
      if (Math.abs(dx) < DIRECTION_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      gesture.dragging = true;
      gesture.direction = dx < 0 ? -1 : 1;
      setRevealing(true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // O toque ainda pode continuar com a captura implícita do navegador.
      }
    }

    event.preventDefault();
    x.set(gesture.direction === -1
      ? Math.max(-gesture.width, Math.min(0, dx))
      : Math.min(gesture.width, Math.max(0, dx)));
  }

  function finish(confirm: boolean) {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture?.dragging) return;
    settlingRef.current = true;

    if (confirm) {
      if (reduceMotion) {
        onBack();
        return;
      }
      const controls = animate(x, gesture.width * (gesture.direction ?? 1), { duration: 0.24, ease: [0.22, 1, 0.36, 1] });
      animationRef.current = controls;
      void controls.finished.then(() => {
        if (animationRef.current !== controls) return;
        animationRef.current = null;
        onBack();
      }).catch(() => {});
      return;
    }

    if (reduceMotion) {
      reset();
      return;
    }
    const controls = animate(x, 0, { duration: 0.28, ease: [0.22, 1, 0.36, 1] });
    animationRef.current = controls;
    void controls.finished.then(() => {
      if (animationRef.current !== controls) return;
      animationRef.current = null;
      settlingRef.current = false;
      setRevealing(false);
    }).catch(() => {});
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.dragging) {
      const dx = event.clientX - gesture.startX;
      x.set(gesture.direction === -1
        ? Math.max(-gesture.width, Math.min(0, dx))
        : Math.min(gesture.width, Math.max(0, dx)));
    }
    const threshold = Math.max(80, Math.min(120, gesture.width * 0.25));
    finish(gesture.dragging && Math.abs(x.get()) >= threshold);
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (gestureRef.current?.pointerId === event.pointerId) finish(false);
  }

  return { x, revealing: enabled && revealing, reset, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
