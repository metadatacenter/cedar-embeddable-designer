# CEDAR Embeddable Designer (CED)

The CEDAR Embeddable Designer is a Web Component for authoring CEDAR metadata
templates. An author assembles a template field by field, constrains fields to
ontologies, branches, terms and value sets, and the component produces a CEDAR
template that any CEDAR service can store, validate and render.

CED is the authoring half of a pair. The [CEDAR Embeddable Editor
(CEE)](https://github.com/metadatacenter/cedar-embeddable-editor) renders a
template as a form and produces metadata instances from it; CED produces the
templates CEE renders.

## Status

Early, and under active reconstruction on `develop`.

The element works. `<cedar-embeddable-designer>` registers itself without
bootstrapping anything onto the page, renders in shadow DOM so neither its styles
nor a host page's cross the boundary, takes a template and an API key as
properties, and publishes a `templateChange` event. What is not settled is the
contract's shape: the input and output names may still change, and there is no
declared type for them yet.

There is no packaged bundle. `npm run build` produces the element as two files
rather than the single script an embedder should be able to load, and nothing is
published.

Serialization is the
[CEDAR model library's](https://github.com/metadatacenter/cedar-model-typescript-library).
The designer builds a `Template` and the library writes it as CEDAR JSON-LD or
CEDAR YAML and reads either back, so a template written in one form and reopened
from the other is the same artifact.

Controlled-term search is not yet honest. It reaches a hardcoded terminology
endpoint, and when that endpoint is unreachable it substitutes hard-coded results
carrying real-looking ontology IRIs — an author offline for a moment can attach a
term that does not exist. It will move to
[`<cedar-term-picker>`](https://github.com/metadatacenter/cedar-term-picker), the
component built for choosing what constrains a field.

## Requirements

Node 24.19.0, as named by `.nvmrc` and matching CEE and the term picker.

```bash
nvm use
npm install
```

## Running

Start the development server and open `http://localhost:4200/`. The page it
serves is a host page: it embeds `<cedar-embeddable-designer>` rather than
rendering the editor directly, so development exercises the same contract an
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

`public/demo.html` is an embedding fixture, copied into both outputs. Serve the
element build's directory and open it to see the component inside a host page
whose own styles are chosen to be as intrusive as possible.

## Testing

There are no tests. Vitest and a Playwright suite arrive with the web-component
work, on the configuration CEE uses.

## Related Repositories

- [cedar-embeddable-editor](https://github.com/metadatacenter/cedar-embeddable-editor) — renders a template as a form and produces instances
- [cedar-term-picker](https://github.com/metadatacenter/cedar-term-picker) — chooses the ontology, branch, term or value set that constrains a field
- [cedar-model-typescript-library](https://github.com/metadatacenter/cedar-model-typescript-library) — the CEDAR model, and the readers and writers for its serializations

## Licence

BSD 2-Clause. See [license.txt](license.txt).
