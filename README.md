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
plain `<script>` tag, its type declaration, and a staged npm directory. Nothing
is published yet, and the package has not been released on either channel.

Serialization is the
[CEDAR model library's](https://github.com/metadatacenter/cedar-model-typescript-library).
The designer builds a `Template` or `TemplateElement` and the library writes it as CEDAR JSON-LD or
CEDAR YAML and reads either back, so a template written in one form and reopened
from the other is the same artifact.

Controlled-term search asks the CEDAR terminology server a host names through
`terminologyBaseUrl`, and reports a failure as a failure. There is no default
endpoint: unset, search is off and the panel says so.

## Templates and elements

Choose **File → New Element** to author an element document. The **Modular**
profile enables **Add Element** and **Import Element** within any container.
Existing nested content stays visible in every profile. Elements render inline with
the same header and field layout as templates, expanded by default. The header
chevron collapses their contents without losing edits; the Overview expands and
scrolls to the selected field or element.

An element's **Element settings** panel controls its property name, display overrides,
property IRI, requirement, cardinality and layout. Its move control transfers
whole element subtrees between containers. Cycles and conflicting property
names are refused; page breaks are offered only in templates.

**Import Element** makes an independent in-memory copy retaining the imported
artifact identity. **Duplicate Element** creates new draft identities throughout
the subtree, with source provenance. Neither operation establishes a live link to
a server artifact. Server persistence and publishing remain separate host work.

The public `currentArtifact` and change events always contain the complete root
document, including while a nested element is selected. CEE preview wraps a root
element in a temporary template; exported documents retain their element type.
JSON and full YAML can be reopened; YAML export is refused if the model cannot
preserve all metadata, with JSON available instead.

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
<script src="cedar-term-picker.js"></script>
<script src="cedar-embeddable-editor.js"></script>
<script src="cedar-embeddable-designer.js"></script>
```

A field's complete controlled-term constraint set is assembled with
[`<cedar-term-picker>`](https://github.com/metadatacenter/cedar-term-picker) in its
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

All default-capable fields use `<cedar-embeddable-field>` (CEF), registered by
that same CEE script. Choose the **semantic** preset in Preferences to show Default
Value. Defaults are written through the TypeScript model library and restored on
open; clearing the control removes them. Numeric bounds and temporal precision
from imported fields are preserved. Choice defaults use `selectedByDefault` on
the field's options.

Controlled-term defaults use `<cedar-term-picker>` in `selectionMode="term"` and
are checked against the field's vocabulary constraints before saving. The host
sets `terminologyBaseUrl` for that check and `bridgeBaseUrl` for external authority
lookups. Load current sibling bundles: without CEF or the required term picker,
the control reports that it is unavailable and preserves saved defaults.

To run the browser integration tests against real sibling bundles after building:

```bash
CEF_BUNDLE="$PWD/../cedar-embeddable-editor/visual/public/cedar-embeddable-editor.js" \
PICKER_BUNDLE="$PWD/../cedar-term-picker/dist-bundle/cedar-term-picker.js" \
npm --prefix browser test
```

To try all three scripts together from source:

```bash
npm --prefix ../cedar-term-picker run dist
npm --prefix ../cedar-embeddable-editor run build:production
npm --prefix ../cedar-embeddable-editor/visual run bundle
npm run dist
cp ../cedar-term-picker/dist-bundle/cedar-term-picker.js dist-bundle/
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
| `npm run test:ci`        | the gate, in the order a cheaper check should report a failure first |

The browser suite is the one that matters most, because it is the only one that
can see the failures this component has actually had: an element that never
registered on a page without `<app-root>`, a lookup that searched the document
instead of the shadow tree, menus that closed on their own opening click, a view
that silently stopped updating under OnPush, an image the package does not carry.
None of those are visible to a unit test.

It drives the built single-file bundle in a host page whose own CSS is chosen to
be as intrusive as possible, and it is hermetic: no test reaches a terminology
server, and the one covering `<cedar-term-picker>` registers a stub in the page,
so what is under test is this component's half of that contract.

## Related Repositories

- [cedar-embeddable-editor](https://github.com/metadatacenter/cedar-embeddable-editor) — renders a template as a form and produces instances
- [cedar-term-picker](https://github.com/metadatacenter/cedar-term-picker) — chooses the ontology, branch, term or value set that constrains a field
- [cedar-model-typescript-library](https://github.com/metadatacenter/cedar-model-typescript-library) — the CEDAR model, and the readers and writers for its serializations

## Licence

BSD 2-Clause. See [license.txt](license.txt).

## Local debugging example

With `npm start`, open `http://localhost:4200/?example=all-fields` (or the port
passed to `npm start`). This loads `public/examples/all-fields-nested.json`, a
snapshot of the local all-fields template, including NIH Grant ID and DOI in its
single, repeated and nested collections. Edits in CED remain local until exported;
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
