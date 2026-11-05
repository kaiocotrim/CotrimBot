# Animated application icons

Import UI icons from `@/components/icons/animated-lucide`. The entry point keeps
the Lucide SVG API, including `size`, `className`, `strokeWidth`, SVG refs and
accessible labels. Animations respond to the entire containing control on hover,
keyboard focus and touch. Disabled and busy controls do not start animations.

Components in `animated/` adapt the SVG animations from
[Lucide Animated](https://lucide-animated.com/). Their MIT license is included in
`lucide-animated/LICENSE`. Icons without a compatible registry animation retain
their Lucide geometry and use the shared subtle animation. Loading spinners keep
their existing loading behavior. `AnimatedSvg` provides the same interaction for
custom SVG icons without changing their geometry or root transforms.

`use-icon-animation.ts` honors `prefers-reduced-motion` and removes event handlers
when an icon unmounts. Keep logos, flow diagrams, minimaps and progress graphics
in their existing components rather than replacing them with UI icons.

The original `lucide-animated/` components and `AnimatedIconButton` support the
navigation controls that explicitly drive an icon through its animation handle.

Validate changes with the frontend build, ESLint on `components/icons`, and
`animated-icons.spec.ts` in the existing Playwright suite.
