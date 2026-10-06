/**
 * The settings tabs, by the identifiers the validation report carries.
 *
 * A tab's identifier is the English name it has always had, because
 * `CedValidationIssue.tab` publishes it to hosts and a host may compare against it.
 * What an author reads is the tab's label, rendered from the translation key below.
 */
export const SETTINGS_TABS = {
  configuration: 'Configuration',
  display: 'Display',
  constraints: 'Constraints',
  content: 'Content',
  annotations: 'Annotations',
  fieldMetadata: 'Field metadata',
  elementMetadata: 'Element metadata',
  templateMetadata: 'Template Metadata',
} as const;

const TAB_KEYS: Readonly<Record<string, string>> = {
  [SETTINGS_TABS.configuration]: 'tabs.configuration',
  [SETTINGS_TABS.display]: 'tabs.display',
  [SETTINGS_TABS.constraints]: 'tabs.constraints',
  [SETTINGS_TABS.content]: 'tabs.content',
  [SETTINGS_TABS.annotations]: 'tabs.annotations',
  [SETTINGS_TABS.fieldMetadata]: 'tabs.fieldMetadata',
  [SETTINGS_TABS.elementMetadata]: 'tabs.elementMetadata',
  [SETTINGS_TABS.templateMetadata]: 'tabs.templateMetadata',
};

/** The translation key of a tab's label. */
export function settingsTabKey(tab: string): string {
  return TAB_KEYS[tab] ?? tab;
}
