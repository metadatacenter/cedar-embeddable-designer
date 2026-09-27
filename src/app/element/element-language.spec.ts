import { formatDate } from '@angular/common';
import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CedarEmbeddableDesignerElementComponent } from './cedar-embeddable-designer.element';
import { CedarEmbeddableFieldDesignerElementComponent } from './cedar-embeddable-field-designer.element';
import { LOCALES } from '../i18n/messages';

/**
 * The host's choice of language, at the element's boundary.
 *
 * Each element provides its own translation service, so these tests read the text an
 * element renders rather than the service's state: a language that changed in the
 * service but not on screen is the failure that matters.
 */
const text = (fixture: ComponentFixture<unknown>, selector: string): string => {
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const root = host.shadowRoot ?? host;
  return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
};

const attribute = (fixture: ComponentFixture<unknown>, selector: string, name: string): string | null => {
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  return (host.shadowRoot ?? host).querySelector(selector)?.getAttribute(name) ?? null;
};

beforeEach(() => {
  localStorage.clear();
  // jsdom has no ResizeObserver, and the designer observes its own width once rendered.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  TestBed.configureTestingModule({});
});

afterEach(() => vi.unstubAllGlobals());

describe('the designer element', () => {
  const create = () => TestBed.createComponent(CedarEmbeddableDesignerElementComponent);

  it('renders English by default', () => {
    const fixture = create();
    expect(fixture.componentInstance.language).toBe('en');
    expect(text(fixture, '.overview-panel__title')).toBe('Overview (3)');
    expect(text(fixture, '.field-type-label')).toBe('Text');
  });

  it('renders Hungarian when the host sets the language, and English again when it switches back', () => {
    const fixture = create();
    fixture.componentRef.setInput('language', 'hu');
    expect(fixture.componentInstance.language).toBe('hu');
    expect(text(fixture, '.overview-panel__title')).toBe('Áttekintés (3)');
    expect(text(fixture, '.field-type-label')).toBe('Szöveg');
    expect(attribute(fixture, '.overview-panel__close', 'aria-label')).toBe('Áttekintés bezárása');

    fixture.componentRef.setInput('language', 'en');
    expect(text(fixture, '.overview-panel__title')).toBe('Overview (3)');
    expect(text(fixture, '.field-type-label')).toBe('Text');
    expect(attribute(fixture, '.overview-panel__close', 'aria-label')).toBe('Close Overview');
  });

  it('falls back to English for a language it does not have', () => {
    const fixture = create();
    fixture.componentRef.setInput('language', 'hu');
    fixture.componentRef.setInput('language', 'fr');
    expect(fixture.componentInstance.language).toBe('en');
    expect(text(fixture, '.overview-panel__title')).toBe('Overview (3)');
  });

  it('keeps each element on its own language', () => {
    const hungarian = create();
    const english = create();
    hungarian.componentRef.setInput('language', 'hu');
    expect(text(hungarian, '.overview-panel__title')).toBe('Áttekintés (3)');
    expect(text(english, '.overview-panel__title')).toBe('Overview (3)');
  });

  it('reports validation messages in the active language', () => {
    const fixture = create();
    const element = fixture.componentInstance;
    const field = element.service.fields()[0];
    element.service.updateFieldName(field.id, '');
    const message = () => element.validationReport.issues.find((issue) => issue.nodeId === field.id)?.message;
    expect(message()).toBe('Field name is required.');
    fixture.componentRef.setInput('language', 'hu');
    expect(message()).toBe('A mező nevének megadása kötelező.');
  });
});

describe('the field designer element', () => {
  it('renders Hungarian when the host sets the language, and English again when it switches back', () => {
    const fixture = TestBed.createComponent(CedarEmbeddableFieldDesignerElementComponent);
    fixture.componentInstance.newArtifact('text');
    expect(attribute(fixture, 'section.field-editor', 'aria-label')).toBe('Field designer');
    fixture.componentRef.setInput('language', 'hu');
    expect(fixture.componentInstance.language).toBe('hu');
    expect(attribute(fixture, 'section.field-editor', 'aria-label')).toBe('Mezőtervező');
    expect(text(fixture, '.field-type-label')).toBe('Szöveg');
    fixture.componentRef.setInput('language', 'en');
    expect(attribute(fixture, 'section.field-editor', 'aria-label')).toBe('Field designer');
    expect(text(fixture, '.field-type-label')).toBe('Text');
  });
});

describe('dates', () => {
  it('keep their English format and take the Hungarian locale in Hungarian', () => {
    const date = '2026-09-25T12:00:00';
    expect(formatDate(date, 'mediumDate', LOCALES.en)).toBe(formatDate(date, 'mediumDate', 'en-US'));
    expect(formatDate(date, 'mediumDate', LOCALES.en)).toBe('Sep 25, 2026');
    expect(formatDate(date, 'mediumDate', LOCALES.hu)).toBe('2026. szept. 25.');
  });
});
