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

Early, and under active reconstruction on `develop`. The application runs and
exports a template, but the pieces an embedding page depends on are still being
built: the component registers itself only as a side effect of bootstrapping the
standalone application, styles are global rather than scoped to a shadow root,
and there is no packaged bundle to depend on. Treat the element contract as
unsettled until this section says otherwise.

Serialization currently goes through a hand-written shim under
`src/app/core/cedar-shim/` rather than through
[`@org.metadatacenter/cedar-model-typescript-library`](https://github.com/metadatacenter/cedar-model-typescript-library),
which is where it belongs and where it is going. Controlled-term search reaches
a hardcoded terminology endpoint and will move to
[`<cedar-term-picker>`](https://github.com/metadatacenter/cedar-term-picker),
the component built for choosing what constrains a field.

## Requirements

Node 24.19.0, as named by `.nvmrc` and matching CEE and the term picker.

```bash
nvm use
npm install
```

## Running

Start the development server and open `http://localhost:4200/`. The application
rebuilds as source files change.

```bash
npm start
```

## Building

```bash
npm run build
```

Build artifacts land in `dist/`. The production configuration optimizes the
output and hashes filenames, so the result is an application rather than a
distributable component. Packaging the element as one embeddable file follows
CEE's approach and is not in place yet.

## Testing

There are no tests. Vitest and a Playwright suite arrive with the web-component
work, on the configuration CEE uses.

## Related Repositories

- [cedar-embeddable-editor](https://github.com/metadatacenter/cedar-embeddable-editor) — renders a template as a form and produces instances
- [cedar-term-picker](https://github.com/metadatacenter/cedar-term-picker) — chooses the ontology, branch, term or value set that constrains a field
- [cedar-model-typescript-library](https://github.com/metadatacenter/cedar-model-typescript-library) — the CEDAR model, and the readers and writers for its serializations

## Licence

BSD 2-Clause. See [license.txt](license.txt).
