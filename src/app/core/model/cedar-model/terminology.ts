import type { FieldBuilder } from './types';
import { ControlledTermConfig, ControlledTermSet } from '../../models/types';
import {
  BioportalTermType,
  CedarFieldType,
  ControlledTermActionBuilder,
  ControlledTermBranchBuilder,
  ControlledTermClassBuilder,
  ControlledTermField,
  ControlledTermFieldBuilder,
  ControlledTermOntologyBuilder,
  ControlledTermValueSetBuilder,
  ControlledTermVersion,
  Iri,
  TemplateField,
} from 'cedar-model-typescript-library';

/**
 * The URI CEDAR gives an ontology, from its acronym.
 *
 * An acronym is not a URI, and this was writing one into the URI slot: JSON came
 * out saying `"uri": "DOID"` while the YAML path — which derives the URI from the
 * acronym itself — said `https://data.bioontology.org/ontologies/DOID`. The same
 * template written in the two formats was two different artifacts, and only one
 * of them named an ontology.
 *
 * The base is stated here because the model library derives it internally and
 * exports no constant for it. Anything already absolute is left alone, so a
 * source that arrives with a real URI keeps it.
 */
const BIOPORTAL_ONTOLOGY_BASE = 'https://data.bioontology.org/ontologies/';

function ontologyUri(acronym: string): string {
  return /^https?:\/\//.test(acronym) ? acronym : `${BIOPORTAL_ONTOLOGY_BASE}${acronym}`;
}

export function buildControlledTermSet(builder: FieldBuilder, set: ControlledTermSet | undefined): void {
  if (!set) return;
  for (const config of set.constraints) buildControlledTerm(builder, config);
  for (const action of set.actions) {
    (builder as ControlledTermFieldBuilder).addAction(
      new ControlledTermActionBuilder()
        .withAction(action.action)
        .withTo(action.to ?? null)
        .withTermUri(new Iri(action.termUri))
        .withSourceUri(new Iri(action.sourceUri))
        .withSource(action.source)
        .withType(BioportalTermType.forJsonValue(action.type))
        .build(),
    );
  }
}

function buildControlledTerm(builder: FieldBuilder, config: ControlledTermConfig | undefined): void {
  if (!config) {
    return;
  }
  /*
   * The snapshot the author pinned, given to whichever entry is being built. An
   * entry with no version resolves against the latest snapshot the terminology
   * server serves, which is what a null means here rather than an omission.
   */
  const version = config.version
    ? new ControlledTermVersion(
        config.version.id,
        config.version.effectiveDate ?? null,
        config.version.declaredVersion ?? null,
      )
    : null;
  // The real builder, rather than a hand-written shape reached through `as unknown`:
  // `ControlledTermFieldBuilder` declares all four adders, and only a controlled-term
  // field gets here.
  const controlled = builder as ControlledTermFieldBuilder;

  switch (config.sourceType) {
    case 'ontology':
      if (config.ontologyId) {
        controlled.addOntology(
          new ControlledTermOntologyBuilder()
            .withVersion(version)
            .withIri(config.iri ? new Iri(config.iri) : null)
            .withSourceSystem(config.sourceSystem ?? null)
            .withUri(new Iri(config.uri ?? ontologyUri(config.ontologyId)))
            .withNumTerms(config.numTerms ?? null)
            .withAcronym(config.ontologyId)
            .withName(config.ontologyName ?? '')
            .build(),
        );
      }
      break;
    case 'ontology-branch':
      if (config.branchRootId) {
        controlled.addBranch(
          new ControlledTermBranchBuilder()
            .withVersion(version)
            .withIri(config.iri ? new Iri(config.iri) : null)
            .withSourceSystem(config.sourceSystem ?? null)
            .withUri(new Iri(config.branchRootId))
            .withSource(config.source ?? config.sourceId ?? '')
            .withAcronym(config.sourceId ?? '')
            .withName(config.branchRootName ?? '')
            .withMaxDepth(config.searchDepth ?? 1)
            .build(),
        );
      }
      break;
    case 'ontology-term':
      if (config.sourceId) {
        controlled.addClass(
          new ControlledTermClassBuilder()
            .withVersion(version)
            .withIri(config.iri ? new Iri(config.iri) : null)
            .withSourceSystem(config.sourceSystem ?? null)
            .withUri(new Iri(config.sourceId))
            .withSource(config.source ?? config.ontologyId ?? '')
            .withType(BioportalTermType.forJsonValue(config.termType ?? 'OntologyClass'))
            .withLabel(config.label ?? config.sourceName ?? '')
            .withPrefLabel(config.sourceName ?? '')
            .build(),
        );
      }
      break;
    case 'value-set':
      if (config.sourceId) {
        controlled.addValueSet(
          new ControlledTermValueSetBuilder()
            .withVersion(version)
            .withIri(config.iri ? new Iri(config.iri) : null)
            .withSourceSystem(config.sourceSystem ?? null)
            .withUri(new Iri(config.sourceId))
            .withNumTerms(config.numTerms ?? null)
            .withVsCollection(config.ontologyId ?? '')
            .withName(config.sourceName ?? '')
            .build(),
        );
      }
      break;
  }
}

/** The snapshot an entry names, as the designer records one. */
function versionRefOf(entry: {
  version?: { id: string; effectiveDate: string | null; declaredVersion: string | null } | null;
}) {
  const version = entry.version;
  if (!version) {
    return undefined;
  }
  return {
    id: version.id,
    effectiveDate: version.effectiveDate ?? undefined,
    declaredVersion: version.declaredVersion ?? undefined,
  };
}

export function controlledTermConstraintsOf(field: TemplateField): ControlledTermSet | undefined {
  if (field.cedarFieldType !== CedarFieldType.CONTROLLED_TERM) return undefined;
  const c = (field as ControlledTermField).valueConstraints;
  const common = (
    entry:
      | (typeof c.ontologies)[number]
      | (typeof c.branches)[number]
      | (typeof c.classes)[number]
      | (typeof c.valueSets)[number],
  ) => ({
    iri: entry.iri?.getValue() ?? undefined,
    sourceSystem: entry.sourceSystem ?? undefined,
    version: versionRefOf(entry),
  });
  return {
    constraints: [
      ...c.ontologies.map((o): ControlledTermConfig => ({
        ...common(o),
        sourceType: 'ontology',
        uri: o.uri.getValue() ?? '',
        sourceId: o.acronym,
        ontologyId: o.acronym,
        ontologyName: o.name,
        numTerms: o.numTerms,
      })),
      ...c.branches.map((b): ControlledTermConfig => ({
        ...common(b),
        sourceType: 'ontology-branch',
        sourceId: b.acronym,
        source: b.source,
        branchRootId: b.uri.getValue() ?? '',
        branchRootName: b.name,
        searchDepth: b.maxDepth,
      })),
      ...c.classes.map((t): ControlledTermConfig => ({
        ...common(t),
        sourceType: 'ontology-term',
        sourceId: t.uri.getValue() ?? '',
        ontologyId: t.source,
        source: t.source,
        label: t.label,
        sourceName: t.prefLabel,
        termType: t.type.getJsonValue() as 'OntologyClass' | 'Value',
      })),
      ...c.valueSets.map((v): ControlledTermConfig => ({
        ...common(v),
        sourceType: 'value-set',
        sourceId: v.uri.getValue() ?? '',
        ontologyId: v.vsCollection,
        sourceName: v.name,
        numTerms: v.numTerms,
      })),
    ],
    actions: c.actions.map((a) => ({
      action: a.action,
      termUri: a.termUri.getValue() ?? '',
      sourceUri: a.sourceUri.getValue() ?? '',
      source: a.source,
      type: a.type.getJsonValue() as 'OntologyClass' | 'Value',
      ...(a.to === null ? {} : { to: a.to }),
    })),
  };
}
