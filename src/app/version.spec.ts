/**
 * The version the header shows, held to the one that ships.
 *
 * The header used to carry `0.1.0` as a literal in the template while the package was
 * already `0.1.0-dev.20260829.f44c4915`, so it named a release that had never been
 * published and no build could be identified from it. Deriving it fixed that; this is
 * what stops it drifting back, because a literal in a template is the easiest thing
 * in the world to reintroduce and the hardest to notice.
 */
import { describe, expect, it } from 'vitest';
import { version } from '../../package.json';
import { CED_VERSION } from './version';

describe('the designer version', () => {
  it('is the version of the package that ships', () => {
    expect(CED_VERSION).toBe(version);
  });

  it('is a version rather than a placeholder', () => {
    expect(CED_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
