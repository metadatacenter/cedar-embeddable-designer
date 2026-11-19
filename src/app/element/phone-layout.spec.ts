import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CedarEmbeddableDesignerElementComponent } from './cedar-embeddable-designer.element';

/** The pane switch must preserve authoring state and respect keyboard events owned by its children. */
describe('phone-sized designer hosts', () => {
  let fixture: ComponentFixture<CedarEmbeddableDesignerElementComponent>;
  let root: ShadowRoot;
  let observers: Map<Element, ResizeObserverCallback>;

  beforeEach(async () => {
    localStorage.clear();
    observers = new Map();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private callback: ResizeObserverCallback) {}
        observe(target: Element): void {
          observers.set(target, this.callback);
        }
        disconnect(): void {}
      },
    );
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(CedarEmbeddableDesignerElementComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    root = (fixture.nativeElement as HTMLElement).shadowRoot!;
  });

  afterEach(() => vi.unstubAllGlobals());

  function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    return root.querySelector<T>(selector)!;
  }

  async function resize(width: number): Promise<void> {
    const host = element('app-root');
    observers.get(host)!(
      [
        {
          target: host,
          contentRect: new DOMRect(0, 0, width, 667),
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      {} as ResizeObserver,
    );
    await fixture.whenStable();
  }

  async function click(selector: string): Promise<void> {
    element(selector).click();
    await fixture.whenStable();
  }

  function escape(target: HTMLElement, prevented = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true });
    if (prevented) event.preventDefault();
    target.dispatchEvent(event);
    return event;
  }

  it('keeps the editor mounted and its document intact while Preview owns the phone pane', async () => {
    await resize(375);
    const service = fixture.componentInstance.service;
    service.templateName.set('An unfinished phone edit');
    service.showPreview.set(false);
    await fixture.whenStable();
    const editor = element('.designer-scroll');
    const artifact = fixture.componentInstance.currentArtifact;

    await click('.preview-toggle');
    expect(element('.main-content').classList.contains('preview-only')).toBe(true);
    expect(editor.hasAttribute('inert')).toBe(true);
    expect(root.activeElement).toBe(element('.preview-toggle'));

    escape(element('.preview-panel'), true);
    await fixture.whenStable();
    expect(service.showPreview()).toBe(true);
    expect(escape(element('.user-menu-trigger')).defaultPrevented).toBe(false);
    expect(service.showPreview()).toBe(true);

    expect(escape(element('.preview-panel')).defaultPrevented).toBe(true);
    await fixture.whenStable();
    expect(service.showPreview()).toBe(false);
    expect(element('.designer-scroll')).toBe(editor);
    expect(editor.hasAttribute('inert')).toBe(false);
    expect(root.activeElement).toBe(element('.preview-toggle'));
    expect(fixture.componentInstance.currentArtifact).toEqual(artifact);
  });

  it('lets Overview return to authoring and closes its overlay when Preview is requested', async () => {
    await resize(375);
    fixture.componentInstance.service.showPreview.set(true);
    await fixture.whenStable();

    await click('.overview-toggle');
    expect(root.querySelector('.preview-panel')).toBeNull();
    expect(element('.designer-scroll').hasAttribute('inert')).toBe(false);
    expect(element('.overview-panel--overlay')).toBeTruthy();
    expect(root.activeElement).toBe(element('.overview-toggle'));

    await click('.preview-toggle');
    expect(root.querySelector('.overview-panel--overlay')).toBeNull();
    expect(element('.preview-panel')).toBeTruthy();
    expect(root.activeElement).toBe(element('.preview-toggle'));
  });

  it('moves focus out of an editor covered by a resized host, while wider hosts retain both panes', async () => {
    await resize(900);
    fixture.componentInstance.service.showPreview.set(true);
    await fixture.whenStable();
    const control = element<HTMLInputElement>('.designer-scroll input');
    control.focus();
    expect(root.activeElement).toBe(control);

    await resize(599);
    expect(element('.designer-scroll').hasAttribute('inert')).toBe(true);
    expect(root.activeElement).toBe(element('.preview-toggle'));

    await resize(600);
    expect(element('.designer-scroll').hasAttribute('inert')).toBe(false);
    expect(element('.main-content').classList.contains('preview-only')).toBe(false);
    expect(element('.preview-panel')).toBeTruthy();
    expect(escape(element('.preview-toggle')).defaultPrevented).toBe(false);
    expect(fixture.componentInstance.service.showPreview()).toBe(true);
  });
});
