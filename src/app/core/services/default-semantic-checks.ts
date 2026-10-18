import { english, Translate } from '../../i18n/messages';
import { signal } from '@angular/core';
import { CedValidationIssue } from '../../ced-public-api';
import { ContainerDraft, fieldView } from '../model/container-draft';
import { fieldToJson, JsonSourcePolicy } from '../model/cedar-template';
import { fieldDisplayName } from '../model/field-display-name';
import { validAbsoluteIri } from '../model/cedar-model/iri-syntax';
import { SemanticAnswer, verifySemantic } from './terminology.service';

interface Check {
  controller: AbortController;
  answer: SemanticAnswer;
  pending: boolean;
  promise: Promise<void>;
  checkedAt: number;
}

const authorities: Record<string, string> = {
  orcid: 'orcid',
  ror: 'ror',
  pfas: 'comp-tox',
  pubmed: 'pmid',
  rrid: 'rrid',
  nihGrantId: 'nih-grant',
  doi: 'doi',
};
type Config = { bridgeBaseUrl?: string; terminologyBaseUrl?: string };
const normalized = (base: string | undefined) => (base ? (base.endsWith('/') ? base : `${base}/`) : null);

/** Checks every loaded/imported/default value, independent of which settings panel is mounted. */
export class DefaultSemanticChecks {
  readonly revision = signal(0);
  private readonly checks = new Map<string, Check>();
  private disposed = false;

  private expired(check: Check): boolean {
    const lifetime = ['unavailable', 'notChecked'].includes(check.answer.status) ? 30_000 : 300_000;
    return !check.pending && Date.now() - check.checkedAt >= lifetime;
  }

  /** Explicit validation retries old evidence without polling or restarting a pending request. */
  refreshExpired(): void {
    if ([...this.checks.values()].some((check) => this.expired(check)))
      this.revision.update((revision) => revision + 1);
  }

  inspect(document: ContainerDraft, config: Config, t: Translate = english) {
    this.revision();
    const used = new Set<string>();
    const issues: CedValidationIssue[] = [];
    const semanticChecks: Array<SemanticAnswer & { nodeId: number; path: number[] }> = [];
    let pendingValidation = false;
    const visit = (container: ContainerDraft, ancestors: number[]) => {
      const path = [...ancestors, container.id];
      for (const node of container.children) {
        if (node.kind === 'element') {
          visit(node.definition, path);
          continue;
        }
        const field = fieldView(node);
        const value = field.defaultValue;
        if (value.kind !== 'iri' || !value.iri) continue;
        const authority = authorities[field.type];
        const controlled = field.type === 'controlledTerms';
        if (!authority && !controlled) continue;
        // The local structural finding already identifies the repair. Semantic
        // verification cannot establish membership for a malformed identifier.
        if (!validAbsoluteIri(value.iri)) {
          semanticChecks.push({
            iri: value.iri,
            status: 'notChecked',
            code: 'semanticNotChecked',
            message: t('defaultValue.invalidIri'),
            nodeId: node.id,
            path: [...path, node.id],
          });
          continue;
        }
        let body: unknown = { iri: value.iri };
        if (controlled) {
          try {
            const artifact = fieldToJson({ ...field, defaultValue: { kind: 'none' } });
            body = { iri: value.iri, valueConstraints: artifact['_valueConstraints'] ?? {} };
          } catch {
            continue;
          } // The local structural report owns an unreadable definition.
        }
        const base = normalized(authority ? config.bridgeBaseUrl : config.terminologyBaseUrl);
        const url = base && (authority ? `${base}ext-auth/${authority}/verify` : `${base}bioportal/validate-term`);
        const key = JsonSourcePolicy.stringify([url, body]);
        used.add(key);
        let check = this.checks.get(key);
        if (check && this.expired(check)) {
          check.controller.abort();
          this.checks.delete(key);
          check = undefined;
        }
        if (!check) {
          const controller = new AbortController();
          check = {
            controller,
            answer: {
              iri: value.iri,
              status: 'notChecked',
              code: 'semanticNotChecked',
              message: url ? t('controlledTerms.checkingConstraints') : t('terminology.notConfigured'),
            },
            pending: !!url,
            promise: Promise.resolve(),
            checkedAt: Date.now(),
          };
          this.checks.set(key, check);
          if (url) {
            const current = check;
            current.promise = verifySemantic(url, body, value.iri, controller.signal).then((answer) => {
              if (this.disposed || controller.signal.aborted || this.checks.get(key) !== current) return;
              current.answer = answer;
              current.pending = false;
              current.checkedAt = Date.now();
              this.revision.update((revision) => revision + 1);
            });
          }
        }
        pendingValidation ||= check.pending;
        semanticChecks.push({ ...check.answer, nodeId: node.id, path: [...path, node.id] });
        if (check.answer.status !== 'passed')
          issues.push({
            nodeId: node.id,
            path: [...path, node.id],
            label: fieldDisplayName(field),
            setting: 'defaultValue',
            tab: 'Constraints',
            code: check.answer.code,
            message: check.pending
              ? t('controlledTerms.checkingConstraints')
              : check.answer.status === 'failed'
                ? t(controlled ? 'defaultValue.termNotPermitted' : 'defaultValue.invalid')
                : t(
                    check.answer.status === 'notChecked' && !url
                      ? 'terminology.notConfigured'
                      : 'terminology.unverified',
                  ),
            severity: check.answer.status === 'failed' ? 'error' : 'warning',
            source: 'model',
            shown: true,
          });
      }
    };
    visit(document, []);
    for (const [key, check] of this.checks)
      if (!used.has(key)) {
        check.controller.abort();
        this.checks.delete(key);
      }
    return { issues, semanticChecks, pendingValidation };
  }

  async settled(): Promise<void> {
    await Promise.all([...this.checks.values()].map((check) => check.promise));
  }
  dispose(): void {
    this.disposed = true;
    this.checks.forEach((check) => check.controller.abort());
    this.checks.clear();
  }
}
