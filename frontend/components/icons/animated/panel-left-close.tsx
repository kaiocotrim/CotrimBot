"use client";

// Adapted from https://lucide-animated.com/r/panel-left-close.json; MIT license in ../lucide-animated/LICENSE.
import { motion, type Variants, type Transition } from "framer-motion";
import { createAnimatedIcon } from "../create-animated-icon";

const DEFAULT_TRANSITION: Transition = {
  times: [0, 0.4, 1],
  duration: 0.5,
};

const PATH_VARIANTS: Variants = {
  normal: { x: 0 },
  animate: { x: [0, -1.5, 0] },
};

export const PanelLeftClose = createAnimatedIcon("panel-left-close", controls => (
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
        <rect height="18" rx="2" width="18" x="3" y="3" />
        <path d="M9 3v18" />
        <motion.path
          animate={controls}
          d="m16 15-3-3 3-3"
          transition={DEFAULT_TRANSITION}
          variants={PATH_VARIANTS}
        />
      </svg>
));
