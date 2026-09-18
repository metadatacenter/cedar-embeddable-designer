import { version } from '../../package.json';

/**
 * The designer's version, from the one file that has to be right.
 *
 * It used to be a literal in `app.component.html`, which is a second place to
 * remember to change and therefore a place that goes stale: it read `0.1.0` while the
 * package was already `0.1.0-dev.20260829.f44c4915`, so the header named a release
 * that had never been published and no build could be identified from it.
 *
 * The header shows this string and titles it with the same value, which is what CEE
 * does. A version that changes on every build is also a version no screenshot can
 * hold, so `visual.spec.ts` masks it — the same reason CEE's own baseline hides its
 * version stamp.
 */
export const CED_VERSION: string = version;
