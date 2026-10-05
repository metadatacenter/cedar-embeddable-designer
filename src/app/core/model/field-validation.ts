import { Field } from '../models/types';
import { Translate, describeError } from '../../i18n/messages';
import { SETTINGS_TABS } from '../../shared/settings-tabs';
import { choiceDefaultConflict, defaultValueFailure, fieldToJson } from './cedar-template';
import { failureRule, ValidationRule } from './validation-rule';

interface SettingGroup {
  setting: string;
  tab: string;
  keys: (keyof Field)[];
}
const groups: SettingGroup[] = [
  { setting: 'textConstraints', tab: SETTINGS_TABS.constraints, keys: ['textConstraints'] },
  { setting: 'numeric', tab: SETTINGS_TABS.constraints, keys: ['numeric'] },
  { setting: 'temporal', tab: SETTINGS_TABS.constraints, keys: ['temporal'] },
  { setting: 'media', tab: SETTINGS_TABS.content, keys: ['width', 'height'] },
  { setting: 'controlledTerms', tab: SETTINGS_TABS.constraints, keys: ['controlledTermConstraints'] },
  { setting: 'annotations', tab: SETTINGS_TABS.annotations, keys: ['annotations'] },
  { setting: 'language', tab: SETTINGS_TABS.display, keys: ['language'] },
];

/** Independent probes prevent one imported defect from concealing another setting. */
export function fieldValidationIssues(
  field: Field,
  t: Translate,
): { setting: string; tab: string; message: string; rule: ValidationRule }[] {
  const issues: ReturnType<typeof fieldValidationIssues> = [];
  const base: Field = {
    ...field,
    publishedDefinition: undefined,
    defaultValue: { kind: 'none' },
    importedChoiceDefault: undefined,
  };
  for (const group of groups) for (const key of group.keys) delete base[key];
  const defaults = { ...field, publishedDefinition: undefined, annotations: undefined, language: undefined };
  for (const group of groups) {
    if (!group.keys.some((key) => field[key] !== undefined)) continue;
    const probe = { ...base };
    for (const key of group.keys) Object.assign(probe, { [key]: field[key] });
    try {
      fieldToJson(probe);
    } catch (error) {
      issues.push({
        setting: group.setting,
        tab: group.tab,
        message: describeError(error, t),
        rule: failureRule(error, Object.fromEntries(group.keys.map((key) => [key, field[key]]))),
      });
      // Validate defaults against every usable constraint, even when another
      // setting is broken. Report that setting separately rather than twice.
      for (const key of group.keys) delete defaults[key];
    }
  }
  try {
    fieldToJson(base);
  } catch (error) {
    issues.push({
      setting: 'settings',
      tab: SETTINGS_TABS.constraints,
      message: describeError(error, t),
      rule: failureRule(error, base),
    });
  }
  const choice = choiceDefaultConflict(field, t);
  const failure = defaultValueFailure(defaults, field.defaultValue);
  if (choice || failure !== null)
    issues.push({
      setting: 'defaultValue',
      tab: SETTINGS_TABS.constraints,
      message: choice ?? describeError(failure, t),
      rule: choice
        ? {
            code: 'default.choiceConflict',
            parameters: { value: field.defaultValue, imported: field.importedChoiceDefault, options: field.options },
          }
        : failureRule(failure, {
            value: field.defaultValue,
            type: field.type,
            numeric: defaults.numeric,
            temporal: defaults.temporal,
            text: defaults.textConstraints,
            terms: defaults.controlledTermConstraints,
          }),
    });
  return issues;
}
