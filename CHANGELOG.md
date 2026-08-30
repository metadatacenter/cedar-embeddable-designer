# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing has been published on either channel yet, so everything below is the
first entry rather than a diff against a release. It records the reconstruction
of the repository on `develop`: what arrived as a Figma Make export is now a
Web Component with a declared contract, a distribution, and a test suite that
drives it in a browser.

### Added

- A profile picker in the header. Three profiles — Basic, Semantic, Modular —
  decide which field types and which per-field controls an author is offered, and
  the only way to one was the user menu and then the preferences modal, two clicks
  behind an unlabelled avatar with nothing on screen saying which was in force. An
  author who wanted controlled terms had to know that Basic hides them and that a
  profile existed to change. It reads `Custom` once the settings no longer match
  any profile, which is a state one switch reaches.
- Every field type is checked through both serializations and for settling: 26
  types, each written and read back as JSON and as YAML, and each proved to reach
  a state a second write does not change. Two defects came out of it, below.

- `<cedar-embeddable-designer>`, registered as a custom element that bootstraps
  nothing onto the page. A host decides where and when one appears.
- Shadow DOM. Neither the designer's styles nor a host page's cross the boundary.
- A host contract: `config` carrying `terminologyBaseUrl`, a `template` input
  taking CEDAR JSON or CEDAR YAML, a `currentTemplate` property, and a
  `templateChange` event carrying the template as CEDAR JSON-LD. Declared in
  `src/app/ced-public-api.ts`, which is written without imports so one
  `tsc --emitDeclarationOnly` produces the declaration the package ships.
- `npm run dist`: the element flattened into one classic script with esbuild,
  held to a recorded size ceiling raw and gzipped, and staged as an npm package
  from those exact bytes, verified afterwards byte for byte. Which registry a
  package belongs to is derived from its version, so a development snapshot
  cannot reach npmjs by forgetting a flag.
- Term search through
  [`<cedar-term-picker>`](https://github.com/metadatacenter/cedar-term-picker),
  a sibling web component the embedding page loads alongside the designer. A
  field's constraint is chosen from what the terminology server holds instead of
  typed from memory. Where the picker is absent the panel says so.
- Tests: 207 unit tests through the Angular CLI's Vitest builder, 5 covering the
  publish-channel rule, and 38 browser tests driving the built bundle in a host
  page whose own CSS is chosen to be as intrusive as possible. The browser suite
  is hermetic — no test reaches a terminology server, and the picker is stubbed.
- A CI workflow running lint, typecheck, unit tests, source-boundary tests,
  packaging tests, both builds, the distribution and the browser suite, with the
  production audit as its own step.
- A freshness guard on the browser suite. It serves `dist-bundle/`, and a bundle
  older than the build beside it would run, pass, and report green against code
  nobody was testing. `check:fresh` compares the two by timestamp, by the files
  the bundle was made from, and by hash. A checkout that never built is not what
  it refuses — testing a distribution someone handed you is legitimate — only a
  bundle a build contradicts.
- Two source-boundary tests, for properties no type can express: the published
  contract stays import-free, or the declaration the package ships names paths
  that are not in it, and the CEDAR model library is reached through one file,
  which is what keeps its vocabulary out of the components. A third holds the
  sibling components out of the bundle.
- `check:readme`, which compiles the README's TypeScript examples against the
  staged declaration and checks that every `npm run` a reader is told to type is
  a script this project has. Documentation here had already named one that did
  not exist.
- `test:browser:flake-hunt`, which runs the browser suite twenty times, or
  `RUNS=n`.
- `license.txt` (BSD 2-Clause), a README describing the component rather than the
  Angular CLI, and `.nvmrc` pinning Node 24.19.0.

### Changed

- Angular 19.2 to 22.1, TypeScript 5.7 to 6.0.3, and Node to 24.19.0, matching
  the CEDAR Embeddable Editor and the term picker.
- Karma and Jasmine replaced by Vitest, through `@angular/build:unit-test` rather
  than a standalone config, because this codebase wants `TestBed`.
- Serialization is the
  [CEDAR model library's](https://github.com/metadatacenter/cedar-model-typescript-library).
  The designer builds a `Template` and the library writes it as CEDAR JSON-LD or
  CEDAR YAML and reads either back, so a template written in one form and
  reopened from the other is the same artifact.
- Controlled-term search asks a terminology server the host names. There is no
  default endpoint: unset, search is off and the panel says which key is missing.
- The file menu offers Download as JSON and Download as YAML, in place of a Save
  and a Save As that meant the same thing without a native dialog behind them.
- Every component uses `ChangeDetectionStrategy.OnPush`; state is held in signals.
- The compiler settings match CEE and the term picker: `strict`,
  `noUnusedLocals`, `noUnusedParameters`, `useDefineForClassFields: false`, and
  no `skipLibCheck`, so the model library's declarations are checked rather than
  trusted. `no-explicit-any` is on.
- The component is the CEDAR Embeddable Designer throughout — the window title,
  the package, the Angular project, the build output and the element's tag.
- Preview renders the template with
  [`<cedar-embeddable-editor>`](https://github.com/metadatacenter/cedar-embeddable-editor),
  a third sibling web component the host loads. It is the renderer that will show
  the form to whoever fills it in, read-only and with no instance behind it,
  which is how CEE reads a template as a statement of what each field accepts.
  The preview keeps one editor and hands it each new template. CEE fixes a
  template only once an instance is loaded against it, and a preview supplies
  none — a rule it gained for this. Replacing the element per edit cost about a
  second of Angular bootstrapping, flat in the size of the template, and took the
  reader's scroll position and page with it.

### Fixed

- The designer grew to whatever it held instead of keeping to the box its host
  gave it. Its shell asked for `min-h-screen` — the viewport, which an embedded
  component has no business measuring — and being a minimum it grew with its
  content, so a forty-field template made the element eleven thousand pixels tall
  and the embedding page scrolled. Neither the fields nor the preview could scroll
  within it, though both had said `overflow-y: auto` all along. `app-root` was the
  break in the chain: a component element is inline by default, so the height
  declared on the element never reached the shell.

- A controlled-term field with no vocabulary chosen was written as one anyway: it
  went out IRI-shaped with four empty constraint lists and came back a text field,
  so opening a saved template and saving it again turned the field's values from
  `@id` to `@value` without anyone touching it. Controlled terms are a capability
  of a text field — which is what the production designer models, and both write
  `_ui.inputType: "textfield"` — so until an author picks a term there is a text
  field to write and nothing else.
- An ontology constraint named its ontology by acronym where a URI belongs. JSON
  said `"uri": "DOID"`; the YAML path derives the URI from the acronym and said
  `https://data.bioontology.org/ontologies/DOID`, so one template written in the
  two formats was two different artifacts and only one named an ontology. Reading
  one back put the URI where the next write expected an acronym, so a template
  grew a URI segment on every open-and-save.
- Controlled-term search substituted hard-coded results carrying real-looking
  SNOMEDCT and DOID identifiers when a request failed, and invented a term at
  `http://example.org/term/<query>` for anything it had no canned answer to. They
  were selectable, and a selected term went into the template.
- The element was registered from the `.then` of `bootstrapApplication`, so a page
  without `<app-root>` failed the bootstrap and never defined it, while a page
  with one got a whole application it had not asked for.
- `public/demo.html` named the element and loaded no script at all. It has since
  been replaced by the browser suite's host fixture, which loads the distribution.
- Exported templates dropped the recommended status, the multiple-values flag,
  default values and every controlled-term constraint.
- A time field was written as `xsd:dateTime`, so it read back as a date and
  degraded on every open-and-save cycle.
- A field with no help text was given the literal description `"Help Text"`.
- Two fields of the same name collapsed to one key.
- Neither the template nor its fields carried the JSON-schema `title` the CEDAR
  meta-schema requires, so the output was not valid.
- The template and its fields were given fresh identifiers on every read, so the
  two export panels disagreed and a host was told the artifact was new on every
  keystroke.
- The unsaved-changes guard was raised by field reordering and nothing else.
- Under shadow DOM: field cards were looked up with `document.getElementById`,
  three click-outside handlers read `event.target` after it had been retargeted
  at the host, and the sidebar's resize handle searched the whole document.
- `templateChange` was a view effect on a component whose template is one static
  tag, so under OnPush the host received exactly one event however much the
  author edited.
- The packaged element requested `cedar-logo.png` from the embedder's server,
  which the package does not carry.
- Restricting a search to an ontology sent `ontologies`, which the terminology
  server ignores; the parameter is `sources`.
- Search results were read as BioPortal's shape rather than the terminology
  server's, so the ontology column was empty for every genuine result.
- The YAML highlighter put two spaces after every key.
- Three `@for` blocks tracked `undefined`, which Angular reported as 57 duplicate
  keys per render.

### Removed

- Every rendering of the artifact as code. The preview panel drew its own form
  from the field list, with JSON and YAML tabs above it, a second copy of the
  export panel behind those, and a term-search modal for filling the preview in;
  under the editor sat two accordions showing the same two serializations again,
  and a syntax highlighter served both. An author was shown this component's idea
  of CEDAR rather than the renderer that will show the form, three times over.
  Preview is CEE now, and the File menu writes both serializations as files.
- The Electron shell, its IPC bridge — which accepted any filesystem path the
  renderer offered — the service behind it, the menu wiring and five
  devDependencies. Open and save are a file input and a download.
- The BioPortal API key, its modal, its `localStorage` entry, the menu item and a
  debug strip that had shipped reporting whether the key was set. The search
  endpoint builds an anonymous request context, so the key was never read: the
  gate turned a working search off in exchange for nothing.
- `src/app/core/cedar-shim/`: a hand-written CEDAR serializer, a YAML emitter and
  a YAML parser, replaced by the model library.
- The Figma Make scaffolding: an abandoned React application under
  `react-src-backup/`, the tool's guidelines template, a copy of shadcn's
  `globals.css` that nothing imported, and 120 lines of type declarations
  describing a format this code does not produce.
- A search box in the constraint panel that was `disabled` and had no handler.
