# CEDAR Embeddable Designer (CED)

[![Test](https://github.com/metadatacenter/cedar-embeddable-designer/actions/workflows/test.yml/badge.svg?branch=develop)](https://github.com/metadatacenter/cedar-embeddable-designer/actions/workflows/test.yml)

The CEDAR Embeddable Designer (CED) puts metadata template authoring inside a web
application. Authors assemble fields and reusable groups, define their allowed
values and defaults, and preview the form that will collect the metadata. The
host application receives a CEDAR template that it can store and use in its own
workflow.

A template describes what metadata to collect: field names, value types,
requirements, repeated groups, and controlled vocabularies. CED lets the people
responsible for those requirements maintain them through a visual interface,
without writing schemas by hand or building a template authoring tool.

CED complements the [CEDAR Embeddable Editor
(CEE)](https://github.com/metadatacenter/cedar-embeddable-editor): CED creates the
templates, and CEE renders them as forms for collecting metadata. The same CED
bundle also includes the CEDAR Embeddable Field Designer (CEFD), for creating or
editing an individual field definition.

CED ships as a standard Web Component. It can be embedded in plain HTML or an
Angular, React, or other web application without requiring the host to install
Angular. Basic template authoring needs neither a CEDAR account nor a running
CEDAR installation. Lookup and repository features use services supplied by
the host.

## Documentation

The [CEDAR Embeddable Designer documentation](https://metadatacenter.readthedocs.io/en/latest/cedar-embeddable-designer/)
covers installation, templates and elements, validation, reusable content,
standalone fields, service configuration, and appearance.

[Your First Embedded Designer](https://metadatacenter.readthedocs.io/en/latest/cedar-embeddable-designer/first-designer/)
builds a working page from the published packages.
[Artifacts and Validation](https://metadatacenter.readthedocs.io/en/latest/cedar-embeddable-designer/artifacts-and-validation/)
explains what a host supplies, what it reads back, and how to save safely.

## Installing

Stable releases are published on npm as
[`cedar-embeddable-designer`](https://www.npmjs.com/package/cedar-embeddable-designer):

```shell
npm install cedar-embeddable-designer
```

To check the current stable release:

```shell
npm view cedar-embeddable-designer version
```

The package contains `cedar-embeddable-designer.js`, the self-contained bundle,
and `cedar-embeddable-designer.d.ts`, declarations for both designer elements
and their public APIs. Copy the bundle to the application's static assets and
load it with a regular `<script>` tag. It is a classic script, not an ES module.

### Preview, Field Controls, and Terminology

Install the sibling components for form preview, default-value controls, and
vocabulary selection:

```shell
npm install cedar-embeddable-editor cedar-embeddable-term-picker
```

Copy their `cedar-embeddable-editor.js` and `cedar-embeddable-term-picker.js`
bundles to the same asset directory. CEE also registers CEF, which supplies
individual field controls. These components are loaded separately and are not
included in the CED bundle.

### Hosts That Already Supply CEDAR Fonts

The default bundle includes CEDAR Roboto 400 and 500. Hosts that register those
fonts in a global stylesheet can instead load
`cedar-embeddable-designer.host-fonts.js`. Both variants register CED and CEFD
with the same API; load only one. Without the host's font faces, the host-font
variant uses the shared system fallback stack.

## Embedding

Load the bundles, wait for registration, and start a template:

```html
<cedar-embeddable-designer></cedar-embeddable-designer>

<script src="/assets/cedar-embeddable-term-picker.js"></script>
<script src="/assets/cedar-embeddable-editor.js"></script>
<script src="/assets/cedar-embeddable-designer.js"></script>
<script type="module">
  await customElements.whenDefined('cedar-embeddable-designer');
  const designer = document.querySelector('cedar-embeddable-designer');

  designer.config = {};
  designer.addEventListener('artifactChange', (event) => {
    console.log('Current template:', event.detail);
  });
  designer.addEventListener('validationChange', (event) => {
    console.log('Ready to save:', event.detail.canSave);
  });
  designer.newArtifact('template');
</script>
```

Set configuration before opening or creating a document. The empty configuration
supports basic authoring. Supply `terminologyBaseUrl` for vocabulary constraints
and controlled-term defaults, and `bridgeBaseUrl` for external-authority defaults.
Use your deployment's service bases; neither endpoint has a default. The
terminology service must support the Term Picker's version-aware search API.

Call `loadArtifact(source)` to open an existing template or element. It accepts
a JSON object, JSON text, or CEDAR YAML text and throws on invalid input without
replacing the current document. The `artifact` property accepts the same inputs
but reports unreadable input to the console. Use JavaScript properties for
objects, rather than HTML attributes.

`currentArtifact` and `artifactChange` contain the complete root artifact,
including edits to nested elements. The output is CEDAR JSON Schema with JSON-LD
annotations. CED does not submit or store it; the host controls persistence.

## Validation and Saving

Check `designer.validate().canSave` immediately before reading `currentArtifact`
for a save. An unfinished setting may be invalid while the last accepted
artifact is still valid, so the last change event is not a save-readiness check.
Listen for `validationChange` to update a host Save button and for `dirtyChange`
to track unsaved work, including incomplete edits.

Numeric constraints and defaults can contain exact values beyond JavaScript's
number precision. Use the model library's `JsonSourcePolicy.stringify` for a
JSON request body; ordinary `JSON.stringify` is not the exact-number serializer.
[Artifacts and Validation](https://metadatacenter.readthedocs.io/en/latest/cedar-embeddable-designer/artifacts-and-validation/)
includes a serialization example, server findings, merged-payload validation,
save-response handling, and recovery through `captureDraft()` and `restoreDraft()`.

Set `readOnly = true` for inspection without edits. Published definitions remain
locked independently of the host flag. Local validation complements server
validation, permissions, and publication rules.

## Reusable Elements and Standalone Fields

Use `newArtifact('element')` to author a standalone element. Supply a
`childSource` adapter to search and load existing fields and elements from a
repository. The host controls authentication and permissions; CED has no default
repository. See [Reusable Fields and Elements](https://metadatacenter.readthedocs.io/en/latest/cedar-embeddable-designer/reusable-content/).

The same bundle registers `<cedar-embeddable-field-designer>` for a field-only
workflow:

```typescript
import type { CedarEmbeddableFieldDesignerElement } from 'cedar-embeddable-designer';

await customElements.whenDefined('cedar-embeddable-field-designer');
const fieldDesigner = document.createElement('cedar-embeddable-field-designer') as CedarEmbeddableFieldDesignerElement;
document.body.append(fieldDesigner);
fieldDesigner.config = {};
fieldDesigner.newArtifact('text');
```

Omit the type to show the field-type chooser. CEFD shares the loading, validation,
change, recovery, and read-only APIs. It edits the field definition; its placement
inside a parent, including requirement and repetition, is configured in CED.
[Designing a Single Field](https://metadatacenter.readthedocs.io/en/latest/cedar-embeddable-designer/field-designer/)
covers the complete workflow.

## Appearance and Language

Both elements support English (`en`) and Hungarian (`hu`) through the `language`
property or attribute. English is the default. Language can change at runtime
and applies independently to each instance. Author-written content is never
translated.

The components use Shadow DOM and CEDAR's shared design tokens. See
[Configuration and Appearance](https://metadatacenter.readthedocs.io/en/latest/cedar-embeddable-designer/configuration/)
for framework integration, service requirements, fonts, and host security, and
the [shared styling guide](https://github.com/metadatacenter/cedar-embeddable-editor/blob/develop/STYLING.md)
for the common CEDAR control contract.

## Developing the Component

For source builds, use the Node version in `.nvmrc`:

```shell
nvm use
npm ci
npm run dist
```

`npm start` runs the development host. `npm run test:ci` runs the complete gate,
including browser and visual checks. These are contributor commands; embedding
the published package requires no component build.

[Development notes](https://github.com/metadatacenter/cedar-embeddable-designer/blob/develop/docs/development.md)
cover sibling integration, demos, testing, packaging, and styling ownership.
Within a CEDAR checkout, use `cedarcli build frontends` for a local source build
and deployment, or `cedarcli test frontends` for the source build and checks.
The reactor supplies current local dependencies automatically.

The package also includes `integration.mjs` for coordinated Angular host builds.
Its manifest records exact runtime requirements; ordinary embeds use the
self-contained script above.

## License

[BSD 2-Clause](https://github.com/metadatacenter/cedar-embeddable-designer/blob/develop/license.txt).
