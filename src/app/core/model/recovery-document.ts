import { ContainerDraft } from './container-draft';
import { FIELD_TYPES } from '../models/types';

/** Check the structural contract before any live session sees imported recovery data. */
export function recoveryDocument(value: unknown): { document: ContainerDraft; maximumId: number } {
  const ids = new Set<number>();
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const fail = () => {
    throw new Error();
  };
  const identity = (id: unknown) => {
    if (
      typeof id !== 'number' ||
      !Number.isSafeInteger(id) ||
      id < 0 ||
      id > Number.MAX_SAFE_INTEGER - 1000000 ||
      ids.has(id)
    )
      fail();
    ids.add(id as number);
  };
  const visit = (v: unknown, elementId?: number): void => {
    if (!object(v)) return fail();
    if (elementId === undefined) identity(v['id']);
    else if (v['id'] !== elementId) return fail();
    if (
      !['template', 'element'].includes(String(v['kind'])) ||
      ['name', 'description', 'identifier', 'version'].some((key) => typeof v[key] !== 'string') ||
      !Array.isArray(v['children'])
    )
      return fail();
    for (const child of v['children']) {
      if (!object(child) || !object(child['placement']) || !object(child['definition'])) return fail();
      identity(child['id']);
      if (child['kind'] === 'element') visit(child['definition'], child['id'] as number);
      else if (
        child['kind'] !== 'field' ||
        !Object.hasOwn(FIELD_TYPES, String(child['definition']['type'])) ||
        typeof child['definition']['name'] !== 'string' ||
        !Array.isArray(child['definition']['options'])
      )
        return fail();
    }
  };
  visit(value);
  return { document: value as ContainerDraft, maximumId: Math.max(...ids) };
}
