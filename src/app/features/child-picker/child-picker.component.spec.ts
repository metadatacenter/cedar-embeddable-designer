import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChildPickerComponent } from './child-picker.component';
import { TemplateService } from '../../core/services/template.service';
import { CedChildResult } from '../../ced-public-api';

const RESULTS: CedChildResult[] = ['Alpha', 'Beta', 'Gamma'].map((name, index) => ({
  id: `https://repo.metadatacenter.org/template-fields/${index}`,
  name,
  type: 'field',
}));

/** The picker with three search results shown and none chosen. jsdom has no modal dialogs, so one is stubbed. */
function picker(): { fixture: ComponentFixture<ChildPickerComponent>; component: ChildPickerComponent } {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  const service = TestBed.inject(TemplateService);
  service.childSource.set({ search: async () => ({ results: RESULTS }), load: async () => ({}) });
  const fixture = TestBed.createComponent(ChildPickerComponent);
  fixture.componentRef.setInput('target', { targetId: service.session.document().id, position: 0 });
  fixture.componentInstance.results.set(RESULTS);
  fixture.detectChanges();
  // jsdom focuses nothing inside a dialog that is not open, and the picker opens it after the first render.
  fixture.nativeElement.querySelector('dialog').setAttribute('open', '');
  return { fixture, component: fixture.componentInstance };
}

const rows = (fixture: ComponentFixture<ChildPickerComponent>): HTMLElement[] => [
  ...fixture.nativeElement.querySelectorAll('tr.result-row'),
];

function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

it('draws the results as a grid whose rows carry their selected state and keep their names', () => {
  const { fixture, component } = picker();
  const grid: HTMLTableElement = rows(fixture)[0].closest('table')!;
  expect(grid.getAttribute('role')).toBe('grid');
  expect(grid.getAttribute('aria-multiselectable')).toBe('true');
  expect(rows(fixture).map((row) => row.getAttribute('aria-label'))).toEqual([
    'Select Alpha',
    'Select Beta',
    'Select Gamma',
  ]);
  component.select(RESULTS[1]);
  fixture.detectChanges();
  expect(rows(fixture).map((row) => row.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
});

it('keeps one Tab stop: the first row, then the row focus last rested on while it is a result', () => {
  const { fixture, component } = picker();
  const stops = () => rows(fixture).map((row) => row.getAttribute('tabindex'));
  expect(stops()).toEqual(['0', '-1', '-1']);
  rows(fixture)[2].focus();
  fixture.detectChanges();
  expect(stops()).toEqual(['-1', '-1', '0']);
  // A chosen row keeps the stop, so the arrow keys still start from it.
  component.select(RESULTS[2]);
  fixture.detectChanges();
  expect(stops()).toEqual(['-1', '-1', '0']);
  // A new search that drops the row gives the stop to its first row.
  component.results.set(RESULTS.slice(0, 2));
  fixture.detectChanges();
  expect(stops()).toEqual(['0', '-1']);
});

it('moves focus with Up, Down, Home and End, stops at the ends, and chooses nothing', () => {
  const { fixture, component } = picker();
  const focused = () => rows(fixture).indexOf(document.activeElement as HTMLElement);
  rows(fixture)[0].focus();
  for (const [key, index] of [
    ['ArrowDown', 1],
    ['ArrowDown', 2],
    ['ArrowDown', 2],
    ['Home', 0],
    ['ArrowUp', 0],
    ['End', 2],
    ['ArrowUp', 1],
  ] as const) {
    expect(press(rows(fixture)[focused()], key).defaultPrevented, key).toBe(true);
    expect(focused(), key).toBe(index);
  }
  expect(component.selected()).toEqual([]);
  // A modified key is the browser's or the host's, and a key the grid does not use passes through.
  expect(press(rows(fixture)[1], 'ArrowDown', { ctrlKey: true }).defaultPrevented).toBe(false);
  expect(press(rows(fixture)[1], 'a').defaultPrevented).toBe(false);
});

it('chooses the focused row with Enter or Space, once, and not while the picker is adding', () => {
  const { fixture, component } = picker();
  expect(press(rows(fixture)[1], 'Enter').defaultPrevented).toBe(true);
  expect(component.selected()).toEqual([RESULTS[1]]);
  expect(press(rows(fixture)[1], ' ').defaultPrevented).toBe(true);
  expect(component.selected()).toEqual([RESULTS[1]]);
  component.saving.set(true);
  press(rows(fixture)[2], ' ');
  expect(component.selected()).toEqual([RESULTS[1]]);
  component.saving.set(false);
  press(rows(fixture)[2], ' ');
  expect(component.selected()).toEqual([RESULTS[1], RESULTS[2]]);
});

it('moves a chosen row one place with Move up and Move down, does nothing at an end, and says where it went', () => {
  vi.useFakeTimers();
  try {
    const { fixture, component } = picker();
    for (const row of RESULTS) component.select(row);
    fixture.detectChanges();
    const button = (name: string): HTMLButtonElement =>
      fixture.nativeElement.querySelector(`button[aria-label="${name}"]`);
    const names = () => component.selected().map((row) => row.name);
    expect(button('Move Alpha up').getAttribute('aria-disabled')).toBe('true');
    expect(button('Move Gamma down').getAttribute('aria-disabled')).toBe('true');
    expect(button('Move Beta up').hasAttribute('aria-disabled')).toBe(false);

    button('Move Alpha up').click();
    button('Move Gamma down').click();
    vi.advanceTimersByTime(200);
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(component.moveAnnouncement()).toBe('');

    button('Move Gamma up').click();
    fixture.detectChanges();
    expect(names()).toEqual(['Alpha', 'Gamma', 'Beta']);
    // The message is set a moment after it is cleared, so a repeated message is read again.
    expect(component.moveAnnouncement()).toBe('');
    vi.advanceTimersByTime(100);
    expect(component.moveAnnouncement()).toBe('Gamma moved to position 2 of 3.');
    button('Move Alpha down').click();
    vi.advanceTimersByTime(100);
    expect(names()).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(component.moveAnnouncement()).toBe('Alpha moved to position 2 of 3.');
  } finally {
    vi.useRealTimers();
  }
});
