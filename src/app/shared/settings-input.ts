import type { Field } from '../core/models/types';

/** Native number inputs expose malformed text as an empty value. Keep its invalid identity
 * alongside the rest of the draft, so recreating a control cannot turn it into an accepted bound. */
export interface SettingsInputDraft {
  changes: Partial<Field>;
  invalid: Record<string, string>;
}

export function invalidSettingsInputs(
  root: HTMLElement | undefined,
  previous: Record<string, string> = {},
  changed?: string,
): Record<string, string> {
  const invalid = { ...previous };
  if (changed) delete invalid[changed];
  for (const input of Array.from(root?.querySelectorAll('input') ?? []))
    if (input.validity.badInput) invalid[input.name] = input.closest('label')?.textContent?.trim() ?? '';
  return invalid;
}
