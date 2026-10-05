/**
 * The places a field can sit, for the matrices that cross a parameter with where it is written.
 *
 * A field can sit at a template's root, inside an element, an element inside another, a repeating
 * element, an element saved on its own, or be saved on its own as a field. Each is written by a
 * different path: an element's properties are built by the element's own builder and its parent
 * records the element's placement, and a standalone field is written and read without any parent
 * at all. Each placement here is written by the path the designer uses for it: a container through
 * `buildContainer` and `readContainer`, a standalone field through `fieldToJson` and `readField`.
 * The field designer exports a standalone field as JSON alone, so that placement has no YAML form.
 */
import { Field } from '../models/types';
import {
  buildContainer,
  fieldToJson,
  newContainer,
  readContainer,
  readField,
  templateToJson,
  templateToYaml,
} from './cedar-template';
import { ChildNode, ContainerDraft, ElementPlacement, fieldNode, fieldView } from './container-draft';

export type Form = 'json' | 'yaml';
export interface FieldPlacement {
  readonly name: string;
  /** The container directly holding the field, or none for a standalone field. */
  readonly parent: ContainerDraft['kind'] | null;
  readonly forms: readonly Form[];
  /** Write the field at this placement, read it back, and return the field as the designer holds it. */
  readonly roundTrip: (field: Field, form: Form) => Field;
}

function element(name: string, placement: Partial<ElementPlacement> = {}) {
  return (child: ChildNode): ChildNode => {
    const definition = newContainer('element', name);
    definition.children.push(child);
    return {
      kind: 'element',
      id: definition.id,
      definition,
      placement: { deploymentName: name, allowMultiple: false, ...placement },
    };
  };
}

/** The one field a container holds, however deeply. */
function onlyField(container: ContainerDraft): Field {
  const [node] = container.children;
  return node.kind === 'field' ? fieldView(node) : onlyField(node.definition);
}

/** A container of the given kind holding the field inside the given elements, outermost first. */
function within(kind: ContainerDraft['kind'], ...elements: ((child: ChildNode) => ChildNode)[]) {
  return (field: Field, form: Form): Field => {
    const root = newContainer(kind, 'Study');
    root.children.push(elements.reduceRight<ChildNode>((child, wrap) => wrap(child), fieldNode(field)));
    const model = buildContainer(root);
    return onlyField(readContainer(form === 'json' ? templateToJson(model) : templateToYaml(model)));
  };
}

export const PLACEMENTS: readonly FieldPlacement[] = [
  { name: 'the template root', parent: 'template', forms: ['json', 'yaml'], roundTrip: within('template') },
  { name: 'an element', parent: 'element', forms: ['json', 'yaml'], roundTrip: within('template', element('Sample')) },
  {
    name: 'a nested element',
    parent: 'element',
    forms: ['json', 'yaml'],
    roundTrip: within('template', element('Sample'), element('Aliquot')),
  },
  {
    name: 'a repeating element',
    parent: 'element',
    forms: ['json', 'yaml'],
    roundTrip: within('template', element('Sample', { allowMultiple: true, minItems: 1, maxItems: 3 })),
  },
  { name: 'a standalone element', parent: 'element', forms: ['json', 'yaml'], roundTrip: within('element') },
  {
    name: 'a standalone field',
    parent: null,
    forms: ['json'],
    roundTrip: (field) => readField(JSON.stringify(fieldToJson(field))),
  },
];
