import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ManualIriComponent } from './manual-iri.component';
import { PropertyPickerComponent } from '../property-picker/property-picker.component';
import { TypesPickerComponent } from '../types-picker/types-picker.component';
import { TemplateService } from '../../core/services/template.service';

it('validates only on submit, trims IRIs and rejects duplicate types', async () => {
  const fixture = TestBed.createComponent(ManualIriComponent);
  fixture.componentRef.setInput('existing', ['urn:existing']);
  fixture.detectChanges();
  await fixture.whenStable();
  const editor = fixture.componentInstance;
  const received: string[] = [];
  editor.accepted.subscribe((value) => received.push(value));
  expect(editor.error()).toBeNull();
  for (const value of ['', 'relative', 'https://example.org/a b', 'urn:bad%xx', 'urn:existing']) {
    editor.value.set(value);
    editor.submit();
    expect(editor.error()).toBeTruthy();
  }
  expect(received).toEqual([]);
  for (const value of ['urn:custom', ' https://example.org/語彙/term ']) {
    editor.value.set(value);
    editor.submit();
  }
  expect(received).toEqual(['urn:custom', 'https://example.org/語彙/term']);
});

it('adds manual types through the shared form and leaves values unchanged on cancel', async () => {
  localStorage.clear();
  const service = TestBed.inject(TemplateService);
  const fixture = TestBed.createComponent(TypesPickerComponent);
  const refresh = async () => {
    fixture.componentRef.setInput('container', service.document());
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await refresh();
  fixture.componentInstance.manualOpened.set(true);
  await refresh();
  const form = fixture.debugElement.query(By.directive(ManualIriComponent)).componentInstance as ManualIriComponent;
  form.value.set('urn:custom');
  form.submit();
  await refresh();
  expect(fixture.componentInstance.types()).toEqual(['urn:custom']);
  expect(fixture.componentInstance.manualOpened()).toBe(false);
  fixture.componentInstance.manualOpened.set(true);
  await refresh();
  const next = fixture.debugElement.query(By.directive(ManualIriComponent)).componentInstance as ManualIriComponent;
  next.value.set('urn:discard');
  next.cancelled.emit();
  expect(fixture.componentInstance.types()).toEqual(['urn:custom']);
  expect(fixture.componentInstance.manualOpened()).toBe(false);
});

it('sets a manual property and does not emit on cancel or when disabled', async () => {
  const fixture = TestBed.createComponent(PropertyPickerComponent);
  const editor = fixture.componentInstance;
  const values: string[] = [];
  editor.propertySelected.subscribe((value) => values.push(value));
  editor.manualOpened.set(true);
  fixture.detectChanges();
  await fixture.whenStable();
  const form = fixture.debugElement.query(By.directive(ManualIriComponent)).componentInstance as ManualIriComponent;
  form.value.set('urn:property');
  form.submit();
  expect(values).toEqual(['urn:property']);
  editor.closeManual();
  fixture.componentRef.setInput('disabled', true);
  editor.acceptManual('urn:blocked');
  expect(values).toEqual(['urn:property']);
});
