/**
 * Real templates, opened and saved.
 *
 * Every other suite here feeds CED templates the TypeScript model library wrote,
 * which cannot answer the first question anyone will ask: can it open what
 * production already holds. These 38 artifacts were authored by people and by the
 * production Template Editor, so they are the only input in this repository
 * independent of the library on the other side of the comparison.
 *
 * The claims are computed from each artifact rather than listed, which matters more
 * here than anywhere else in the test suite. A corpus test with expected numbers
 * written beside each file name records what someone once observed; this one states
 * a rule and checks it against 38 cases, so refreshing the corpus tests the rule
 * again instead of needing 38 numbers updated.
 *
 * Two of those rules are about the artifacts rather than about CED, and they are the
 * more interesting half. Real templates are not all well formed: one names a child in
 * `_ui.order` that its `properties` does not contain, and one stores a default that
 * violates its own regular expression. Both are defects of the kind the CEDAR
 * production audits look for, and neither is CED's to fix. What is CED's is behaving
 * predictably in their presence, and saying so here is what stops someone reading a
 * red test as a regression.
 */
import { describe, expect, it } from 'vitest';
import { buildTemplate, readTemplate, templateToJson, toDesignerTemplate } from './cedar-template';

/**
 * The corpus, inlined at build time.
 *
 * `import.meta.glob` rather than `node:fs`: the spec environment is bundled for the
 * browser and has no filesystem. `src/import-meta-glob.d.ts` declares the one member
 * used.
 */
const files = import.meta.glob<{ default: Record<string, unknown> }>('./fixtures/corpus/*.json', {
  eager: true,
});

const EXPECTED_TEMPLATES = 38;

interface CorpusTemplate {
  readonly id: string;
  readonly source: Record<string, unknown>;
  /** Children `_ui.order` names, split by what `properties` actually holds for each. */
  readonly declaredFields: string[];
  readonly declaredElements: string[];
  readonly orphanedOrder: string[];
}

/** What a template declares, read straight out of the artifact. */
function describeSource(id: string, source: Record<string, unknown>): CorpusTemplate {
  const order = ((source['_ui'] as { order?: string[] } | undefined)?.order ?? []) as string[];
  const properties = (source['properties'] ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const declaredFields: string[] = [];
  const declaredElements: string[] = [];
  const orphanedOrder: string[] = [];

  for (const key of order) {
    const property = properties[key];
    if (!property) {
      orphanedOrder.push(key);
      continue;
    }
    // A child taking several values is written as an array whose `items` hold it.
    const definition = (property['items'] as Record<string, unknown>) ?? property;
    const type = String(definition['@type'] ?? '');
    if (type.includes('TemplateElement')) declaredElements.push(key);
    else if (type.includes('TemplateField')) declaredFields.push(key);
    else orphanedOrder.push(key);
  }
  return { id, source, declaredFields, declaredElements, orphanedOrder };
}

const corpus: CorpusTemplate[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, module]) => describeSource(path.split('/').pop()!.replace('.json', ''), module.default));

/**
 * Whether the artifact's own stored default satisfies the constraints stored beside
 * it.
 *
 * Read off the artifact so the set of inconsistent templates is discovered rather
 * than named. CED refuses to write a field whose default breaks its own constraints,
 * and this is what says the refusal lands on exactly the artifacts that deserve it.
 */
function defaultContradictsConstraints(source: Record<string, unknown>): boolean {
  const properties = (source['properties'] ?? {}) as Record<string, Record<string, unknown> | undefined>;
  return Object.values(properties).some((property) => {
    const definition = (property?.['items'] as Record<string, unknown>) ?? property;
    const constraints = definition?.['_valueConstraints'] as Record<string, unknown> | undefined;
    const value = constraints?.['defaultValue'];
    if (typeof value !== 'string') return false;
    const min = constraints?.['minLength'];
    const max = constraints?.['maxLength'];
    const pattern = constraints?.['regex'];
    if (typeof min === 'number' && value.length < min) return true;
    if (typeof max === 'number' && value.length > max) return true;
    if (typeof pattern === 'string' && !new RegExp(pattern).test(value)) return true;
    return false;
  });
}

describe('the vendored corpus', () => {
  /**
   * A missing fixture is a hard error, not a smaller test run. The failure this
   * guards is a suite that goes green because its oracle disappeared.
   */
  it('is complete', () => {
    expect(corpus).toHaveLength(EXPECTED_TEMPLATES);
    expect(corpus.filter((template) => Object.keys(template.source).length === 0)).toEqual([]);
  });

  it('is real artifacts rather than library output', () => {
    // Generated files carry these markers in their names; none should have been copied.
    expect(corpus.filter((template) => /generated|original/.test(template.id))).toEqual([]);
  });
});

describe.each(
  corpus
    .filter((template) => template.declaredElements.length === 0)
    .map((template) => [template.id, template] as const),
)('%s', (_id, template) => {
  it('opens', () => {
    expect(() => toDesignerTemplate(readTemplate(template.source))).not.toThrow();
  });

  it('keeps every field it declares', () => {
    const state = toDesignerTemplate(readTemplate(template.source));

    expect(state.fields.map((field) => field.deploymentName ?? field.name)).toEqual(template.declaredFields);
  });

  /**
   * Saving is where an inconsistent artifact stops being CED's problem to carry.
   *
   * Which templates refuse is derived from the artifacts, so this asserts a rule —
   * a default that breaks its own constraints cannot be written back — rather than a
   * file name someone noticed once.
   */
  it('saves, unless its own default contradicts its own constraints', () => {
    const state = toDesignerTemplate(readTemplate(template.source));

    if (defaultContradictsConstraints(template.source)) {
      // And it says which field, which is the difference between a refusal an author
      // can act on and one that only says the template is wrong somewhere.
      const offender = state.fields.find((field) => field.textConstraints)?.name;
      expect(() => buildTemplate(state)).toThrow(/does not satisfy these text constraints/);
      expect(() => buildTemplate(state)).toThrow(new RegExp(`^${offender}: `));
      return;
    }
    expect(() => buildTemplate(state)).not.toThrow();
  });

  it('settles after one save, or refuses outright', () => {
    const state = toDesignerTemplate(readTemplate(template.source));
    if (defaultContradictsConstraints(template.source)) return;

    const first = templateToJson(buildTemplate(state));
    const second = templateToJson(buildTemplate(toDesignerTemplate(readTemplate(first))));

    expect(second).toEqual(first);
  });
});

/**
 * The shape of the corpus, asserted once so the gaps above are legible as a total
 * rather than as scattered per-file behaviour. These are the numbers to look at when
 * deciding what to build next, and each is a rule applied to the artifacts rather
 * than a count typed in.
 */
describe('what the corpus says CED can do', () => {
  it('refuses exactly the templates containing unsupported elements', () => {
    const unopenable = corpus.filter((template) => {
      try {
        toDesignerTemplate(readTemplate(template.source));
        return false;
      } catch {
        return true;
      }
    });
    expect(unopenable.map((template) => template.id)).toEqual(
      corpus.filter((template) => template.declaredElements.length > 0).map((template) => template.id),
    );
    for (const template of unopenable) {
      expect(() => toDesignerTemplate(readTemplate(template.source))).toThrow(/Element editing is not supported/);
    }
  });

  it('cannot yet represent the templates that use elements', () => {
    const withElements = corpus.filter((template) => template.declaredElements.length > 0);

    expect(withElements.map((template) => template.id)).toEqual([
      'template-028',
      'template-029',
      'template-031',
      'template-035',
      'template-037',
    ]);
    // Thirty children in total, which is what elements support would recover.
    expect(withElements.reduce((total, template) => total + template.declaredElements.length, 0)).toBe(30);
  });

  it('meets one template whose order names a child it does not define', () => {
    const withOrphans = corpus.filter((template) => template.orphanedOrder.length > 0);

    expect(withOrphans.map((template) => template.id)).toEqual(['template-003']);
  });

  it('meets one template it cannot save, because the artifact disagrees with itself', () => {
    const inconsistent = corpus.filter((template) => defaultContradictsConstraints(template.source));

    expect(inconsistent.map((template) => template.id)).toEqual(['template-008']);
  });
});
