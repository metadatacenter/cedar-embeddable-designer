/**
 * A constraint edited on a field that already has a default.
 *
 * `validation-matrix.spec.ts` starts from a default that was invalid when the template was
 * imported. This starts from a default that was valid until the author changed a constraint
 * beneath it: lowered a bound past it, shortened a length, added a pattern, changed a datatype,
 * reduced a precision, renamed or removed a choice. An edit can leave the default valid, adjust it,
 * or make it invalid, and each has its own contract.
 *
 * An edit that leaves the default valid lands. An explicit reduction in precision lands and
 * truncates the default with it, because that is the one edit whose meaning is to discard digits.
 * Renaming a choice carries its default along, and removing the chosen option clears it. An edit
 * the default would no longer satisfy is held as a draft: the document keeps the constraint it had,
 * the setting shows why, and Save is refused. The author then clears the default, corrects it, or
 * reverts the constraint, and in the first two cases the held constraint lands with the new
 * default. Each outcome is asserted at the template's root and inside a repeating nested element,
 * and every settled state is saved and reopened to prove it is the one the artifact holds.
 */
import { TestBed } from '@angular/core/testing';
import { accepts, buildContainer, newContainer, templateToJson } from '../model/cedar-template';
import { ContainerDraft, fieldNode } from '../model/container-draft';
import { Field, FieldDefaultValue } from '../models/types';
import { TemplateService } from './template.service';
import { fieldSetting } from './validation-coordinator';

const literal = (value: string): FieldDefaultValue => ({ kind: 'literal', value });
const literals = (...values: string[]): FieldDefaultValue => ({ kind: 'literals', values });
const number = (value: number): FieldDefaultValue => ({ kind: 'number', value });
const temporal = (value: string): FieldDefaultValue => ({ kind: 'temporal', value });

function field(type: string, settings: Partial<Field>, defaultValue: FieldDefaultValue): Field {
  return {
    id: 1,
    type,
    name: 'Value',
    status: 'optional',
    allowMultiple: false,
    options: [],
    defaultValue,
    ...settings,
  };
}

const decimal = { type: 'xsd:decimal', min: 0, max: 100, decimalPlaces: null, unit: null };
const unconstrained = { minLength: null, maxLength: null, regex: null };
const day = { type: 'xsd:date' as const, granularity: 'day' as const, timezoneEnabled: false, inputTimeFormat: null };
const seconds = {
  type: 'xsd:time' as const,
  granularity: 'second' as const,
  timezoneEnabled: false,
  inputTimeFormat: '24h' as const,
};
const instant = {
  type: 'xsd:dateTime' as const,
  granularity: 'second' as const,
  timezoneEnabled: true,
  inputTimeFormat: '24h' as const,
};
const OPTIONS = ['Alpha', 'Beta', 'Gamma'];

/** What the edit does to the default: leaves it, changes it to a value, or is held back by it. */
type Outcome =
  { kind: 'kept' } | { kind: 'adjusted'; to: FieldDefaultValue } | { kind: 'held'; correction: FieldDefaultValue };
const kept: Outcome = { kind: 'kept' };
const adjusted = (to: FieldDefaultValue): Outcome => ({ kind: 'adjusted', to });
const held = (correction: FieldDefaultValue): Outcome => ({ kind: 'held', correction });

interface ConstraintEdit {
  readonly name: string;
  readonly field: Field;
  /** A settings edit, submitted as the field's settings form submits it. */
  readonly changes?: Partial<Field>;
  /** An edit made through its own control rather than the settings form. */
  readonly act?: (service: TemplateService, id: number) => void;
  /** The settings the field holds once the edit has landed, where they differ from the changes. */
  readonly landed?: Partial<Field>;
  readonly outcome: Outcome;
}

const EDITS: ConstraintEdit[] = [
  ...['number'].flatMap((type): ConstraintEdit[] => [
    {
      name: 'maximum lowered past the default',
      field: field(type, { numeric: decimal }, number(50)),
      changes: { numeric: { ...decimal, max: 40 } },
      outcome: held(number(30)),
    },
    {
      name: 'maximum lowered, default still inside',
      field: field(type, { numeric: decimal }, number(50)),
      changes: { numeric: { ...decimal, max: 60 } },
      outcome: kept,
    },
    {
      name: 'minimum raised past the default',
      field: field(type, { numeric: decimal }, number(50)),
      changes: { numeric: { ...decimal, min: 60 } },
      outcome: held(number(70)),
    },
    // The correction is valid only under the new bounds, so the two held edits can only land together.
    {
      name: 'bounds moved wholly past the default',
      field: field(type, { numeric: decimal }, number(50)),
      changes: { numeric: { ...decimal, min: 150, max: 200 } },
      outcome: held(number(175)),
    },
    {
      name: 'bounds removed',
      field: field(type, { numeric: decimal }, number(50)),
      changes: { numeric: { ...decimal, min: null, max: null } },
      outcome: kept,
    },
    {
      name: 'datatype made integer under a fractional default',
      field: field(type, { numeric: decimal }, number(2.5)),
      changes: { numeric: { ...decimal, type: 'xsd:int' } },
      outcome: held(number(2)),
    },
    {
      name: 'datatype made integer under a whole default',
      field: field(type, { numeric: decimal }, number(50)),
      changes: { numeric: { ...decimal, type: 'xsd:int' } },
      outcome: kept,
    },
    {
      name: 'decimal places reduced',
      field: field(type, { numeric: decimal }, number(2.25)),
      changes: { numeric: { ...decimal, decimalPlaces: 1 } },
      outcome: adjusted(number(2.2)),
    },
    {
      name: 'unit added',
      field: field(type, { numeric: decimal }, number(50)),
      changes: { numeric: { ...decimal, unit: 'mg' } },
      outcome: kept,
    },
  ]),
  ...['text', 'paragraph'].flatMap((type): ConstraintEdit[] => [
    {
      name: `${type} maximum length below the default`,
      field: field(type, { textConstraints: unconstrained }, literal('ABCD')),
      changes: { textConstraints: { ...unconstrained, maxLength: 3 } },
      outcome: held(literal('ABC')),
    },
    {
      name: `${type} maximum length above the default`,
      field: field(type, { textConstraints: unconstrained }, literal('ABCD')),
      changes: { textConstraints: { ...unconstrained, maxLength: 10 } },
      outcome: kept,
    },
    {
      name: `${type} minimum length above the default`,
      field: field(type, { textConstraints: unconstrained }, literal('ABCD')),
      changes: { textConstraints: { ...unconstrained, minLength: 5 } },
      outcome: held(literal('ABCDE')),
    },
    // Only a type that takes a pattern is offered one; the settings form clears it for any other.
    ...(accepts(type, 'textPattern')
      ? [
          {
            name: `${type} pattern the default fails`,
            field: field(type, { textConstraints: unconstrained }, literal('ABCD')),
            changes: { textConstraints: { ...unconstrained, regex: '^[a-z]+$' } },
            outcome: held(literal('abcd')),
          },
          {
            name: `${type} pattern the default matches`,
            field: field(type, { textConstraints: unconstrained }, literal('ABCD')),
            changes: { textConstraints: { ...unconstrained, regex: '^[A-Z]+$' } },
            outcome: kept,
          },
        ]
      : []),
  ]),
  {
    name: 'date precision reduced to the month',
    field: field('date', { temporal: day }, temporal('2026-09-09')),
    changes: { temporal: { ...day, granularity: 'month' } },
    outcome: adjusted(temporal('2026-09')),
  },
  {
    name: 'date precision reduced to the year',
    field: field('date', { temporal: day }, temporal('2026-09-09')),
    changes: { temporal: { ...day, granularity: 'year' } },
    outcome: adjusted(temporal('2026')),
  },
  {
    name: 'date precision raised above the default',
    field: field('date', { temporal: { ...day, granularity: 'month' } }, temporal('2026-09')),
    changes: { temporal: day },
    outcome: held(temporal('2026-09-01')),
  },
  {
    name: 'time precision reduced to the minute',
    field: field('time', { temporal: seconds }, temporal('14:30:15')),
    changes: { temporal: { ...seconds, granularity: 'minute' } },
    outcome: adjusted(temporal('14:30')),
  },
  {
    name: 'time zone turned off',
    field: field('time', { temporal: { ...seconds, timezoneEnabled: true } }, temporal('14:30:15Z')),
    changes: { temporal: seconds },
    outcome: adjusted(temporal('14:30:15')),
  },
  {
    name: 'date and time precision reduced to the minute',
    field: field('date', { temporal: instant }, temporal('2026-09-09T14:30:15Z')),
    changes: { temporal: { ...instant, granularity: 'minute' } },
    outcome: adjusted(temporal('2026-09-09T14:30Z')),
  },
  ...(['multipleChoice', 'singleChoiceList', 'checkboxes', 'multipleChoiceList'] as const).flatMap(
    (type): ConstraintEdit[] => {
      const many = type === 'checkboxes' || type === 'multipleChoiceList';
      const chosen = many ? literals('Alpha', 'Beta') : literal('Alpha');
      const base = field(type, { options: OPTIONS }, chosen);
      return [
        {
          name: `${type} chosen option renamed`,
          field: base,
          act: (service, id) => service.updateOption(id, 0, 'Delta'),
          landed: { options: ['Delta', 'Beta', 'Gamma'] },
          outcome: adjusted(many ? literals('Delta', 'Beta') : literal('Delta')),
        },
        {
          name: `${type} chosen option removed`,
          field: base,
          act: (service, id) => service.deleteOption(id, 0),
          landed: { options: ['Beta', 'Gamma'] },
          outcome: adjusted(many ? literals('Beta') : { kind: 'none' }),
        },
        {
          name: `${type} another option renamed`,
          field: base,
          act: (service, id) => service.updateOption(id, 2, 'Delta'),
          landed: { options: ['Alpha', 'Beta', 'Delta'] },
          outcome: kept,
        },
        {
          name: `${type} another option removed`,
          field: base,
          act: (service, id) => service.deleteOption(id, 2),
          landed: { options: ['Alpha', 'Beta'] },
          outcome: kept,
        },
      ];
    },
  ),
];

const PLACEMENTS = { 'the template root': 0, 'a repeating nested element': 2 } as const;
type Recovery = 'clear the default' | 'correct the default' | 'revert the constraint';
const RECOVERIES: Recovery[] = ['clear the default', 'correct the default', 'revert the constraint'];

/** A template holding the field at the given depth, each element on the way repeating. */
function templateHolding(value: Field, depth: number): object {
  const root = newContainer('template', 'Study');
  let container: ContainerDraft = root;
  for (let level = 1; level <= depth; level++) {
    const definition = newContainer('element', `Level ${level}`);
    container.children = [
      {
        id: definition.id,
        kind: 'element',
        definition,
        placement: { deploymentName: `Level ${level}`, allowMultiple: true },
      },
    ];
    container = definition;
  }
  container.children = [fieldNode(value)];
  return templateToJson(buildContainer(root));
}
function deepest(root: ContainerDraft): ContainerDraft {
  const child = root.children[0];
  return child?.kind === 'element' ? deepest(child.definition) : root;
}

const cases = EDITS.flatMap((edit) =>
  Object.entries(PLACEMENTS).flatMap(([placement, depth]) =>
    (edit.outcome.kind === 'held' ? RECOVERIES : [null]).map((recovery) => ({ edit, placement, depth, recovery })),
  ),
);

describe('a constraint edited under an existing default', () => {
  it('has an edit for each outcome and a recovery for each held edit', () => {
    expect(new Set(EDITS.map((edit) => edit.outcome.kind))).toEqual(new Set(['kept', 'adjusted', 'held']));
    expect(EDITS.every((edit) => !!edit.changes !== !!edit.act)).toBe(true);
  });

  it.each(cases.map((c) => [c.edit.name, c.placement, c.recovery ?? 'nothing to recover', c] as const))(
    '%s at %s, then %s',
    (_name, _placement, _recovery, { edit, depth, recovery }) => {
      const service = TestBed.inject(TemplateService);
      service.loadTemplate(templateHolding(edit.field, depth));
      const parent = deepest(service.document());
      const id = parent.children[0].id;
      const current = () => service.session.fieldBinding(parent.id)()[0];
      // The settings an edit touches, read off the field as the designer holds it.
      const touched = edit.landed ?? edit.changes!;
      const settings = () =>
        Object.fromEntries(Object.keys(touched).map((key) => [key, current()[key as keyof Field]]));
      const before = settings();
      const reopened = () => {
        service.loadTemplate(service.templateJson());
        const reloaded = deepest(service.document());
        return service.session.fieldBinding(reloaded.id)()[0];
      };
      expect(current().defaultValue).toEqual(edit.field.defaultValue);
      expect(service.validationReport().canSave).toBe(true);

      if (edit.act) edit.act(service, id);
      else service.updateFieldSettings(id, edit.changes!);

      if (edit.outcome.kind !== 'held') {
        const value = edit.outcome.kind === 'adjusted' ? edit.outcome.to : edit.field.defaultValue;
        expect(settings()).toEqual(touched);
        expect(current().defaultValue).toEqual(value);
        expect(service.validationReport()).toMatchObject({ valid: true, canSave: true, issues: [] });
        const saved = reopened();
        expect(saved.defaultValue).toEqual(value);
        for (const [key, setting] of Object.entries(touched)) expect(saved[key as keyof Field]).toEqual(setting);
        return;
      }

      // Held: the document keeps its constraint and its default, the setting says why, and Save is refused.
      const { setting } = fieldSetting(edit.changes!);
      expect(settings()).toEqual(before);
      expect(current().defaultValue).toEqual(edit.field.defaultValue);
      expect(service.validation.error(id, setting)).toEqual(expect.any(String));
      expect(service.validationReport().canSave).toBe(false);
      expect(service.validationReport().issues).toEqual([expect.objectContaining({ nodeId: id, setting })]);

      if (recovery === 'revert the constraint') service.updateFieldSettings(id, before as Partial<Field>);
      else
        service.updateDefaultValue(id, recovery === 'clear the default' ? { kind: 'none' } : edit.outcome.correction);
      const settled = {
        settings: recovery === 'revert the constraint' ? before : touched,
        defaultValue:
          recovery === 'revert the constraint'
            ? edit.field.defaultValue
            : recovery === 'clear the default'
              ? { kind: 'none' }
              : edit.outcome.correction,
      };
      expect(settings()).toEqual(settled.settings);
      expect(current().defaultValue).toEqual(settled.defaultValue);
      expect(service.validation.error(id, setting)).toBeNull();
      expect(service.validationReport()).toMatchObject({ valid: true, canSave: true, issues: [] });
      const saved = reopened();
      expect(saved.defaultValue).toEqual(settled.defaultValue);
      for (const [key, value] of Object.entries(settled.settings)) expect(saved[key as keyof Field]).toEqual(value);
    },
  );
});
