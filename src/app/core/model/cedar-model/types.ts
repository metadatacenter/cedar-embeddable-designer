import { BiboStatus, SchemaVersion, TemplateField } from 'cedar-model-typescript-library';
import { ArtifactMetadata, Field } from '../../models/types';

/**
 * What a field builder is, for our purposes.
 *
 * The library exports every concrete builder but not the `TemplateFieldBuilder`
 * base they share, so the common setters are named here rather than reached for
 * through a cast at each call. The per-type additions — options, temporal
 * settings, controlled-term constraints — are narrowed where they are used,
 * because a text field genuinely has no `addRadioOption`.
 */
export type FieldBuilder = {
  withPreferredLabel(label: string | null): FieldBuilder;
  withAlternateLabels(labels: string[] | null): FieldBuilder;
  withSchemaIdentifier(identifier: string | null): FieldBuilder;
  withTitle(title: string | null): FieldBuilder;
  withDescription(description: string | null): FieldBuilder;
  withSchemaName(name: string | null): FieldBuilder;
  withSchemaDescription(description: string | null): FieldBuilder;
  withSchemaVersion(version: SchemaVersion): FieldBuilder;
  withStatus(status: BiboStatus): FieldBuilder;
  withAtId(atId: string): FieldBuilder;
  build(): TemplateField;
};

/** The template as the designer holds it, before it is a CEDAR artifact. */
export interface DesignerTemplate {
  /** The user-facing schema:identifier, independent of the artifact @id. */
  schemaIdentifier?: string | null;
  name: string;
  description: string;
  identifier: string;
  version: string;
  fields: Field[];
  metadata?: ContainerMetadata;
}

/** Imported container properties survive even where the designer offers no editor. */
export interface ContainerMetadata {
  artifact: ArtifactMetadata;
  language: string | null;
  annotations: Field['annotations'];
  instanceType: string | null;
  instanceTypes?: string[];
  header: string | null;
  footer: string | null;
}
