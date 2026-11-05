"use client";

// Adapted from https://lucide-animated.com/r/palette.json; MIT license in ../lucide-animated/LICENSE.
import { motion, type Variants } from "framer-motion";
import { createAnimatedIcon } from "../create-animated-icon";

const DASH_LENGTH = 70;

const DRAW_DURATION = 0.45;

const DOT_STAGGER = 0.08;

const DOTS = [
  { cx: 6.5, cy: 12.5 },
  { cx: 8.5, cy: 7.5 },
  { cx: 13.5, cy: 6.5 },
  { cx: 17.5, cy: 10.5 },
];

const OUTLINE_VARIANTS: Variants = {
  normal: {
    strokeDashoffset: 0,
  },
  animate: {
    strokeDashoffset: [DASH_LENGTH, 0],
    transition: {
      duration: DRAW_DURATION,
      ease: [0.65, 0, 0.35, 1],
    },
  },
};

const DOTS_GROUP_VARIANTS: Variants = {
  normal: {},
  animate: {
    transition: {
      delayChildren: DRAW_DURATION,
      staggerChildren: DOT_STAGGER,
    },
  },
};

const DOT_VARIANTS: Variants = {
  normal: {
    scale: 1,
    transition: { duration: 0.2 },
  },
  animate: {
    // Two keyframes only: motion rejects 3+ keyframes on a spring.
    // Lower damping (10) = weaker restoring force = bigger, slower overshoot
    // before it settles — closer to the ~1.25 peak / softer landing we wanted,
    // versus damping 14 which snapped back to 1 too quickly.
    scale: [0, 1],
    transition: {
      damping: 10,
      stiffness: 300,
      type: "spring",
    },
  },
};

export const Palette = createAnimatedIcon("palette", controls => (
<svg
          fill="none"
          height={24}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={24}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.path
            animate={controls}
            d="M12 2a1 1 0 0 0 0 20l.25 0a1.75 1.75 0 0 0 1.4-2.8l-.3-.4a1.75 1.75 0 0 1 1.4-2.8h2.25a5 5 0 0 0 5-5 10 9 0 0 0-10-9z"
            initial="normal"
            strokeDasharray={DASH_LENGTH}
            variants={OUTLINE_VARIANTS}
          />
          <motion.g
            animate={controls}
            initial="normal"
            variants={DOTS_GROUP_VARIANTS}
          >
            {DOTS.map((dot) => (
              <motion.circle
                cx={dot.cx}
                cy={dot.cy}
                fill="currentColor"
                key={`${dot.cx}-${dot.cy}`}
                r=".5"
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
                variants={DOT_VARIANTS}
              />
            ))}
          </motion.g>
        </svg>
));
