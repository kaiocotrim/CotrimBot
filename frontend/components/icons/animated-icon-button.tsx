"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { forwardRef, useRef, type ComponentType, type ReactNode, type Ref } from "react";

type AnimatedIconHandle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};

type AnimatedIconButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  children?: ReactNode;
  iconSize?: number;
  iconStrokeWidth?: number;
  iconClassName?: string;
  icon: ComponentType<{
    ref?: Ref<AnimatedIconHandle>;
    size?: number;
    strokeWidth?: number;
    className?: string;
    "aria-hidden"?: boolean;
  }>;
};

export const AnimatedIconButton = forwardRef<HTMLButtonElement, AnimatedIconButtonProps>(
  function AnimatedIconButton({
    icon: Icon, iconSize = 20, iconStrokeWidth = 1.8, iconClassName, children, onPointerEnter, onPointerLeave, onPointerDown,
    onFocus, onBlur, whileTap, ...props
  }, ref) {
    const iconRef = useRef<AnimatedIconHandle>(null);
    const reduceMotion = useReducedMotion();
    const hovered = useRef(false);
    const focused = useRef(false);

    function start() {
      if (!reduceMotion) iconRef.current?.startAnimation();
    }

    function stop() {
      if (!hovered.current && !focused.current) iconRef.current?.stopAnimation();
    }

    return (
      <motion.button
        ref={ref}
        type="button"
        {...props}
        whileTap={reduceMotion ? undefined : (whileTap ?? { scale: 0.9 })}
        onPointerEnter={(event) => {
          hovered.current = true;
          start();
          onPointerEnter?.(event);
        }}
        onPointerLeave={(event) => {
          hovered.current = false;
          stop();
          onPointerLeave?.(event);
        }}
        onPointerDown={(event) => {
          start();
          onPointerDown?.(event);
        }}
        onFocus={(event) => {
          focused.current = true;
          start();
          onFocus?.(event);
        }}
        onBlur={(event) => {
          focused.current = false;
          stop();
          onBlur?.(event);
        }}
      >
        <Icon ref={iconRef} aria-hidden className={`relative flex shrink-0 items-center justify-center ${iconClassName ?? ""}`} size={iconSize} strokeWidth={iconStrokeWidth} />
        {children}
      </motion.button>
    );
  },
);
