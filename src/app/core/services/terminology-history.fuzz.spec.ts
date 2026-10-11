import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TemplateService } from './template.service';
import { TerminologyService } from './terminology.service';
import { TerminologyEdit } from './terminology-edit-commands';
import { newContainer } from '../model/cedar-template';
import { ContainerDraft, fieldNode, fieldView } from '../model/container-draft';
import { ControlledTermSet, FieldDefaultValue } from '../models/types';
import { Command, commands, checkAsyncHistory, historySeeds } from '../../../testing/seeded-history';

const constraints = (n: number): ControlledTermSet => ({
  constraints: [{ sourceType: 'ontology', ontologyId: `ONTO${n}`, ontologyName: `Ontology ${n}` }],
  actions: [],
});
interface Row {
  id: number;
  name: string;
  parent: number;
  epoch: number;
  value: FieldDefaultValue;
  set: ControlledTermSet;
}
interface Request {
  resolve(value: boolean): void;
  reject(error: Error): void;
  signal: AbortSignal;
  editor: number;
  row: Row;
  epoch: number;
  kind: 'default' | 'constraints';
  value: string;
  set: ControlledTermSet;
  edit: TerminologyEdit;
  settled: boolean;
  recovery: boolean;
  cancelled: boolean;
}
function actualRows(root: ContainerDraft): Row[] {
  return root.children.flatMap((node): Row[] =>
    node.kind === 'element'
      ? actualRows(node.definition)
      : [
          {
            id: node.id,
            name: node.definition.name,
            parent: root.id,
            epoch: 0,
            value: fieldView(node).defaultValue,
            set: {
              actions: [],
              constraints: fieldView(node).controlledTermConstraints!.constraints.map((constraint) => {
                if (constraint.sourceType !== 'ontology') throw new Error('Expected ontology constraint');
                return {
                  sourceType: constraint.sourceType,
                  ontologyId: constraint.ontologyId,
                  ontologyName: constraint.ontologyName,
                };
              }),
            },
          },
        ],
  );
}
function initial(service: TemplateService): Map<number, Row> {
  const root = { ...newContainer('template', 'Study'), id: 100 };
  root.children = [1, 2, 3].map((id) =>
    fieldNode({
      id,
      type: 'controlledTerms',
      name: `Term ${id}`,
      deploymentName: `term${id}`,
      status: 'optional',
      options: [],
      allowMultiple: false,
      defaultValue: { kind: 'iri', iri: `urn:initial:${id}`, label: `Initial ${id}` },
      controlledTermConstraints: constraints(0),
    }),
  );
  root.children.push({
    id: 200,
    kind: 'element',
    definition: { ...newContainer('element', 'Group'), id: 200 },
    placement: { deploymentName: 'group', allowMultiple: false },
  });
  service.session.replace(root);
  service.markSaved();
  return new Map(
    [1, 2, 3].map((id) => [
      id,
      {
        id,
        parent: 100,
        name: `Term ${id}`,
        epoch: 0,
        value: { kind: 'iri', iri: `urn:initial:${id}`, label: `Initial ${id}` },
        set: constraints(0),
      },
    ]),
  );
}

/** The oracle owns field revisions and expected values, never production tickets.
 * Responses ignore AbortSignal deliberately: cancellation must also guard commits. */
async function replay(history: Command[]): Promise<void> {
  const requests: Request[] = [];
  const injectors = [0, 1].map((editor) =>
    Injector.create({
      parent: TestBed.inject(Injector),
      providers: [
        TemplateService,
        {
          provide: TerminologyService,
          useValue: {
            allowsDefault: (_artifact: unknown, _iri: string, _label: string, signal: AbortSignal) =>
              new Promise<boolean>((resolve, reject) => requests.push({ resolve, reject, signal, editor } as Request)),
          },
        },
      ],
    }),
  );
  const services = injectors.map((injector) => injector.get(TemplateService));
  const models = services.map(initial);
  const readOnly = [false, false];
  const sources = services.map((service) => service.templateJson());
  const current = (request: Request) =>
    !request.cancelled &&
    !readOnly[request.editor] &&
    models[request.editor].get(request.row.id) === request.row &&
    request.row.epoch === request.epoch;
  const view = (service: TemplateService) =>
    structuredClone({ document: service.document(), report: service.validationReport(), dirty: service.isDirty() });
  let serial = 0;
  const settle = async (request: Request, outcome: number) => {
    const live = current(request);
    const before = services.map(view);
    request.settled = true;
    if (outcome === 2) request.reject(new Error('Lookup failed'));
    else request.resolve(outcome === 0);
    const result = await request.edit.result;
    if (!live) {
      expect(result, 'obsolete response has no commit authority').toBe('stale');
      expect(services.map(view), 'obsolete response preserves both editors including reports and dirty state').toEqual(
        before,
      );
    } else if (outcome === 0) {
      expect(result, 'current allowed edit applies').toBe('applied');
      if (request.kind === 'default') request.row.value = { kind: 'iri', iri: request.value, label: request.value };
      else request.row.set = request.set;
      request.row.epoch++;
    } else {
      request.recovery = request.kind === 'constraints' && outcome === 1;
      expect(result).toBe(request.recovery ? 'needs-clear' : 'rejected');
      expect(
        services[request.editor].validationReport().canSave,
        'a current denial or transport failure blocks saving',
      ).toBe(false);
      expect(services[request.editor].document(), 'denial keeps the accepted artifact').toEqual(
        before[request.editor].document,
      );
    }
    expect(view(services[1 - request.editor]), 'completion cannot affect another editor').toEqual(
      before[1 - request.editor],
    );
  };
  try {
    for (const command of history) {
      serial++;
      const editor = command.a % 2;
      const service = services[editor];
      const rows = [...models[editor].values()];
      const row = rows[command.b % rows.length];
      if (command.op <= 2 && row) {
        const kind = command.op === 2 ? 'constraints' : 'default';
        if (kind === 'constraints' && row.value.kind !== 'iri') continue;
        const value = `urn:chosen:${serial}`;
        const set = constraints(serial);
        const count = requests.length;
        const edit =
          kind === 'default'
            ? service.terminologyEdits.selectDefault(row.id, { iri: value, label: value })
            : service.terminologyEdits.changeConstraints(row.id, set);
        if (readOnly[editor]) {
          expect(await edit.result).toBe('stale');
          expect(requests.length).toBe(count);
        } else {
          row.epoch++;
          expect(requests.length, 'editable operation reaches the deferred transport').toBe(count + 1);
          Object.assign(requests.at(-1)!, {
            editor,
            row,
            epoch: row.epoch,
            kind,
            value,
            set: structuredClone(set),
            edit,
            settled: false,
            recovery: false,
            cancelled: false,
          });
          // The host cannot change the proposed constraints after submitting them.
          set.constraints.length = 0;
        }
      } else if (command.op >= 3 && command.op <= 5) {
        const pending = requests.filter((request) => !request.settled);
        if (pending.length) await settle(pending[command.c % pending.length], command.op - 3);
      } else if (command.op === 6 && row && !readOnly[editor]) {
        row.name = `Renamed ${serial}`;
        row.epoch++;
        service.updateFieldName(row.id, row.name);
      } else if (command.op === 7 && row && !readOnly[editor]) {
        row.epoch++;
        service.validation.setInputError(row.id, 'defaultValue', 'Incomplete input', 'Constraints', 'unfinished');
      } else if (command.op === 8 && row && !readOnly[editor]) {
        service.deleteChild(row.id);
        models[editor].delete(row.id);
      } else if (command.op === 9) {
        readOnly[editor] = !readOnly[editor];
        models[editor].forEach((item) => item.epoch++);
        service.validation.setReadOnly(readOnly[editor]);
      } else if (command.op === 10 || command.op === 11) {
        if (command.op === 10) {
          service.resetTemplate('template', false);
          models[editor] = initial(service);
        } else {
          service.loadTemplate(sources[editor]);
          // Reopened nodes have fresh internal IDs. Only addresses come from the
          // implementation; expected values come from the original fixture.
          models[editor] = new Map(
            actualRows(service.document()).map((item) => {
              const n = Number(item.name.split(' ')[1]);
              return [
                item.id,
                {
                  ...item,
                  epoch: 0,
                  value: { kind: 'iri', iri: `urn:initial:${n}`, label: `Initial ${n}` },
                  set: constraints(0),
                },
              ];
            }),
          );
        }
      } else if (command.op === 12 && requests.length) {
        const request = requests[command.c % requests.length];
        request.cancelled = true;
        request.edit.cancel();
      } else if (command.op === 13 && requests.length) {
        const request = requests[command.c % requests.length];
        const applies = request.recovery && current(request);
        const before = services.map(view);
        expect(request.edit.clearDefaultAndApply(), 'recovery belongs to the current intent and is single-use').toBe(
          applies,
        );
        if (applies) {
          request.row.value = { kind: 'none' };
          request.row.set = request.set;
          request.row.epoch++;
        } else expect(services.map(view)).toEqual(before);
        request.recovery = false;
      } else if (command.op === 14 && row && !readOnly[editor]) {
        const targets = service.containerChoices().map((choice) => choice.id);
        const target = targets[command.c % targets.length];
        service.moveChild(row.id, target);
        row.parent = target;
      } else if (command.op === 15 && row && !readOnly[editor]) {
        row.epoch++;
        service.updateFieldSettings(row.id, { annotations: [{ name: 'source', kind: 'iri', value: 'relative' }] });
      }
      for (const [index, other] of services.entries()) {
        const actual = actualRows(other.document()).sort((a, b) => a.id - b.id);
        const wanted = [...models[index].values()].sort((a, b) => a.id - b.id).map((item) => ({ ...item, epoch: 0 }));
        expect(actual, 'accepted values follow the independent field history').toEqual(wanted);
        const pending = requests.filter((request) => request.editor === index && !request.settled && current(request));
        if (pending.length || readOnly[index])
          expect(other.validationReport().canSave, 'pending validation or read-only prevents saving').toBe(false);
        if (pending.length) expect(other.isDirty(), 'pending edit intent is dirty').toBe(true);
        for (const request of requests.filter((item) => item.editor === index && !item.settled)) {
          expect(request.signal.aborted, 'only a current request keeps its transport alive').toBe(!current(request));
        }
      }
    }
    // Every unchosen completion is still exercised, newest first, before teardown.
    for (const request of [...requests].reverse()) if (!request.settled) await settle(request, 0);
    services.forEach((service, index) =>
      expect(actualRows(service.document()).sort((a, b) => a.id - b.id)).toEqual(
        [...models[index].values()].sort((a, b) => a.id - b.id).map((row) => ({ ...row, epoch: 0 })),
      ),
    );
  } finally {
    services.forEach((service) => service.validation.reset());
    for (const request of requests)
      if (!request.settled) {
        request.resolve(false);
        await request.edit.result;
      }
    injectors.forEach((injector) => injector.destroy());
  }
}

describe('seeded asynchronous terminology histories', () => {
  it.each(historySeeds(150))('seed %i', (seed) => checkAsyncHistory(seed, commands(seed, 70, 16), replay));
});

it('awaits failing async replays and reduces their command history', async () => {
  const histories: number[][] = [];
  await expect(
    checkAsyncHistory(7, [1, 2, 3], async (history) => {
      await Promise.resolve();
      histories.push([...history]);
      if (history.includes(2)) throw new Error('delayed failure');
    }),
  ).rejects.toThrow('reduced from 3 to 1 commands:\n[2]');
  expect(histories).toContainEqual([2]);
});
