import { TestBed } from '@angular/core/testing';
import { DesignerTemplate, buildTemplate, defaultValueError, templateToJson } from '../model/cedar-template';
import { Field, FieldDefaultValue } from '../models/types';
import { TemplateService } from './template.service';

/**
 * A choice field's default and its options.
 *
 * A choice default is one of the field's options, and the Java validator refuses a stored default that
 * is not ("Not one of the permitted choices"). The designer opens such a template, keeps the default
 * the author did not choose, reports it, and refuses to save until it is resolved. It also refuses to
 * take a new default that is not an option, and to write two defaults outside the options, since
 * CEDAR can store only one. Each refusal is held to its message, so a check that stops firing fails
 * here even where another check would still block Save.
 */
const CHOICE_TYPES = ['multipleChoice', 'singleChoiceList', 'checkboxes', 'multipleChoiceList'];
const takesSeveral = (type: string) => type === 'checkboxes' || type === 'multipleChoiceList';

function defaults(type: string, values: string[]): FieldDefaultValue {
  if (!values.length) return { kind: 'none' };
  return takesSeveral(type) ? { kind: 'literals', values } : { kind: 'literal', value: values[0] };
}

function colour(type: string, selected: string[], stored?: string): Field {
  return {
    id: 1,
    type,
    name: 'Colour',
    status: 'optional',
    allowMultiple: false,
    options: ['Red', 'Green', 'Blue'],
    defaultValue: defaults(type, selected),
    ...(stored === undefined ? {} : { importedChoiceDefault: stored }),
  };
}

function study(field: Field): DesignerTemplate {
  return {
    name: 'Study',
    description: '',
    identifier: 'https://repo.metadatacenter.org/templates/22222222-2222-4222-8222-222222222222',
    version: '0.0.1',
    fields: [field],
  };
}

/** Open a stored template holding the field, as a host would hand it to the designer. */
function opened(field: Field): TemplateService {
  const service = TestBed.inject(TemplateService);
  service.loadTemplate(templateToJson(buildTemplate(study(field))));
  return service;
}

describe.each(CHOICE_TYPES)('a %s default', (type) => {
  it('outside the options is kept, reported, and refuses Save until it is cleared', () => {
    const service = opened(colour(type, ['Yellow'], 'Yellow'));
    const [field] = service.fields();

    expect(field.options).toEqual(['Red', 'Green', 'Blue']);
    expect(field.importedChoiceDefault).toBe('Yellow');
    expect(service.validationReport().canSave).toBe(false);
    expect(service.validationReport().issues).toContainEqual(
      expect.objectContaining({
        nodeId: field.id,
        setting: 'defaultValue',
        message:
          'The default “Yellow” is not among the allowed options. Change or clear the default, or add it to the options.',
      }),
    );

    expect(service.updateDefaultValue(field.id, { kind: 'none' })).toBeNull();
    expect(service.validationReport()).toMatchObject({ canSave: true, issues: [] });
  });

  it('stored beside a different selected option is reported, and refuses Save until it is cleared', () => {
    const service = opened(colour(type, ['Green'], 'Red'));
    const [field] = service.fields();

    expect(field.importedChoiceDefault).toBe('Red');
    expect(service.validationReport().canSave).toBe(false);
    expect(service.validationReport().issues).toContainEqual(
      expect.objectContaining({
        nodeId: field.id,
        setting: 'defaultValue',
        message:
          'The imported default “Red” conflicts with the selected default. Choose a default or clear it to resolve this.',
      }),
    );

    expect(service.updateDefaultValue(field.id, { kind: 'none' })).toBeNull();
    expect(service.validationReport()).toMatchObject({ canSave: true, issues: [] });
  });

  it('that is not an option is refused, and the field keeps its default', () => {
    const service = TestBed.inject(TemplateService);
    service.templateName.set('Study');
    service.fields.set([colour(type, ['Green'])]);
    expect(service.validationReport().canSave).toBe(true);
    const outside = defaults(type, ['Yellow']);

    // The model refuses the value; the card names it, as it does for a stored default outside the options.
    expect(defaultValueError(colour(type, []), outside)).toBe('Choose a default from the field options.');
    expect(service.updateDefaultValue(1, outside)).toBe(
      'The default “Yellow” is not among the allowed options. Change or clear the default, or add it to the options.',
    );
    expect(service.fields()[0].defaultValue).toEqual(defaults(type, ['Green']));
    expect(service.validationReport().canSave).toBe(false);

    expect(service.updateDefaultValue(1, defaults(type, ['Blue']))).toBeNull();
    expect(service.fields()[0].defaultValue).toEqual(defaults(type, ['Blue']));
    expect(service.validationReport().canSave).toBe(true);
  });
});

it.each(CHOICE_TYPES.filter(takesSeveral))('a %s field will not write two defaults outside its options', (type) => {
  expect(() => buildTemplate(study(colour(type, ['Yellow', 'Purple'])))).toThrow(
    'Only one scalar choice default can be preserved.',
  );
  expect(() => buildTemplate(study(colour(type, ['Yellow', 'Red'])))).not.toThrow();
});
