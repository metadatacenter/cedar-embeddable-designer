// SHIM: Single barrel export for the cedar-shim layer.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │  MIGRATION PATH:                                                        │
// │                                                                         │
// │  @org.metadatacenter/cedar-model-typescript-library already ships the   │
// │  JSON and YAML readers and writers this folder re-implements by hand,   │
// │  and CEE consumes it today. Replace the exports below with the library  │
// │  equivalents and delete the entire cedar-shim/ folder.                  │
// └─────────────────────────────────────────────────────────────────────────┘

export { toCedarJson } from './cedar-serializer';
export { toCedarYaml, fromCedarYaml } from './cedar-yaml';
