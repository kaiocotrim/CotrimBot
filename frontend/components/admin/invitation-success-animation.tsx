"use client";

import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";
import successAnimation from "@/components/iconeAN/Success.json";

export function InvitationSuccessAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let animation: AnimationItem | undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function syncMotionPreference() {
      // The asset clears the check near its final frame, so keep the completed mark visible.
      if (reducedMotion.matches) animation?.goToAndStop(60, true);
      else animation?.playSegments([0, 60], true);
    }

    void import("lottie-web").then(({ default: lottie }) => {
      if (disposed || !containerRef.current) return;

      animation = lottie.loadAnimation({
        container: containerRef.current,
        renderer: "svg",
        loop: false,
        autoplay: false,
        animationData: structuredClone(successAnimation),
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

  return <div ref={containerRef} aria-hidden="true" className="pointer-events-none size-36 shrink-0" />;
}
