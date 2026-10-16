"use client"

import { useCallback, useRef } from "react"
import { DotLottieReact, setWasmUrl, type DotLottie } from "@lottiefiles/dotlottie-react"

setWasmUrl("/animations/dotlottie-player.wasm")

type SuccessConfettiIconProps = {
  className?: string
  onComplete?: () => void
}

export function SuccessConfettiIcon({
  className = "h-14 w-14",
  onComplete,
}: SuccessConfettiIconProps) {
  const instance = useRef<DotLottie | null>(null)
  const handlePlayer = useCallback((player: DotLottie | null) => {
    if (onComplete) {
      instance.current?.removeEventListener("complete", onComplete)
      instance.current?.removeEventListener("loadError", onComplete)
      player?.addEventListener("complete", onComplete)
      player?.addEventListener("loadError", onComplete)
    }
    instance.current = player
  }, [onComplete])

  return (
    <DotLottieReact
      src="/animations/success-confetti.json"
      autoplay
      loop={false}
      className={className}
      dotLottieRefCallback={handlePlayer}
    />
  )
}
