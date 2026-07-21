// Plain mutable ref (not React state) driving the globe<->flat morph.
// Every layer reads this in its own useFrame; GSAP tweens it directly on
// toggle. Keeping it outside React state is what lets the morph run at
// 60fps without triggering a re-render on every frame — same pattern used
// in batuhan-bas/the-geographies.
export const morphProgressRef = { current: 0 };
