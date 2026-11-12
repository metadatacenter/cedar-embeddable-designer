import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FieldCardComponent } from './field-card.component';
import { TemplateService } from '../../core/services/template.service';

/** A card for a new field of `type`, with its settings open, where the options are edited. */
function cardFor(type: string): { fixture: ComponentFixture<FieldCardComponent>; service: TemplateService } {
  localStorage.clear();
  const service = TestBed.inject(TemplateService);
  service.addField(type, 0);
  const fixture = TestBed.createComponent(FieldCardComponent);
  fixture.componentRef.setInput('field', service.fields()[0]);
  fixture.detectChanges();
  fixture.nativeElement.querySelector('.settings-toggle').click();
  fixture.detectChanges();
  return { fixture, service };
}

it('draws a Name caption before the name box, which keeps its own accessible name', () => {
  const { fixture } = cardFor('text');
  const heading: HTMLElement = fixture.nativeElement.querySelector('.field-heading');
  const caption = heading.querySelector('.field-name-caption')!;
  const name = heading.querySelector<HTMLInputElement>('input.field-name')!;
  expect(caption.textContent?.trim()).toBe('Name');
  expect(caption.nextElementSibling).toBe(name);
  // A label tied to the box would take the header click that toggles the settings.
  expect(caption.localName).toBe('span');
  expect(heading.querySelector('label')).toBeNull();
  expect(name.getAttribute('aria-label')).toBe('Enter field name');
  expect(name.placeholder).toBe('Enter field name');
});

it('numbers each option box, and renumbers the boxes when an option is removed', () => {
  const { fixture, service } = cardFor('multipleChoice');
  const id = service.fields()[0].id;
  service.updateOption(id, 0, 'Red');
  service.addOption(id);
  service.updateOption(id, 1, 'Green');
  service.addOption(id);
  service.updateOption(id, 2, 'Blue');
  const render = () => {
    fixture.componentRef.setInput('field', service.fields()[0]);
    fixture.detectChanges();
  };
  const rows = () =>
    [...fixture.nativeElement.querySelectorAll('.choice-option-row')].map((row: HTMLElement) => {
      const number = row.querySelector('.choice-option-number')!;
      // The number sits directly before the box it labels.
      expect(number.nextElementSibling).toBe(row.querySelector('input'));
      return [number.textContent?.trim(), row.querySelector('input')!.getAttribute('aria-label')];
    });
  render();
  expect(rows()).toEqual([
    ['1', 'Option 1'],
    ['2', 'Option 2'],
    ['3', 'Option 3'],
  ]);
  service.deleteOption(id, 0);
  render();
  expect(rows()).toEqual([
    ['1', 'Option 1'],
    ['2', 'Option 2'],
  ]);
});
