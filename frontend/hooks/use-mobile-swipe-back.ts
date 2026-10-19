import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { animate, useMotionValue, useReducedMotion, type AnimationPlaybackControls } from "framer-motion";

type SwipeGesture = { pointerId: number; startX: number; startY: number; width: number; dragging: boolean };
const DESKTOP_QUERY = "(min-width: 1024px)";
const EDGE_WIDTH = 32;
const DIRECTION_DISTANCE = 12;
const TRANSITION = { duration: 0.3, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] };

// A mesma tela permanece montada ao entrar, sair ou interromper um gesto.
export function useMobileSwipeBack(enabled: boolean, onBack: () => void) {
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const gestureRef = useRef<SwipeGesture | null>(null);
  const animationRef = useRef<AnimationPlaybackControls | null>(null);

  useLayoutEffect(() => {
    if (!panel) return;
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const sync = (resize = false) => {
      animationRef.current?.stop();
      animationRef.current = null;
      gestureRef.current = null;
      const mobile = !desktop.matches;
      panel.inert = mobile && !enabled;
      panel.style.pointerEvents = mobile && !enabled ? "none" : "";
      panel.style.visibility = "visible";
      const destination = mobile && !enabled ? panel.clientWidth : 0;
      const complete = () => {
        panel.dataset.navigationState = enabled || !mobile ? "open" : "closed";
        panel.style.willChange = "";
        if (mobile && !enabled) panel.style.visibility = "hidden";
      };
      // O teclado altera a altura, sem reiniciar a navegação.
      if (resize || !mobile || reduceMotion || !panel.dataset.navigationState) {
        x.set(destination);
        complete();
        return;
      }
      panel.dataset.navigationState = enabled ? "opening" : "closing";
      panel.style.willChange = "transform";
      const controls = animate(x, destination, TRANSITION);
      animationRef.current = controls;
      void controls.finished.then(() => {
        if (animationRef.current !== controls) return;
        animationRef.current = null;
        complete();
      }).catch(() => {});
    };
    let width = panel.clientWidth;
    const resize = new ResizeObserver(() => {
      if (width === panel.clientWidth) return;
      width = panel.clientWidth;
      sync(true);
    });
    const changeBreakpoint = () => sync(true);
    sync();
    resize.observe(panel);
    desktop.addEventListener("change", changeBreakpoint);
    return () => {
      resize.disconnect();
      desktop.removeEventListener("change", changeBreakpoint);
      animationRef.current?.stop();
    };
  }, [enabled, panel, reduceMotion, x]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || animationRef.current || event.pointerType !== "touch" || !event.isPrimary || window.matchMedia(DESKTOP_QUERY).matches) return;
    if (event.clientX - event.currentTarget.getBoundingClientRect().left > EDGE_WIDTH) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.closest("[data-swipe-back-area]")) return;
    if (target.closest("button, a, input, textarea, select, [contenteditable], [draggable='true'], [role='button'], [role='menu'], [role='dialog'], img, video, audio, canvas, [data-swipe-back-ignore]")) return;
    if (event.currentTarget.querySelector("[data-audio-recording='true'], [role='menu'], [role='dialog']")) return;
    if (window.getSelection()?.type === "Range") return;
    gestureRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, width: event.currentTarget.clientWidth, dragging: false };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.querySelector("[data-audio-recording='true']")) { finish(false); return; }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.dragging) {
      if (window.getSelection()?.type === "Range" || dx < -DIRECTION_DISTANCE || (Math.abs(dy) > DIRECTION_DISTANCE && Math.abs(dy) >= Math.abs(dx))) {
        gestureRef.current = null;
        return;
      }
      if (dx < DIRECTION_DISTANCE || dx < Math.abs(dy) * 1.3) return;
      gesture.dragging = true;
      event.currentTarget.dataset.navigationState = "dragging";
      event.currentTarget.style.willChange = "transform";
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Captura implícita do navegador. */ }
    }
    event.preventDefault();
    x.set(Math.min(gesture.width, Math.max(0, dx)));
  }

  function finish(confirm: boolean) {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture?.dragging) return;
    if (confirm) {
      // O estado/histórico conclui a transição a partir da posição do dedo.
      onBack();
      return;
    }
    const complete = () => {
      if (panel) { panel.dataset.navigationState = "open"; panel.style.willChange = ""; }
    };
    if (reduceMotion) { x.set(0); complete(); return; }
    if (panel) panel.dataset.navigationState = "opening";
    const controls = animate(x, 0, TRANSITION);
    animationRef.current = controls;
    void controls.finished.then(() => {
      if (animationRef.current !== controls) return;
      animationRef.current = null;
      complete();
    }).catch(() => {});
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.dragging) x.set(Math.min(gesture.width, Math.max(0, event.clientX - gesture.startX)));
    finish(gesture.dragging && x.get() >= gesture.width * 0.3);
  }
  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (gestureRef.current?.pointerId === event.pointerId) finish(false);
  }
  return { setPanel, x, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
