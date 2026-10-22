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
