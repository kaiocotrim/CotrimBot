"use client";

import { motion, type Variants } from "framer-motion";
import type { LucideIcon, LucideProps } from "lucide-react";
import { cloneElement, forwardRef, type ReactElement, type SVGProps } from "react";
import { useIconAnimation } from "./use-icon-animation";

export const subtleIconVariants: Variants = {
  normal: { scale: 1, rotate: 0, y: 0 },
  animate: {
    scale: [1, 1.08, 1],
    rotate: [0, -5, 5, 0],
    transition: { duration: 0.4, ease: "easeInOut" },
  },
};

/** Keep the SVG/Lucide contract: refs, sizing, stroke, labels and event handlers. */
export function createAnimatedIcon(name: string, render: (controls: ReturnType<typeof useIconAnimation>["controls"]) => ReactElement) {
  const Icon = forwardRef<SVGSVGElement, LucideProps>(function AnimatedIcon({
    size = 24, color = "currentColor", strokeWidth = 2, absoluteStrokeWidth,
    className, style, children, ...props
  }, forwardedRef) {
    const { ref, controls } = useIconAnimation(forwardedRef);
    const svg = render(controls) as ReactElement<SVGProps<SVGSVGElement>>;
    return cloneElement(svg, {
      "aria-hidden": props["aria-label"] || props["aria-labelledby"] ? undefined : true,
      ...props,
      ref,
      width: size,
      height: size,
      stroke: color,
      strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
      className: `lucide lucide-${name} ${className ?? ""}`,
      style: { ...svg.props.style, ...style },
      ...({ "data-animated-icon": name }),
    }, svg.props.children, children);
  });
  Icon.displayName = `${name}AnimatedIcon`;
  return Icon;
}

/** Original Lucide glyph with the same interaction treatment when no registry icon exists. */
export function animateLucideIcon(name: string, icon: LucideIcon) {
  const MotionIcon = motion.create(icon);
  return createAnimatedIcon(name, controls => (
    <MotionIcon initial="normal" animate={controls} variants={subtleIconVariants} />
  ));
}
