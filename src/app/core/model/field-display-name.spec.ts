import { fieldDisplayName } from './field-display-name';
import { Field } from '../models/types';

describe('field display names', () => {
  const field = { name: 'lab_id', deploymentName: 'lab_key', preferredLabel: 'Lab ID' } as Field;
  it('uses the preferred label instead of a generated name or key label', () => {
    for (const displayLabel of [undefined, '', 'lab_id', 'lab_key']) {
      expect(fieldDisplayName({ ...field, displayLabel })).toBe('Lab ID');
    }
  });
  it('retains an authored template label', () => {
    expect(fieldDisplayName({ ...field, displayLabel: 'Laboratory identifier' })).toBe('Laboratory identifier');
  });
  it('falls back to the artifact name when there is no display label', () => {
    expect(fieldDisplayName({ ...field, preferredLabel: undefined })).toBe('lab_id');
  });
});
