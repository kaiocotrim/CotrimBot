"use client";

// Adapted from https://lucide-animated.com/r/bold.json; MIT license in ../lucide-animated/LICENSE.
import { motion, type Variants } from "framer-motion";
import { createAnimatedIcon } from "../create-animated-icon";

const PATH_VARIANTS: Variants = {
  normal: {
    strokeWidth: 2,
  },
  animate: {
    strokeWidth: 3.5,
  },
};

export const Bold = createAnimatedIcon("bold", controls => (
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
            d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"
            transition={{ duration: 0.6 }}
            variants={PATH_VARIANTS}
          />
        </svg>
));
