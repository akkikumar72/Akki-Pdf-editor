import { clsx, type ClassValue } from "clsx";

/**
 * Class-name joiner. This codebase styles with hand-written BEM classes (no
 * Tailwind), so plain clsx covers every call site — tailwind-merge's
 * conflict-resolution pass was ~100KB of bundled source doing nothing.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
