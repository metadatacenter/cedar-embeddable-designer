/**
 * Tags for the tests that need a real sibling bundle. CI's real-bundle job builds CEE, CEF and the term
 * picker and names them in CEF_BUNDLE and PICKER_BUNDLE, and any other run leaves those unset. The
 * config filters a tagged test out of a run whose variable is unset, so the test is never scheduled
 * there, rather than scheduled and skipped.
 */
export const NEEDS_CEF = '@needs-cef';
export const NEEDS_PICKER = '@needs-picker';
