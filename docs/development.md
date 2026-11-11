# Developing the CEDAR Embeddable Designer

For installing the published component, start with the [README](../README.md) and
the [installation guide](https://metadatacenter.readthedocs.io/en/latest/cedar-embeddable-designer/).
This page covers work on the component source.

## Requirements

Use the Node version named by `.nvmrc`, matching CEE and the term picker.

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
`npm run dist` bundles that output into the classic script an embedder loads and
stages the npm package from the verified bytes.

`npm run build:app` compiles `src/main.dev.ts` and the host page around it, which
is what `npm start` serves.

## Authoring Style Ownership

Native authoring controls and compact tables import the design-token package's
`authoring` Sass module directly. `src/authoring.scss` is the selector adapter for
both designer elements: it chooses where central density, select-arrow and entry-row
recipes apply. Keep shared geometry and typography in the central recipes, not in
copies under `src/app/shared` or corrective declarations in `src/styles.css`.
Component styles still own their layout and content-specific widths.

The surface registry checks representative authoring surfaces against central
contracts at desktop and narrow widths. They cover labels and controls in the
annotation entry row, a field's and an element's metadata and a nested field's
constraints, a field's constraint select, a default-value label beside real CEF,
and a field's metadata under a host override of the shared type size. The
field-type and label-weight browser suites cover the broader authoring matrix,
every field type in every settings tab. A central contract compares each property
with a single token, so CED's own browser tests check select-arrow clearance and
controlled-term default-row alignment. Preserve these rendered expectations when
consolidating styles; do not update visual baselines to accept an unintended change.

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

The package carries two bundles. `cedar-embeddable-designer.js` is self-contained and embeds
CEDAR Roboto 400 and 500. `cedar-embeddable-designer.host-fonts.js` is the same element without
those faces, for a host that registers them once for its whole page, as the design tokens'
`fonts.css` does. A page that loads several CEDAR components then downloads the faces once
rather than once per component. Without the host's faces, the host-fonts bundle draws its text in
the rest of the shared font stack. Each bundle has its own manifest, `bundle-manifest.json` and
`bundle-manifest.host-fonts.json`, and its own size ceiling. Load only one of them.

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

The model adapter's public facade is `src/app/core/model/cedar-template.ts`.
Its implementations under `core/model/cedar-model/` separate capabilities,
metadata, terminology conversion, field writing, container writing and reading.
Only that module imports the CEDAR model library. Implementations use each other
directly rather than importing their facade; the key policy uses a leaf adapter
for reserved names. `test:boundaries` enforces the library boundary and rejects
dependency cycles reachable from the adapter.

| Command                  | What it does                                                                |
| ------------------------ | --------------------------------------------------------------------------- |
| `npm test`               | unit tests, through the Angular CLI's Vitest builder                        |
| `npm run test:packaging` | the publish-channel rule, under `node --test`                               |
| `npm run test:browser`   | builds the distribution, then drives it in a real browser                   |
| `npm run test:visual`    | the screenshot baselines, in the container they are taken in                |
| `npm run test:ci`        | bounded parallel checks, then distribution, browser and visual verification |

`test:ci` overlaps unit, lint, type, boundary and packaging checks within
`CEDAR_TEST_WORKERS` (1–16; by default half the available CPUs, capped at 8).
The distribution waits for every check, so Angular builds and unit tests never
share a live cache. The browser tests and the visual baselines then share the
budget: the baselines take two workers in their container when the budget is at
least six, one otherwise, and the browser tests the rest. A failed stage blocks the distribution, browser and visual stages; each stage
prints its elapsed time. `test:ci` therefore needs Docker, as `test:visual` does.
It also enables the WebKit interaction project alongside Chromium. Install both
engines before running the complete gate:
`./browser/node_modules/.bin/playwright install --with-deps chromium webkit`.

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

## Local debugging example

With `npm start`, open `http://localhost:4200/?example=all-fields` (or the port
passed to `npm start`). This loads `public/examples/all-fields-nested.json`, a
snapshot of the local all-fields template, including NIH Grant ID and DOI in its
single, repeated and nested collections. Edits in CED remain local;
the example page does not write back to the stack. Choose Modular to expose all
authoring features.

Field cards start compact. The grey bottom chevron reveals underline tabs for
values, presentation, placement, type-specific constraints, metadata and identity.
Settings update immediately as valid values are entered. Incomplete input stays editable
when switching tabs or collapsing the panel. Published fields allow
inspection but keep editing controls disabled. Reusable field work remains in
Field Designer; cards no longer offer a Save field to library action.

The Overview shows each field's type icon, Move up and Move down buttons and a
right-aligned reorder handle. Dragging reorders siblings within the Overview; the
document and main editor update only when the field is dropped. Focused handles also
support Arrow Up/Down, and Move up and Move down move a child one place with a click.
A click on the Overview's divider, or on the library sidebar's, steps it through its
smallest, default and largest sizes. Below 768px the Overview takes no column. Its
header toggle opens it over the canvas, closed by default, and Escape closes it again.

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

The browser suite keeps its existing fixtures in Basic explicitly, and stubs the
repository wherever it searches for children. The real integration is tested in the
whole-stack smoke, whose Template Designer journey searches for an element it created and
imports it through CED.

### Shared defaults during development

CED/CEFD use the shared 14px body type and standard 36px CEE control profile.
Control labels use regular weight; section headings and tabs use medium weight.
CED has no separate small-text exception. Native controls and
embedded CEF both honor inherited `--cedar-control-*` overrides. Service bases
are normalized once and forwarded identically to terminology and CEF; unknown
keys and wrong value types produce diagnostics without disabling valid siblings.

The control, spacing and font exports resolve from the exact Nexus token snapshot
in `package.json` and `package-lock.json`; a normal `npm ci` installs them. For
unpublished token development, run `cedarcli test frontends` or `cedarcli build frontends`;
the reactor automatically supplies the current local token package to both CEE and CED.
For registry-based CI, before pushing a consumer that needs
new exports, publish a new token snapshot, update both pins and verify a clean
`npm ci` build. The real-CEF integration workflow must also pin a CEE revision
that supports the adopted control profile.

### Styling ownership and remaining debt

Central `authoring` recipes own labels, controls, tables, settings-dialog structure
and density. Central `patterns` recipes own dialog surfaces; property, type and
default-term pickers share the same corners, border and shadow. `src/authoring.scss`
selects these surfaces without implementing another set of values.

Local rules are appropriate for card composition, nested-element indentation,
sidebar resizing, drag handles, picker bounds and responsive placement. Syntax
highlighting owns a content palette, and the demo host deliberately uses different
styles to test embedding. Those are not reasons to duplicate control typography,
theme colors, focus rings or dialog geometry.

The adoption baseline still contains migration debt: outline, toolbar, glyph and
badge measurements, sidebar resizing geometry, two stacking indices and one hover
treatment. The token gate admits no exceptions, so a finding leaves the baseline
only when a shared role, a recipe or a designer size in the tokens package's
`spacing` export replaces it. Keep resolved entries pruned, document any necessary
local rule at its owner, and retain desktop/narrow-width, host-override and real-CEF
checks. Do not substitute an unrelated token merely because its current numeric
value happens to match.

### Coordinated host build

The package also includes `integration.mjs`, an AOT-compiled ES module with host fonts and external
Angular, RxJS, translation and model dependencies. It is an input to a coordinated Angular application
build, not a script to load directly in a browser. `integration-manifest.json` records its digest and
exact runtime versions (including the model content digest); the host must verify those identities
before combining components. The Template Designer demonstrates this build.

The default package entry, standalone script, host-fonts script and public element APIs are unchanged.
Standalone consumers do not need to install Angular or change their embedding code.
