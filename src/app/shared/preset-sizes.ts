/**
 * A pointer press that moves no further than this many pixels before its release is a click, as
 * for the header's settings shortcut.
 */
export const CLICK_SLOP = 5;

/**
 * The size after `current` among a divider's preset sizes, wrapping from the largest to the smallest.
 * A click on a divider steps it through its smallest, default and largest sizes, so that a pointer
 * can resize the panel with single clicks.
 */
export function nextPresetSize(current: number, presets: readonly number[]): number {
  const ascending = [...presets].sort((a, b) => a - b);
  return ascending.find((size) => size > current) ?? ascending[0];
}
