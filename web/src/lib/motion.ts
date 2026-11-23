import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let registered = false;

/** Registers GSAP plugins once (browser only) and returns gsap. */
export function registerGsap(): typeof gsap {
  if (!registered && typeof window !== "undefined") {
    gsap.registerPlugin(ScrollTrigger, Flip);
    registered = true;
  }
  return gsap;
}

/** Every animation is wrapped in this query: with reduced motion the page simply shows its final state. */
export const MOTION_OK = "(prefers-reduced-motion: no-preference)";
