"use client";

// Adapted from https://lucide-animated.com/r/moon.json; MIT license in ../lucide-animated/LICENSE.
import { motion, type Variants, type Transition } from "framer-motion";
import { createAnimatedIcon } from "../create-animated-icon";

const SVG_VARIANTS: Variants = {
  normal: {
    rotate: 0,
  },
  animate: {
    rotate: [0, -10, 10, -5, 5, 0],
  },
};

const SVG_TRANSITION: Transition = {
  duration: 1.2,
  ease: "easeInOut",
};

export const Moon = createAnimatedIcon("moon", controls => (
<motion.svg
          animate={controls}
          fill="none"
          height={24}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          transition={SVG_TRANSITION}
          variants={SVG_VARIANTS}
          viewBox="0 0 24 24"
          width={24}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </motion.svg>
));
