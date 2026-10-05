import { fieldToJson } from '../model/cedar-template';
import { fieldView, parentOf } from '../model/container-draft';
import type { ControlledTermSet, Field } from '../models/types';
import type { CedLanguageService } from '../../i18n/ced-language.service';
import type { TemplateService } from './template.service';
import type { TerminologyService } from './terminology.service';

type Outcome = 'applied' | 'rejected' | 'stale' | 'needs-clear';
export interface TerminologyEdit {
  readonly result: Promise<Outcome>;
  cancel(): void;
  clearDefaultAndApply(): boolean;
}

/** Membership, recovery and commit policy shared by both terminology controls. */
export class TerminologyEditCommands {
  constructor(
    private readonly service: TemplateService,
    private readonly terminology: TerminologyService,
    private readonly language: CedLanguageService,
  ) {}

  selectDefault(id: number, value: { iri: string; label: string }): TerminologyEdit {
    const selected = structuredClone(value);
    return this.run(id, 'defaultValue', async (field, signal) => {
      const allowed = await this.terminology.allowsDefault(
        fieldToJson({ ...field, defaultValue: { kind: 'none' }, importedChoiceDefault: undefined }),
        selected.iri,
        selected.label,
        signal,
      );
      return allowed
        ? { changes: { defaultValue: { kind: 'iri' as const, ...selected }, importedChoiceDefault: undefined } }
        : { error: this.language.t('defaultValue.termNotPermitted') };
    });
  }

  changeConstraints(id: number, constraints: ControlledTermSet): TerminologyEdit {
    const set = structuredClone(constraints);
    return this.run(id, 'controlledTerms', async (field, signal) => {
      const artifact = fieldToJson({ ...field, controlledTermConstraints: set, defaultValue: { kind: 'none' } });
      if (
        field.defaultValue.kind === 'iri' &&
        JSON.stringify(set) !== JSON.stringify(field.controlledTermConstraints)
      ) {
        const allowed =
          set.constraints.length > 0 &&
          (await this.terminology.allowsDefault(
            artifact,
            field.defaultValue.iri,
            field.defaultValue.label ?? field.defaultValue.iri,
            signal,
          ));
        if (!allowed)
          return {
            error: this.language.t('controlledTerms.defaultNotPermitted'),
            recovery: { defaultValue: { kind: 'none' as const }, controlledTermConstraints: set },
          };
      }
      return { changes: { controlledTermConstraints: set } };
    });
  }

  private run(
    id: number,
    setting: 'defaultValue' | 'controlledTerms',
    decide: (
      field: Field,
      signal: AbortSignal,
    ) => Promise<{
      changes?: Partial<Field>;
      error?: string;
      recovery?: Partial<Field>;
    }>,
  ): TerminologyEdit {
    const validation = this.service.validation;
    const node = parentOf(this.service.session.document(), id)?.children.find((child) => child.id === id);
    if (node?.kind !== 'field' || !validation.canEdit(id))
      return {
        result: Promise.resolve('stale'),
        cancel: () => {},
        clearDefaultAndApply: () => false,
      };
    validation.setInputError(id, setting, null, 'Constraints');
    const check = validation.beginCheck(id, setting, this.language.t('controlledTerms.checkingConstraints'));
    let cancelled = false;
    let recovery: Partial<Field> | undefined;
    const result = (async (): Promise<Outcome> => {
      try {
        const verdict = await decide(fieldView(node), check.signal);
        if (cancelled || !check.active()) return 'stale';
        if (verdict.error) {
          recovery = verdict.recovery;
          validation.setInputError(id, setting, verdict.error, 'Constraints');
          return recovery ? 'needs-clear' : 'rejected';
        }
        return this.service.updateFieldSettings(id, verdict.changes!) === null ? 'applied' : 'rejected';
      } catch (error) {
        if (cancelled || !check.active()) return 'stale';
        validation.setInputError(id, setting, this.language.describe(error), 'Constraints');
        return 'rejected';
      } finally {
        check.cancel();
      }
    })();
    return {
      result,
      cancel: () => {
        cancelled = true;
        check.cancel();
      },
      clearDefaultAndApply: () => {
        if (cancelled || !recovery || !check.unchanged()) return false;
        // Clearing the default and changing its vocabulary is one document edit.
        validation.setInputError(id, setting, null, 'Constraints');
        const changes = recovery;
        recovery = undefined;
        return this.service.updateFieldSettings(id, changes) === null;
      },
    };
  }
}
