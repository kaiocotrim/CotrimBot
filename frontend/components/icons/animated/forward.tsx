"use client";

// Adapted from https://lucide-animated.com/r/corner-up-right.json; MIT license in ../lucide-animated/LICENSE.
import { motion, type Variants } from "framer-motion";
import { createAnimatedIcon } from "../create-animated-icon";

const STRETCH_VARIANTS: Variants = {
  normal: { scaleX: 1, x: 0, opacity: 1 },
  animate: {
    scaleX: [1, 1.15, 1],
    x: [0, 2, 0],
    transition: {
      duration: 0.45,
      ease: "easeInOut",
    },
  },
};

export const Forward = createAnimatedIcon("forward", controls => (
<motion.svg
        animate={controls}
        fill="none"
        height={24}
        initial="normal"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        variants={STRETCH_VARIANTS}
        viewBox="0 0 24 24"
        width={24}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="m15 14 5-5-5-5" />
        <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
      </motion.svg>
));
