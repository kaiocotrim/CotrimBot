"use client";

import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";
import novaAnimation from "@/components/iconeAN/Nova.json";

export function EmptyChatAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let animation: AnimationItem | undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function syncMotionPreference() {
      if (reducedMotion.matches) animation?.goToAndStop(0, true);
      else animation?.play();
    }

    void import("lottie-web").then(({ default: lottie }) => {
      if (disposed || !containerRef.current) return;

      animation = lottie.loadAnimation({
        container: containerRef.current,
        renderer: "svg",
        loop: true,
        autoplay: !reducedMotion.matches,
        animationData: structuredClone(novaAnimation),
      });
      reducedMotion.addEventListener("change", syncMotionPreference);
    });

    return () => {
      disposed = true;
      reducedMotion.removeEventListener("change", syncMotionPreference);
      animation?.destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none aspect-square w-64 max-w-full sm:w-80"
    />
  );
}
