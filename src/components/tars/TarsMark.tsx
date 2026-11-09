import type { SVGProps } from "react";

/**
 * Tars's mark: two tall slabs of one articulated body, the right one swung out
 * mid-stride, with a narrow status strip on the upright one. An original
 * abstract drawing in the lucide stroke language (24 box, stroke 2, round caps),
 * so it sits beside lucide icons and inherits `currentColor` in every theme.
 */
export function TarsMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" data-tars-mark="" {...props}>
      <rect x="3" y="3" width="5" height="18" rx="1" />
      <path d="M12 3h5l3 18h-5z" />
      <path d="M5.5 7v3" />
    </svg>
  );
}
