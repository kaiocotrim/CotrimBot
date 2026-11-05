// Ellipsis glyph with animation adapted from lucide-animated; MIT license in LICENSE.
"use client";

import type { Variants } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface EllipsisVerticalIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface EllipsisVerticalIconProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
  strokeWidth?: number;
}

const VARIANTS: Variants = {
  normal: { scale: 1, y: 0 },
  animate: (index: number) => ({
    scale: [1, 1.3, 1],
    y: [0, -1.5, 0],
    transition: { duration: 0.4, delay: index * 0.08, ease: "easeInOut" },
  }),
};

const EllipsisVerticalIcon = forwardRef<EllipsisVerticalIconHandle, EllipsisVerticalIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 20, strokeWidth = 1.8, ...props }, ref) => {
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
          {[5, 12, 19].map((cy, index) => (
            <motion.circle
              key={cy}
              cx="12"
              cy={cy}
              r="1"
              initial="normal"
              animate={controls}
              custom={index}
              variants={VARIANTS}
              style={{ transformOrigin: `12px ${cy}px` }}
            />
          ))}
        </svg>
      </span>
    );
  }
);

EllipsisVerticalIcon.displayName = "EllipsisVerticalIcon";

export { EllipsisVerticalIcon };
