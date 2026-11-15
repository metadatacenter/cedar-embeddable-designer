import { TestBed } from '@angular/core/testing';
import { TemplateService } from '../services/template.service';
/**
 * Real templates, opened and saved.
 *
 * Every other suite here feeds CED templates the TypeScript model library wrote,
 * which cannot answer the first question anyone will ask: can it open what
 * production already holds. These 38 artifacts were authored by people and by the
 * production Template Editor, so they are the only input in this repository
 * independent of the library on the other side of the comparison.
 *
 * Each template goes through the path a host's template takes: `loadTemplate`, the
 * designer's validation, and the artifact it would save. The claims are computed from
 * each artifact rather than listed, which matters more here than anywhere else in the
 * test suite. A corpus test with expected numbers written beside each file name records
 * what someone once observed; this one states a rule and checks it against 38 cases, so
 * refreshing the corpus tests the rule again instead of needing 38 numbers updated.
 *
 * Some of those rules are about the artifacts rather than about CED, and they are the
 * more interesting half. Real templates are not all well formed: one names a child in
 * `_ui.order` that its `properties` does not contain, one stores a default that violates
 * its own regular expression, and two store a choice default that disagrees with their
 * options. These are defects of the kind the CEDAR production audits look for, and
 * none is CED's to fix. What is CED's is behaving predictably in their presence, and
 * saying so here is what stops someone reading a red test as a regression.
 */
import { describe, expect, it } from 'vitest';

/**
 * The corpus, inlined at build time.
 *
 * `import.meta.glob` rather than `node:fs`: the spec environment is bundled for the
 * browser and has no filesystem. `src/import-meta-glob.d.ts` declares the one member
 * used. The workspace-root path also resolves when Angular gives the coverage
 * run a virtual test-file location.
 */
const files = import.meta.glob<{ default: Record<string, unknown> }>('/src/app/core/model/fixtures/corpus/*.json', {
  eager: true,
});

const EXPECTED_TEMPLATES = 38;

type Json = Record<string, unknown>;

interface CorpusTemplate {
  readonly id: string;
  readonly source: Json;
  /** Children `_ui.order` names, split by what `properties` actually holds for each. */
  readonly declaredChildren: string[];
  readonly declaredElements: string[];
  readonly orphanedOrder: string[];
}

/** What a template declares, read straight out of the artifact. */
function describeSource(id: string, source: Json): CorpusTemplate {
  const order = ((source['_ui'] as { order?: string[] } | undefined)?.order ?? []) as string[];
  const properties = (source['properties'] ?? {}) as Record<string, Json | undefined>;
  const declaredChildren: string[] = [];
  const declaredElements: string[] = [];
  const orphanedOrder: string[] = [];

  for (const key of order) {
    const property = properties[key];
    if (!property) {
      orphanedOrder.push(key);
      continue;
    }
    // A child taking several values is written as an array whose `items` hold it.
    const definition = (property['items'] as Json) ?? property;
    const type = String(definition['@type'] ?? '');
    if (type.includes('TemplateElement')) declaredElements.push(key);
    if (type.includes('TemplateElement') || type.includes('TemplateField')) declaredChildren.push(key);
    else orphanedOrder.push(key);
  }
  return { id, source, declaredChildren, declaredElements, orphanedOrder };
}

const corpus: CorpusTemplate[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, module]) => describeSource(path.split('/').pop()!.replace('.json', ''), module.default));

/** Every field definition a container holds, at any depth. */
function fieldDefinitions(container: Json): Json[] {
  return Object.values((container['properties'] ?? {}) as Record<string, unknown>).flatMap((property) => {
    if (property === null || typeof property !== 'object') return [];
    const definition = ((property as Json)['items'] as Json) ?? (property as Json);
    const type = String(definition['@type'] ?? '');
    if (type.includes('TemplateElement')) return fieldDefinitions(definition);
    return type.includes('TemplateField') ? [definition] : [];
  });
}

/**
 * Whether a stored text default breaks the constraints stored beside it.
 *
 * Read off the artifact so the set of inconsistent templates is discovered rather
 * than named. CED refuses to write a field whose default breaks its own constraints.
 */
function textDefaultContradictsConstraints(definition: Json): boolean {
  const constraints = definition['_valueConstraints'] as Json | undefined;
  const value = constraints?.['defaultValue'];
  if (!constraints || typeof value !== 'string' || constraints['literals'] !== undefined) return false;
  const min = constraints['minLength'];
  const max = constraints['maxLength'];
  const pattern = constraints['regex'];
  if (typeof min === 'number' && value.length < min) return true;
  if (typeof max === 'number' && value.length > max) return true;
  return typeof pattern === 'string' && !new RegExp(pattern).test(value);
}

/**
 * Whether a choice field's stored default disagrees with its options.
 *
 * A stored default must name one of the options, and the option it names must be the selected
 * one where any is selected. The Java validator refuses the first; the designer refuses both, and
 * keeps the default until the author resolves it.
 */
function choiceDefaultDisagrees(definition: Json): boolean {
  const constraints = definition['_valueConstraints'] as Json | undefined;
  const literals = constraints?.['literals'] as { label: string; selectedByDefault?: boolean }[] | undefined;
  const value = constraints?.['defaultValue'];
  if (!literals || typeof value !== 'string') return false;
  const selected = literals.filter((literal) => literal.selectedByDefault).map((literal) => literal.label);
  return !literals.some((literal) => literal.label === value) || (selected.length > 0 && !selected.includes(value));
}

/** Why the designer must refuse to save a template, as read from the template itself. */
function refusals(template: CorpusTemplate): string[] {
  const definitions = fieldDefinitions(template.source);
  return [
    ...(template.source['bibo:status'] === 'bibo:published' ? ['published'] : []),
    ...(definitions.some(textDefaultContradictsConstraints) ? ['text default'] : []),
    ...(definitions.some(choiceDefaultDisagrees) ? ['choice default'] : []),
  ];
}

/** The template opened as a host opens it, with its asynchronous checks finished. */
async function opened(template: CorpusTemplate): Promise<TemplateService> {
  const service = TestBed.inject(TemplateService);
  service.loadTemplate(structuredClone(template.source));
  await service.validation.settled();
  return service;
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

describe.each(corpus.map((template) => [template.id, template] as const))('%s', (_id, template) => {
  it('opens with every child it declares, elements included', async () => {
    const service = await opened(template);

    expect(service.loadError()).toBeNull();
    expect(service.document().children.map((child) => service.childKey(child.id))).toEqual(template.declaredChildren);
  });

  /**
   * Saving is where an inconsistent artifact stops being CED's problem to carry, and where a
   * published one is only read. Which templates refuse is derived from the artifacts, so this
   * asserts a rule rather than a file name someone noticed once.
   */
  it('can be saved exactly when nothing in it requires a refusal', async () => {
    const service = await opened(template);
    const reasons = refusals(template);
    const report = service.validationReport();

    expect(report.pendingValidation).toBeUndefined();
    expect(report.canSave).toBe(reasons.length === 0);
    expect(service.access.readOnly()).toBe(reasons.includes('published'));
    const refused = report.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.setting);
    expect(refused.includes('defaultValue')).toBe(
      reasons.includes('text default') || reasons.includes('choice default'),
    );
  });

  it('settles after one save', async () => {
    const service = await opened(template);
    const first = service.templateJson();

    service.loadTemplate(first);
    expect(service.templateJson()).toEqual(first);
  });
});

/**
 * The shape of the corpus, asserted once so the cases above are legible as a total
 * rather than as scattered per-file behaviour. Each is a rule applied to the artifacts
 * rather than a count typed in.
 */
describe('what the corpus holds', () => {
  it('opens the templates that use elements, with every element they hold', async () => {
    const withElements = corpus.filter((template) => template.declaredElements.length > 0);

    expect(withElements.map((template) => template.id)).toEqual([
      'template-028',
      'template-029',
      'template-031',
      'template-035',
      'template-037',
    ]);
    let elements = 0;
    for (const template of withElements) {
      const service = await opened(template);
      elements += service.document().children.filter((child) => child.kind === 'element').length;
    }
    expect(elements).toBe(30);
  });

  it('meets one template whose order names a child it does not define', () => {
    const withOrphans = corpus.filter((template) => template.orphanedOrder.length > 0);

    expect(withOrphans.map((template) => template.id)).toEqual(['template-003']);
  });

  it('meets three published templates and three that disagree with themselves', () => {
    const refusing = corpus
      .map((template) => [template.id, refusals(template)] as const)
      .filter(([, reasons]) => reasons.length > 0);

    expect(Object.fromEntries(refusing)).toEqual({
      'template-008': ['text default'],
      'template-020': ['choice default'],
      'template-027': ['published'],
      'template-028': ['published'],
      'template-033': ['published'],
      'template-038': ['choice default'],
    });
  });
});
