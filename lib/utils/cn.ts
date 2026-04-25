/**
 * `cn` — class-name merger.
 * clsx handles conditional truthiness; twMerge resolves Tailwind conflicts
 * (e.g. last `p-2 p-4` wins). Used everywhere — keep it tiny.
 *
 * Refs:
 *   https://github.com/lukeed/clsx
 *   https://github.com/dcastil/tailwind-merge
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
