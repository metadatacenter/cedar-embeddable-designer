import { TestBed } from '@angular/core/testing';
import { IconComponent } from './icon.component';

/**
 * A component spec, rather than a plain unit test, because it is also what proves
 * the runner can compile one: `ng test` uses the Angular-aware Vitest builder, so
 * `templateUrl`, `styleUrls` and the component compiler all have to work here.
 *
 * What it checks of the component itself is the one branch with a decision in it.
 * `sanitizedSvg` hands raw markup to `bypassSecurityTrustHtml`, which is only safe
 * while the markup comes from the local table — an unknown key must produce nothing
 * rather than reach the DOM.
 */
describe('IconComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [IconComponent] });
  });

  it('renders the paths registered for a known key', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('key', 'trash');
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.querySelectorAll('line')).toHaveLength(2);
    expect(svg.querySelectorAll('polyline')).toHaveLength(1);
    expect(svg.querySelectorAll('path')).toHaveLength(1);
  });

  it('renders nothing for a key the table does not carry', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('key', 'no-such-icon');
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.innerHTML).toBe('');
  });

  it('puts the requested classes on the svg', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('key', 'eye');
    fixture.componentRef.setInput('className', 'w-4 h-4');
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    // Angular's class binding writes the classes as a set, so order is not ours.
    expect([...svg.classList].sort()).toEqual(['h-4', 'w-4']);
  });
});
