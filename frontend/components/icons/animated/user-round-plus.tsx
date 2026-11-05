"use client";

// Adapted from https://lucide-animated.com/r/user-round-plus.json; MIT license in ../lucide-animated/LICENSE.
import { motion, type Variants } from "framer-motion";
import { createAnimatedIcon } from "../create-animated-icon";

const VERTICAL_BAR_VARIANTS: Variants = {
  normal: {
    opacity: 1,
  },
  animate: {
    opacity: [0, 1],
    pathLength: [0, 1],
    transition: {
      delay: 0.3,
      duration: 0.2,
      opacity: { duration: 0.1, delay: 0.3 },
    },
  },
};

const HORIZONTAL_BAR_VARIANTS: Variants = {
  normal: {
    opacity: 1,
  },
  animate: {
    opacity: [0, 1],
    pathLength: [0, 1],
    transition: {
      delay: 0.6,
      duration: 0.2,
      opacity: { duration: 0.1, delay: 0.6 },
    },
  },
};

export const UserRoundPlus = createAnimatedIcon("user-round-plus", controls => (
<motion.svg
        fill="none"
        height={24}
        initial="normal"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width={24}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M2 21a8 8 0 0 1 13.292-6" />
        <circle cx="10" cy="8" r="5" />
        <motion.path
          animate={controls}
          d="M19 16v6"
          initial="normal"
          variants={VERTICAL_BAR_VARIANTS}
        />
        <motion.path
          animate={controls}
          d="M22 19h-6"
          initial="normal"
          variants={HORIZONTAL_BAR_VARIANTS}
        />
      </motion.svg>
));
