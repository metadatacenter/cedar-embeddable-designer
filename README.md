# CEDAR Embeddable Designer (CED)

The CEDAR Embeddable Designer is a Web Component for authoring CEDAR metadata
templates and elements. An author assembles a document from fields and nested elements, constrains fields to
ontologies, branches, terms and value sets, and the component produces a CEDAR
template that any CEDAR service can store, validate and render.

CED is the authoring half of a pair. The [CEDAR Embeddable Editor
(CEE)](https://github.com/metadatacenter/cedar-embeddable-editor) renders a
template as a form and produces metadata instances from it; CED produces the
templates CEE renders.

## Status

Early, and under active reconstruction on `develop`.

`<cedar-embeddable-designer>` registers itself without bootstrapping anything
onto the page and renders in shadow DOM. It accepts a template or element through
`artifact`, endpoint configuration through `config`, and publishes `artifactChange`.
The shipped declaration describes those properties and events. The original
`template`, `currentTemplate` and `templateChange` names remain compatible aliases.

`npm run dist` produces the distribution: one script an embedder loads with a
plain `<script>` tag, its type declaration, and a staged npm directory.
Development snapshots are published to CEDAR Nexus as
`@org.metadatacenter/cedar-embeddable-designer`. The split Designer host pins an
exact snapshot. CED is not yet released on public npmjs.

Serialization is the
[CEDAR model library's](https://github.com/metadatacenter/cedar-model-typescript-library).
The designer builds a `Template` or `TemplateElement` and the library writes it as CEDAR JSON-LD or
CEDAR YAML and reads either back, so a template written in one form and reopened
from the other is the same artifact.

Controlled-term search asks the CEDAR terminology server a host names through
`terminologyBaseUrl`, and reports a failure as a failure. There is no default
endpoint: unset, search is off and the panel says so.

## Templates and elements

The embedding host supplies the template or standalone element to author. The **Modular**
profile exposes the reusable-child selector within any container.
Existing nested content stays visible in every profile. Elements render inline with
the same header and field layout as templates, expanded by default. The header
chevron collapses their contents without losing edits; the Overview expands and
scrolls to the selected field or element.

An element's **Element settings** panel controls its property name, display overrides,
property IRI, requirement, cardinality and layout. Its move control transfers
whole element subtrees between containers. Cycles and conflicting property
names are refused; page breaks are offered only in templates.

The public `currentArtifact` and change events always contain the complete root
document, including while a nested element is selected. CEE preview wraps a root
element in a temporary template; host-facing documents retain their element type.
The public artifact input accepts JSON and full YAML.

## Requirements

Node 24.19.0, as named by `.nvmrc` and matching CEE and the term picker.

```bash
nvm use
npm install
```

## Running

Start the development server and open `http://localhost:4200/`. The page it
serves is a host page: it embeds `<cedar-embeddable-designer>` rather than
rendering the designer directly, so development exercises the same contract an
embedder uses.

```bash
npm start
```

## Building

There are two builds, because there are two things to produce.

```bash
npm run build       # the element
npm run build:app   # the standalone application
```

`npm run build` compiles `src/main.ts`, which registers the custom element and
bootstraps nothing. It emits no `index.html` and no global stylesheet: the
element carries its own styles into its shadow root, which is why they are listed
on the element component rather than in `angular.json`. The output is
`main.js` and `polyfills.js` under `dist/cedar-embeddable-designer/`, unhashed.
Flattening those into the one script an embedder loads follows CEE's approach and
is not in place yet.

`npm run build:app` compiles `src/main.dev.ts` and the host page around it, which
is what `npm start` serves.

## The Sibling Components It Works With

The designer uses sibling web components the embedding page loads,
and this bundle carries none of them. They are siblings rather than dependencies, so a
host loads three scripts and each component stays its own size:

```html
<script src="cedar-embeddable-term-picker.js"></script>
<script src="cedar-embeddable-editor.js"></script>
<script src="cedar-embeddable-designer.js"></script>
```

A field's complete controlled-term constraint set is assembled with
[`<cedar-embeddable-term-picker>`](https://github.com/metadatacenter/cedar-embeddable-term-picker) in its
`constraints` mode. Load a bundle supporting `constraintSet` and
`constraintsSelected`. Authors can add, inspect, replace and remove constraints,
set branch depth, and author term exclusions and result positions. JSON and YAML
are read and written by the TypeScript model library. Without the picker the
panel reports editing as unavailable and retains saved constraints.

Constraint changes are checked against an existing default using the complete
set, including actions. A permitted default survives; an invalid one requires
**Clear default and apply constraints**, while cancellation and lookup failure
preserve the saved field.

The picker reads the terminology server's version-aware `/search`, which
**production does not serve yet**: `POST https://terminology.metadatacenter.org/search`
answers 404. Point `terminologyBaseUrl` at a local terminology server to use it.

Preview renders the template with
[`<cedar-embeddable-editor>`](https://github.com/metadatacenter/cedar-embeddable-editor),
the renderer that will show the form to whoever fills it in, rather than with a
drawing of a form of the designer's own. It is asked for a read-only form with no
instance behind it, which is how CEE reads a template as a statement of what each
field will accept. Without it the preview panel says so.

Field cards also reuse CEF's read-only specification box for numeric, text,
temporal and terminology constraints. Summaries update as constraints change and
use CEE's own wording and styles; declared defaults remain separate. Choice lists
and attribute-value placeholders retain their authoring presentation. If the CEE
script is not loaded, cards keep their existing placeholders; loading it later
activates the summaries without reloading the document.

All default-capable fields use `<cedar-embeddable-field>` (CEF), registered by
that same CEE script. Choose the **semantic** preset in Preferences to show Default
Value. Defaults are written through the TypeScript model library and restored on
open; clearing the control removes them. Numeric bounds and temporal precision
from imported fields are preserved. Choice defaults use `selectedByDefault` on
the field's options.

Controlled-term defaults use `<cedar-embeddable-term-picker>` in `selectionMode="term"` and
are checked against the field's vocabulary constraints before saving. The host
sets `terminologyBaseUrl` for that check and `bridgeBaseUrl` for external authority
lookups. Load current sibling bundles: without CEF or the required term picker,
the control reports that it is unavailable and preserves saved defaults.

To run the browser integration tests against real sibling bundles after building:

```bash
CEF_BUNDLE="$PWD/../cedar-embeddable-editor/visual/public/cedar-embeddable-editor.js" \
PICKER_BUNDLE="$PWD/../cedar-embeddable-term-picker/dist-bundle/cedar-embeddable-term-picker.js" \
npm run test:browser:prebuilt
```

`npm run build` records content fingerprints for the source, build configuration,
lockfile, installed CEDAR token/model packages and compiled output. `npm run bundle`
and `npm run check:fresh` reject any mismatch, including edits with unchanged file
timestamps. Rebuild with `npm run dist`; an old bundle without provenance is rejected.
Browser tests start their own server. Use `PORT=4600` if the default port is occupied.

CI builds pinned real CEE/CEF and CETP sources for the integration suite. A separate
WebKit job exercises header focus, blank-name validation, card navigation, Overview
resizing and native defaults. Run it locally after installing WebKit:

```bash
./browser/node_modules/.bin/playwright install webkit
CED_WEBKIT=1 npm run test:browser:prebuilt -- --project=webkit
```

To try all three scripts together from source:

```bash
npm --prefix ../cedar-embeddable-term-picker run dist
npm --prefix ../cedar-embeddable-editor run build:production
npm --prefix ../cedar-embeddable-editor/visual run bundle
npm run dist
cp ../cedar-embeddable-term-picker/dist-bundle/cedar-embeddable-term-picker.js dist-bundle/
cp ../cedar-embeddable-editor/visual/public/cedar-embeddable-editor.js dist-bundle/
```

Then serve `dist-bundle/` and load a page that pulls in all three scripts.
`npm start` does the staging itself for the development host, so working on the
designer needs none of the above.

## Packaging

```bash
npm run dist
```

Builds the element, flattens Angular's module output into one classic script with
esbuild, holds it to its size ceiling, and stages `dist-npm/cedar-embeddable-designer/`
from those exact bytes. The staging step builds nothing of its own: it copies the
file the size gate measured, and verifies the result byte for byte afterwards.

The registry a package belongs to is derived from its version rather than passed
at publish time. A version carrying `-dev.` is a snapshot and names the CEDAR
Nexus under `@org.metadatacenter`; anything else is a release for public npmjs,
unscoped. That way a snapshot cannot reach npmjs by forgetting a flag.

The published declaration is emitted from `src/app/ced-public-api.ts` alone, which
is written without imports so its declarations stand alone. Adding an import to
that file breaks the declaration build rather than shipping a `.d.ts` that names
paths only this repository has.

`browser/fixtures/host.html` is the embedding fixture, and the browser suite
serves it: a host page whose own styles are chosen to be as intrusive as
possible, loading the distribution and nothing else.

## Testing

| Command                  | What it does                                                         |
| ------------------------ | -------------------------------------------------------------------- |
| `npm test`               | unit tests, through the Angular CLI's Vitest builder                 |
| `npm run test:packaging` | the publish-channel rule, under `node --test`                        |
| `npm run test:browser`   | builds the distribution, then drives it in a real browser            |
| `npm run test:visual`    | the screenshot baselines, in the container they are taken in         |
| `npm run test:ci`        | bounded parallel checks, then distribution and browser verification |

`test:ci` overlaps unit, lint, type, boundary and packaging checks within
`CEDAR_TEST_WORKERS` (1–16; by default half the available CPUs, capped at 8).
The distribution waits for every check, so Angular builds and unit tests never
share a live cache. Browser tests then use the full budget. A failed stage blocks
the distribution and browser stages; each stage prints its elapsed time.
`test:visual` remains a separate required gate in the frontend reactor.

The browser suite is the one that matters most, because it is the only one that
can see the failures this component has actually had: an element that never
registered on a page without `<app-root>`, a lookup that searched the document
instead of the shadow tree, menus that closed on their own opening click, a view
that silently stopped updating under OnPush, an image the package does not carry.
None of those are visible to a unit test.

It drives the built single-file bundle in a host page whose own CSS is chosen to
be as intrusive as possible, and it is hermetic: no test reaches a terminology
server, and the one covering `<cedar-embeddable-term-picker>` registers a stub in the page,
so what is under test is this component's half of that contract.

## Related Repositories

- [cedar-embeddable-editor](https://github.com/metadatacenter/cedar-embeddable-editor) — renders a template as a form and produces instances
- [cedar-embeddable-term-picker](https://github.com/metadatacenter/cedar-embeddable-term-picker) — chooses the ontology, branch, term or value set that constrains a field
- [cedar-model-typescript-library](https://github.com/metadatacenter/cedar-model-typescript-library) — the CEDAR model, and the readers and writers for its serializations

## Licence

BSD 2-Clause. See [license.txt](license.txt).

## Local debugging example

With `npm start`, open `http://localhost:4200/?example=all-fields` (or the port
passed to `npm start`). This loads `public/examples/all-fields-nested.json`, a
snapshot of the local all-fields template, including NIH Grant ID and DOI in its
single, repeated and nested collections. Edits in CED remain local;
the example page does not write back to the stack. Choose Modular to expose all
authoring features.

Field cards start compact. The grey bottom chevron reveals underline tabs for
values, display, placement, type-specific constraints, metadata and identity.
Settings update immediately as valid values are entered. Incomplete input stays editable
when switching tabs or collapsing the panel. Published fields allow
inspection but keep editing controls disabled. Reusable field work remains in
Field Designer; cards no longer offer a Save field to library action.

The Overview shows each field's type icon and a right-aligned reorder handle.
Dragging reorders siblings within the Overview; the document and main editor update
only when the field is dropped. Focused handles also support Arrow Up/Down.

### Settings validation and saving

Use `designer.validate()` (or the read-only `validationReport` property) before
saving. `report.canSave` and `designer.canSave` are false while settings are invalid,
including pending edits that have not replaced the last valid model value and
in-progress default terminology checks. `currentArtifact` and artifact change
events alone are therefore not a save-readiness check.

Listen for `validationChange` to update the wrapper's Save button and error list.
Its detail is the same report: `{ valid, canSave, issues }`. Each issue includes a
session `nodeId`, an ancestor-ID `path`, a display `label`, `setting`, settings `tab`,
stable category `code`, user-facing `message`, `severity: 'error'`, and `source`
(`model` or `draft`). Do not parse messages or persist session IDs across documents.
Validation checks the settings CED supports; it does not replace server validation,
permission checks, or save/publish lifecycle rules.

CED marks affected cards and Overview entries, including ancestor elements, and
provides a summary linking to the relevant settings. Correcting or clearing an edit
removes its issue; deleting an item or loading another document removes its pending
issues from the report.
The wrapper remains responsible for saving and can display
the report when a save is attempted.

## Adding existing fields and elements

**Add Child** retains the field-type popup and offers **Select existing fields and elements**.
The selector stages one or more results in an upper table, with a bin to remove each
selection and Done/Cancel beside the table. Search results below show name, artifact
type, created and modified dates, version and status. Done loads the complete batch
before inserting it at the chosen position; Cancel leaves the document unchanged.
Source identities, versions, metadata and descendants are retained. Duplicate child
names receive a unique placement name without renaming the reusable definition.

The embedding host supplies `designer.childSource`, implementing the exported
`CedChildSource` interface. `search(query, { signal, cursor })` returns
`{ results, nextCursor? }`; each result has `id`, `name`, `type` (`field` or `element`)
and optional `createdOn`, `modifiedOn` (ISO dates), `version`, and `status` (display
label). `load(result, { signal })` returns that artifact's full CEDAR JSON-LD.
The host owns authentication, permission filtering and repository URL selection.
An omitted source shows an unavailable message; CED has no default repository.
Replacing `childSource` closes the selector and cancels pending work. Search requests
and artifact loads receive abort signals, and late replies cannot change a closed
selector or a replacement document. Both popup and library-sidebar layouts expose
the selector.

### Local repository demo as test1

CED starts in **Modular**. For authenticated local search, run `npm run demo:prepare`
then `npm run demo:serve` and open `http://localhost:4599/`.
The picker automatically matches word prefixes: `Princ` and `Princ Inv` both
match `Principal Investigator`. Every entered word must match; no wildcard is needed.
This translation belongs to the demo host adapter and leaves the REST API unchanged.
The loopback-only demo server signs in to local Keycloak on port 8080 as
`test1@test.com` and reads fields and elements through the resource server on port 9007. It caches and renews the short-lived token in server memory. Only search and
artifact reads are exposed; adding children changes the designer document locally.
The fixed test account and endpoints belong to this development server, not the
published CED component. The component's `childSource` input still belongs to its host.

The browser suite keeps its existing fixtures in Basic explicitly. To exercise the
real local integration, with the demo server running, use
`CED_LOCAL_REPOSITORY=1 npm --prefix browser test -- --grep 'local test1'`.
The local test reads the existing published `Principal Investigator` element and
inserts it in the browser without saving to the repository.

CED has no file import, export or download controls. Embedding hosts supply artifacts through the public inputs and receive edits through the change events.

## CEFD: design a standalone field

The same bundle also registers `<cedar-embeddable-field-designer>`. CEFD edits one
field definition using CED's field cards, settings and model conversion. It has
its own state and shadow root, and multiple CEFD and CED instances can coexist.
It does not authenticate, fetch artifacts, save, publish, or choose a version.

```ts
import type { CedarEmbeddableFieldDesignerElement } from 'cedar-embeddable-designer';

await customElements.whenDefined('cedar-embeddable-field-designer');
const field = document.createElement('cedar-embeddable-field-designer') as CedarEmbeddableFieldDesignerElement;
document.body.append(field);
field.config = { terminologyBaseUrl: 'https://terminology.example.org' };
field.newArtifact('number'); // Omit the argument to show the field-type chooser.
field.addEventListener('artifactChange', (event) => {
  console.log('Current valid field definition', event.detail);
});
field.addEventListener('validationChange', (event) => {
  console.log('Host Save enabled:', event.detail.canSave);
});
```

Use `loadArtifact(jsonOrYaml)` to open a field. Loading is synchronous and throws
on invalid input while preserving the current edits. Successful loads and
`newArtifact()` reset `isDirty`; invalid settings drafts count as dirty too.
`validate()`, `validationReport`, `canSave` and `dirtyChange` let a host manage Save
and navigation. `currentArtifact` is null before type selection and can throw
while the draft is invalid; check `canSave` before reading it to save. Only valid
artifacts produce `artifactChange` events, so hosts must not treat the last event
as a substitute for checking the current validation state.

`readOnly` is host-controlled; published definitions remain read only even if the
host clears it. Configuration is accepted once per instance. Field artifacts
retain identity, metadata, constraints and provenance on round-trip. Placement
controls (property IRI, requiredness, repetition and container display overrides)
belong to CED and are absent from CEFD. Defaults, terminology, field labels,
language and annotations use the same controls as CED. All 26 field types are
supported; the chooser groups date/time under Temporal.

The split Designer host uses CEFD for `/fields/create` and `/fields/edit/...`,
with the host's normal permissions, ETag saves and Workspace return navigation.
When developing against a newer CEFD than the pinned Nexus snapshot, explicitly
stage the local bundle using `CEDAR_CED_BUNDLE` in that host; a missing CEFD
registration reports an upgrade error rather than waiting indefinitely.

### Shared defaults during development

CED/CEFD use the shared 14px body type and standard 36px CEE control profile.
Control labels use regular weight; section headings and tabs use medium weight.
CED has no separate small-text exception. Native controls and
embedded CEF both honor inherited `--cedar-control-*` overrides. Service bases
are normalized once and forwarded identically to terminology and CEF; unknown
keys and wrong value types produce diagnostics without disabling valid siblings.

The control, spacing and font exports resolve from the exact Nexus token snapshot
in `package.json` and `package-lock.json`; a normal `npm ci` installs them. For
unpublished token development, install a packed local tarball in both CEE and
CED as described in the frontend runbook. Before pushing a consumer that needs
new exports, publish a new token snapshot, update both pins and verify a clean
`npm ci` build. The real-CEF integration workflow must also pin a CEE revision
that supports the adopted control profile.
