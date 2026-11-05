"use client";

// Adapted from https://lucide-animated.com/r/info.json; MIT license in ../lucide-animated/LICENSE.
import { motion, type Variants } from "framer-motion";
import { createAnimatedIcon } from "../create-animated-icon";

const VARIANTS: Variants = {
  normal: { rotate: 0 },
  animate: { rotate: [0, -10, 10, -10, 0] },
};

export const Info = createAnimatedIcon("info", controls => (
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
          <circle cx="12" cy="12" r="10" />
          <motion.g
            animate={controls}
            transition={{
              duration: 0.5,
              ease: "easeInOut",
            }}
            variants={VARIANTS}
          >
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </motion.g>
        </svg>
));
