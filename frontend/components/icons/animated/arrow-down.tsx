"use client";

// Adapted from https://lucide-animated.com/r/arrow-down.json; MIT license in ../lucide-animated/LICENSE.
import { motion, type Variants } from "framer-motion";
import { createAnimatedIcon } from "../create-animated-icon";

const PATH_VARIANTS: Variants = {
  normal: { d: "m19 12-7 7-7-7", translateY: 0 },
  animate: {
    d: "m19 12-7 7-7-7",
    translateY: [0, -3, 0],
    transition: {
      duration: 0.4,
    },
  },
};

const SECOND_PATH_VARIANTS: Variants = {
  normal: { d: "M12 5v14" },
  animate: {
    d: ["M12 5v14", "M12 5v9", "M12 5v14"],
    transition: {
      duration: 0.4,
    },
  },
};

export const ArrowDown = createAnimatedIcon("arrow-down", controls => (
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
            d="m19 12-7 7-7-7"
            variants={PATH_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M12 5v14"
            variants={SECOND_PATH_VARIANTS}
          />
        </svg>
));
