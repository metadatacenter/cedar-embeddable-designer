import type { CedJsonObject } from '../../ced-public-api';
import { buildContainer, newContainer, newFieldIdentity, readContainer, templateToJson } from '../model/cedar-template';
import { fieldNode } from '../model/container-draft';
import { EditorSession } from './editor-session';
import { ValidationCoordinator } from './validation-coordinator';
import { english } from '../../i18n/messages';

function document() {
  const root = newContainer('template', 'Study');
  root.children = [
    fieldNode({
      id: 100000,
      type: 'text',
      name: 'Value',
      status: 'optional',
      allowMultiple: false,
      options: [],
      defaultValue: { kind: 'none' },
      ...newFieldIdentity(),
    }),
  ];
  return root;
}

it.each([false, true])('reports and repairs imported malformed field language, standalone=%s', (standalone) => {
  const source = templateToJson(buildContainer(document())) as CedJsonObject;
  const properties = source['properties'] as CedJsonObject;
  const field = properties['Value'] as CedJsonObject;
  (field['@context'] as CedJsonObject)['@language'] = 'a b';
  const session = new EditorSession(readContainer(source));
  session.access.fieldDocument.set(standalone);
  const validation = new ValidationCoordinator(session, english);
  try {
    expect(validation.report().canSave).toBe(false);
    expect(validation.report().issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ setting: 'language', severity: 'error', source: 'model' })]),
    );
    const id = session.document().children[0].id;
    expect(validation.submit(id, { language: 'en' }, 'language', 'Display')).toBeNull();
    expect(validation.report().canSave).toBe(true);
  } finally {
    validation.dispose();
  }
});

describe('a standalone field document', () => {
  const report = (children: ReturnType<typeof document>['children']) => {
    const root = newContainer('template', 'Field document');
    root.children = children;
    const session = new EditorSession(root);
    session.access.fieldDocument.set(true);
    const validation = new ValidationCoordinator(session, english);
    try {
      return validation.report();
    } finally {
      validation.dispose();
    }
  };
  const field = () => document().children[0];

  // The field designer opens on its type chooser with no field yet. There is nothing to judge, and
  // an error there would be announced before the author has chosen anything.
  it('reports nothing while no field has been chosen', () => {
    expect(report([]).issues).toEqual([]);
  });

  it('reports a second definition, or an element where the field belongs', () => {
    const second = { ...field(), id: 100001 };
    expect(report([field(), second]).issues).toEqual([
      expect.objectContaining({ setting: 'artifact', message: 'Expected one field definition.' }),
    ]);
    const element = newContainer('element', 'Group');
    expect(
      report([
        {
          kind: 'element',
          id: element.id,
          definition: element,
          placement: { deploymentName: 'Group', allowMultiple: false },
        },
      ]).issues,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ message: 'Expected one field definition.' })]));
  });

  it('judges the one field it holds', () => {
    expect(report([field()]).issues).toEqual([]);
  });
});

it('rejects a new malformed language at the central command boundary', () => {
  const session = new EditorSession(document()),
    validation = new ValidationCoordinator(session, english);
  try {
    expect(validation.submit(100000, { language: 'a b' }, 'language', 'Display')).not.toBeNull();
    expect(session.fieldBinding()()[0].language).not.toBe('a b');
    expect(validation.report().canSave).toBe(false);
    expect(validation.submit(100000, { language: 'en' }, 'language', 'Display')).toBeNull();
    expect(validation.report().canSave).toBe(true);
  } finally {
    validation.dispose();
  }
});

it.each([2147483648, 9007199254740992])('rejects occurrence %s before it reaches the Java reader', (maxItems) => {
  const session = new EditorSession(document()),
    validation = new ValidationCoordinator(session, english);
  try {
    expect(validation.submit(100000, { allowMultiple: true, maxItems }, 'occurrences', 'Configuration')).not.toBeNull();
    expect(validation.report().canSave).toBe(false);
    expect(
      validation.submit(100000, { allowMultiple: true, maxItems: 2147483647 }, 'occurrences', 'Configuration'),
    ).toBeNull();
    expect(validation.report().canSave).toBe(true);
  } finally {
    validation.dispose();
  }
});
