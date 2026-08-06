// SHIM: Single barrel export for the cedar-shim layer.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │  MIGRATION PATH (when @metadatacenter/cedar-model ships serializers):   │
// │                                                                         │
// │  1. npm install @metadatacenter/cedar-model@<version-with-serializers>  │
// │  2. Replace the two exports below with the package equivalents, e.g.:   │
// │       export { serialize as cedarSerialize } from '@metadatacenter/...' │
// │  3. Update CedarExportPanelComponent to call the new API shape          │
// │  4. Delete the entire cedar-shim/ folder                                │
// └─────────────────────────────────────────────────────────────────────────┘

export { toCedarJson } from './cedar-serializer';
export type { CedarTemplate, CedarField } from './cedar-model.types';
export { toCedarYaml, fromCedarYaml } from './cedar-yaml';
