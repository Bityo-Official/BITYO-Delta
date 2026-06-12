"use client";
// Client wrapper that lazy-loads the Three.js hero. Splitting it out (ssr:false) keeps
// `three` (~100KB+) out of the initial bundle — it loads after hydration. The canvas is
// a decorative `absolute inset-0` background, so deferring it causes no layout shift.
import dynamic from "next/dynamic";

const Hero3D = dynamic(() => import("./Hero3D").then((m) => m.Hero3D), {
	ssr: false,
});

export function HeroBackground() {
	return <Hero3D />;
}
