// Adapted from https://lucide-animated.com — MIT license in LICENSE.
"use client";

import type { Variants } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface GalleryHorizontalEndIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface GalleryHorizontalEndIconProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
  strokeWidth?: number;
}

const PATH_VARIANTS: Variants = {
  normal: {
    translateX: 0,
    opacity: 1,
    transition: {
      type: "tween",
      stiffness: 200,
      damping: 13,
    },
  },
  animate: (i: number) => ({
    translateX: [2 * i, 0],
    opacity: [0, 1],
    transition: {
      delay: 0.25 * (2 - i),
      type: "tween",
      stiffness: 200,
      damping: 13,
    },
  }),
};

const GalleryHorizontalEndIcon = forwardRef<
  GalleryHorizontalEndIconHandle,
  GalleryHorizontalEndIconProps
>(({ onMouseEnter, onMouseLeave, className, size = 20, strokeWidth = 1.8, ...props }, ref) => {
  const controls = useAnimation();
  const isControlledRef = useRef(false);

  useImperativeHandle(ref, () => {
    isControlledRef.current = true;

    return {
      startAnimation: () => controls.start("animate"),
      stopAnimation: () => controls.start("normal"),
    };
  });

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      if (isControlledRef.current) {
        onMouseEnter?.(e);
      } else {
        controls.start("animate");
      }
    },
    [controls, onMouseEnter]
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      if (isControlledRef.current) {
        onMouseLeave?.(e);
      } else {
        controls.start("normal");
      }
    },
    [controls, onMouseLeave]
  );

  return (
    <span
      className={cn(className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <svg
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        <motion.path
          animate={controls}
          custom={2}
          d="M6 5v14"
          variants={PATH_VARIANTS}
        />
        <motion.path
          animate={controls}
          custom={1}
          d="M2 7v10"
          variants={PATH_VARIANTS}
        />
        <rect height="18" rx="2" width="12" x="10" y="3" />
      </svg>
    </span>
  );
});

GalleryHorizontalEndIcon.displayName = "GalleryHorizontalEndIcon";

export { GalleryHorizontalEndIcon };
