/**
 * Quieten jsdom's CSS parser, which cannot read the stylesheet the element ships.
 *
 * The designer's styles are Tailwind 4: `@layer`, `oklch()` colours, and custom
 * properties declared with `@property`. jsdom's CSS parser predates all three and
 * reports "Could not parse CSS stylesheet" once per component that loads them —
 * eleven lines of noise per run, in the same stream a real failure appears in.
 *
 * Filtered by message rather than switched off wholesale: anything jsdom says for
 * another reason still reaches the console, so this hides a known limitation
 * rather than the next unknown problem.
 */
const original = console.error;

console.error = (...args: unknown[]): void => {
  const first = args[0];
  const message = first instanceof Error ? first.message : String(first);
  if (message.startsWith('Could not parse CSS stylesheet')) {
    return;
  }
  original(...args);
};
