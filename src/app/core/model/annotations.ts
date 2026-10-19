import { isBlank } from './cedar-model/text-policy';
import { Field } from '../models/types';
import { Message, message } from '../../i18n/messages';
import { validAbsoluteIri } from './cedar-model/iri-syntax';

/** One rule for supplied annotations, model construction and the row editor. */
export function annotationError(rows: NonNullable<Field['annotations']>): Message | null {
  const names = new Set<string>();
  for (const row of rows) {
    if (isBlank(row.name)) return message('annotations.nameRequired');
    if (names.has(row.name)) return message('annotations.nameUnique');
    names.add(row.name);
    if (isBlank(row.value)) return message('annotations.valueRequired');
    if (row.kind === 'iri' && !validAbsoluteIri(row.value)) return message('annotations.valueIri');
  }
  return null;
}
