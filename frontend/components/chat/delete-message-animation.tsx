"use client";

import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";
import deleteAnimation from "@/components/iconeAN/Delete.json";

export function DeleteMessageAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let animation: AnimationItem | undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function syncMotionPreference() {
      if (reducedMotion.matches) animation?.goToAndStop(59, true);
      else animation?.playSegments([0, 59], true);
    }

    void import("lottie-web").then(({ default: lottie }) => {
      if (disposed || !containerRef.current) return;
      animation = lottie.loadAnimation({
        container: containerRef.current,
        renderer: "svg",
        loop: false,
        autoplay: false,
        animationData: structuredClone(deleteAnimation),
      });
      syncMotionPreference();
      reducedMotion.addEventListener("change", syncMotionPreference);
    });

    return () => {
      disposed = true;
      reducedMotion.removeEventListener("change", syncMotionPreference);
      animation?.destroy();
    };
  }, []);

  return <div ref={containerRef} aria-hidden="true" className="pointer-events-none size-24 shrink-0" />;
}
