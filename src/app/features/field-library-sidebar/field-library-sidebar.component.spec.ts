import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FieldLibrarySidebarComponent } from './field-library-sidebar.component';
import { TemplateService } from '../../core/services/template.service';

/** The sidebar over the template a new designer starts with, which holds three fields, with none selected. */
function sidebar(): {
  fixture: ComponentFixture<FieldLibrarySidebarComponent>;
  service: TemplateService;
  ids: number[];
} {
  localStorage.clear();
  const service = TestBed.inject(TemplateService);
  service.selectedField.set(null);
  service.focusRequest.set(null);
  const fixture = TestBed.createComponent(FieldLibrarySidebarComponent);
  fixture.detectChanges();
  return { fixture, service, ids: service.fields().map((field) => field.id) };
}

const entries = (fixture: ComponentFixture<FieldLibrarySidebarComponent>): HTMLElement[] => [
  ...fixture.nativeElement.querySelectorAll('.draggable-field-item'),
];

function press(entry: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  entry.dispatchEvent(event);
  return event;
}

it('draws the field list as a listbox named by its heading, with the selected field marked', () => {
  const { fixture, service, ids } = sidebar();
  const list: HTMLElement = fixture.nativeElement.querySelector('.sidebar-scrollable');
  expect(list.getAttribute('role')).toBe('listbox');
  const heading = fixture.nativeElement.querySelector(`#${list.getAttribute('aria-labelledby')}`);
  expect(heading.textContent.trim()).toBe('Fields (3)');
  expect(entries(fixture).map((entry) => entry.getAttribute('role'))).toEqual(['option', 'option', 'option']);
  expect(entries(fixture).map((entry) => entry.getAttribute('aria-selected'))).toEqual(['false', 'false', 'false']);
  service.selectedField.set(ids[1]);
  fixture.detectChanges();
  expect(entries(fixture).map((entry) => entry.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
});

it('gives an empty list no listbox role, because a listbox must hold options', () => {
  const { fixture, service, ids } = sidebar();
  for (const id of ids) service.deleteField(id);
  fixture.detectChanges();
  const list: HTMLElement = fixture.nativeElement.querySelector('.sidebar-scrollable');
  expect(list.hasAttribute('role')).toBe(false);
  expect(list.hasAttribute('aria-labelledby')).toBe(false);
  expect(list.textContent).toContain('No fields yet');
});

it('keeps one Tab stop: the selected field, else the first, and the focused entry while focus is in the list', () => {
  const { fixture, service, ids } = sidebar();
  const stops = () => entries(fixture).map((entry) => entry.getAttribute('tabindex'));
  expect(stops()).toEqual(['0', '-1', '-1']);
  service.selectedField.set(ids[2]);
  fixture.detectChanges();
  expect(stops()).toEqual(['-1', '-1', '0']);
  // Focus on another entry moves the stop to it, so Tab leaves the list rather than reaching a second stop.
  entries(fixture)[1].focus();
  fixture.detectChanges();
  expect(stops()).toEqual(['-1', '0', '-1']);
  entries(fixture)[0].focus();
  fixture.detectChanges();
  expect(stops()).toEqual(['0', '-1', '-1']);
  // Once focus leaves the list, the stop returns to the selected field.
  entries(fixture)[0].blur();
  fixture.detectChanges();
  expect(stops()).toEqual(['-1', '-1', '0']);
});

it('moves focus with Up, Down, Home and End, stops at the ends, and leaves the selection alone', () => {
  const { fixture, service } = sidebar();
  const focused = () => entries(fixture).indexOf(document.activeElement as HTMLElement);
  entries(fixture)[0].focus();
  for (const [key, index] of [
    ['ArrowDown', 1],
    ['ArrowDown', 2],
    ['ArrowDown', 2],
    ['Home', 0],
    ['ArrowUp', 0],
    ['End', 2],
    ['ArrowUp', 1],
  ] as const) {
    const event = press(entries(fixture)[focused()], key);
    expect(event.defaultPrevented, key).toBe(true);
    expect(focused(), key).toBe(index);
  }
  expect(service.selectedField()).toBeNull();
  // A modified key is the browser's or the host's, and a key the list does not use passes through.
  expect(press(entries(fixture)[1], 'ArrowDown', { ctrlKey: true }).defaultPrevented).toBe(false);
  expect(press(entries(fixture)[1], 'a').defaultPrevented).toBe(false);
  expect(focused()).toBe(1);
});

it('chooses an entry with Enter as a click does, and then asks for focus on its card', () => {
  const { fixture, service, ids } = sidebar();
  entries(fixture)[1].click();
  expect(service.selectedField()).toBe(ids[1]);
  expect(service.scrollRequest()).toBe(ids[1]);
  // A click leaves focus where the pointer put it.
  expect(service.focusRequest()).toBeNull();

  entries(fixture)[2].focus();
  expect(press(entries(fixture)[2], 'Enter').defaultPrevented).toBe(true);
  expect(service.selectedField()).toBe(ids[2]);
  expect(service.scrollRequest()).toBe(ids[2]);
  expect(service.focusRequest()).toEqual({ kind: 'card', id: ids[2] });
});

describe('the divider below the field list', () => {
  /** The sidebar 800px tall, which jsdom cannot lay out, and its divider. */
  function divider(): { fixture: ComponentFixture<FieldLibrarySidebarComponent>; handle: HTMLElement } {
    const { fixture } = sidebar();
    const container: HTMLElement = fixture.nativeElement.querySelector('.sidebar-container');
    container.getBoundingClientRect = () => new DOMRect(0, 0, 288, 800);
    return { fixture, handle: fixture.nativeElement.querySelector('[role="separator"]') };
  }
  const mouse = (target: EventTarget, type: string, clientY: number) =>
    target.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true, cancelable: true }));

  it('steps through 10%, the default and 75% on each click, wrapping from the largest', () => {
    const { fixture, handle } = divider();
    const share = () => fixture.componentInstance.fieldListHeight();
    expect(share()).toBe(33.33);
    for (const expected of [75, 10, 33.33, 75]) {
      handle.click();
      expect(share()).toBe(expected);
    }
  });

  it('counts a press that strays a few pixels as a click, stepping from where the press began', () => {
    const { fixture, handle } = divider();
    mouse(handle, 'mousedown', 300);
    mouse(document, 'mousemove', 304);
    mouse(document, 'mouseup', 304);
    handle.click();
    expect(fixture.componentInstance.fieldListHeight()).toBe(75);
  });

  it('moves the divider as far as a drag moves the pointer, and a drag is no click', () => {
    const { fixture, handle } = divider();
    mouse(handle, 'mousedown', 300);
    mouse(document, 'mousemove', 380);
    mouse(document, 'mouseup', 380);
    handle.click();
    // 80px of an 800px sidebar is 10 points more than the default.
    expect(fixture.componentInstance.fieldListHeight()).toBeCloseTo(43.33, 5);
  });
});
