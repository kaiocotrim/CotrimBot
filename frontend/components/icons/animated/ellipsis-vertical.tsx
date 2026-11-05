"use client";

// Adapted from https://lucide-animated.com/r/ellipsis-vertical.json; MIT license in ../lucide-animated/LICENSE.
import { motion, type Variants } from "framer-motion";
import { createAnimatedIcon } from "../create-animated-icon";

const VARIANTS: Variants = {
  normal: { scale: 1, y: 0 },
  animate: (index: number) => ({
    scale: [1, 1.3, 1],
    y: [0, -1.5, 0],
    transition: { duration: 0.4, delay: index * 0.08, ease: "easeInOut" },
  }),
};

export const EllipsisVertical = createAnimatedIcon("ellipsis-vertical", controls => (
<svg
          fill="none"
          height={24}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          viewBox="0 0 24 24"
          width={24}
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
));
