/**
 * Compact YAML, refused.
 *
 * The compact form leaves out every value that has a default — `status`, `version` and
 * `modelVersion` among them — which makes it an incomplete serialisation and a
 * write-only one. The CEDAR libraries produce it; nothing should consume it. Reading it
 * would not recover a template but invent the parts that were left out, and a template
 * whose model version was guessed is worse than a file that would not open.
 *
 * So the claim here is a refusal, and that the refusal is phrased for whoever opened
 * the file. The model library's own message says a compact reader "has to be asked
 * for", which reads as an invitation to go and ask; these tests are what stops someone
 * accepting it.
 */
import { describe, expect, it } from 'vitest';
import { CedarWriters } from 'cedar-model-typescript-library';
import { buildTemplate, newFieldIdentity, readField, readTemplate, templateToYaml } from './cedar-template';
import { Field } from '../models/types';

const field = (overrides: Partial<Field> = {}): Field => ({
  id: 1,
  type: 'text',
  name: 'F',
  status: 'required',
  options: [],
  defaultValue: { kind: 'literal', value: 'x' },
  allowMultiple: false,
  ...newFieldIdentity(),
  ...overrides,
});

const template = () =>
  buildTemplate({
    name: 'Study',
    description: 'A study',
    identifier: 'https://repo.metadatacenter.org/templates/11111111-1111-4111-8111-111111111111',
    version: '0.0.1',
    fields: [field()],
  });

const compactTemplate = () => CedarWriters.yaml().getStrict().getTemplateWriter().getAsYamlString(template(), true);

const compactField = () => {
  const built = template().getField('F')!;
  return CedarWriters.yaml().getStrict().getFieldWriterForField(built).getAsYamlString(built, true);
};

describe('the compact form', () => {
  /** What makes it incomplete, stated against the two documents rather than asserted. */
  it('leaves out the values the full form states', () => {
    const compact = compactTemplate();
    const full = templateToYaml(template());

    for (const key of ['status', 'version', 'modelVersion']) {
      expect(full, `the full form states ${key}`).toContain(`${key}:`);
      expect(compact, `the compact form omits ${key}`).not.toContain(`${key}:`);
    }
  });

  it('is refused as a template, in words for whoever opened it', () => {
    expect(() => readTemplate(compactTemplate())).toThrow(/compact YAML/);
    expect(() => readTemplate(compactTemplate())).toThrow(/Open the full YAML or the JSON instead/);
  });

  it('is refused as a field, for the same reason', () => {
    expect(() => readField(compactField())).toThrow(/compact YAML/);
    expect(() => readField(compactField())).toThrow(/Open the full YAML or the JSON instead/);
  });

  /** The refusal has to be specific, or it is just a reader that rejects YAML. */
  it('does not refuse the full form', () => {
    expect(() => readTemplate(templateToYaml(template()))).not.toThrow();
  });
});
