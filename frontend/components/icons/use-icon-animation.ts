"use client";

import { useAnimation, useReducedMotion } from "framer-motion";
import { useEffect, useImperativeHandle, useRef, type ForwardedRef } from "react";

const triggerSelector = 'button, a[href], label, summary, [role="button"], [role="menuitem"], [role="tab"], [role="option"], [role="switch"]';

/** Animate from the whole control, including keyboard focus and touch. */
export function useIconAnimation(forwardedRef: ForwardedRef<SVGSVGElement>) {
  const element = useRef<SVGSVGElement | null>(null);
  const controls = useAnimation();
  const reduceMotion = useReducedMotion();
  useImperativeHandle(forwardedRef, () => element.current!, []);

  useEffect(() => {
    const svg = element.current;
    if (!svg) return;
    const trigger = svg.closest<HTMLElement>(triggerSelector) ?? svg;
    let hovered = false;
    let focused = trigger.contains(document.activeElement);

    if (reduceMotion) {
      controls.set("normal");
      return;
    }

    function start() {
      if (trigger.matches(':disabled, [aria-disabled="true"]') || svg!.closest('[aria-busy="true"]')) return;
      void controls.start("animate");
    }
    function stop() {
      if (!hovered && !focused) void controls.start("normal");
    }
    function enter() { hovered = true; start(); }
    function leave() { hovered = false; stop(); }
    function focus() { focused = true; start(); }
    function blur(event: Event) {
      if (trigger.contains((event as FocusEvent).relatedTarget as Node | null)) return;
      focused = false;
      stop();
    }

    trigger.addEventListener("pointerenter", enter);
    trigger.addEventListener("pointerleave", leave);
    trigger.addEventListener("pointerdown", start);
    trigger.addEventListener("pointercancel", leave);
    trigger.addEventListener("focusin", focus);
    trigger.addEventListener("focusout", blur);
    return () => {
      trigger.removeEventListener("pointerenter", enter);
      trigger.removeEventListener("pointerleave", leave);
      trigger.removeEventListener("pointerdown", start);
      trigger.removeEventListener("pointercancel", leave);
      trigger.removeEventListener("focusin", focus);
      trigger.removeEventListener("focusout", blur);
      controls.stop();
    };
  }, [controls, reduceMotion]);

  return { ref: element, controls };
}
