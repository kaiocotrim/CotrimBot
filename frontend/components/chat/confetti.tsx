"use client";

import { useCallback, useRef } from "react";
import { DotLottieReact, setWasmUrl, type DotLottie } from "@lottiefiles/dotlottie-react";

setWasmUrl("/animations/dotlottie-player.wasm");

export function Confetti({ className = "h-full w-full", onComplete }: {
  className?: string;
  onComplete?: () => void;
}) {
  const instance = useRef<DotLottie | null>(null);
  const handlePlayer = useCallback((player: DotLottie | null) => {
    if (onComplete) {
      instance.current?.removeEventListener("complete", onComplete);
      instance.current?.removeEventListener("loadError", onComplete);
      player?.addEventListener("complete", onComplete);
      player?.addEventListener("loadError", onComplete);
    }
    instance.current = player;
  }, [onComplete]);

  return <DotLottieReact src="/animations/Confetti-Animation.json" autoplay loop={false} className={className} dotLottieRefCallback={handlePlayer} />;
}
