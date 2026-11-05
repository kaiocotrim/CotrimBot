"use client";

import { motion } from "framer-motion";
import { forwardRef, type SVGProps } from "react";
import { subtleIconVariants } from "./create-animated-icon";
import { useIconAnimation } from "./use-icon-animation";

/** Preserve custom SVG geometry and root transforms while animating its contents. */
export const AnimatedSvg = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(
  function AnimatedSvg({ children, ...props }, forwardedRef) {
    const { ref, controls } = useIconAnimation(forwardedRef);
    return (
      <svg ref={ref} {...props} data-animated-icon="custom">
        <motion.g initial="normal" animate={controls} variants={subtleIconVariants} style={{ transformOrigin: "center", transformBox: "fill-box" }}>
          {children}
        </motion.g>
      </svg>
    );
  },
);
