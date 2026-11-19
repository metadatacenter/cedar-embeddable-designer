import { TestBed } from '@angular/core/testing';
import { TemplateService } from './template.service';

describe('validation announcement ownership', () => {
  afterEach(() => vi.useRealTimers());
  for (const pending of [true, false]) {
    it(`updates and clears only its count with a ${pending ? 'queued' : 'displayed'} action`, () => {
      vi.useFakeTimers();
      const service = TestBed.inject(TemplateService);
      service.announce('Default set.');
      service.announceAfter('Validation issues (2)');
      if (!pending) vi.advanceTimersByTime(100);
      service.updateAnnouncementAfter('Validation issues (1)');
      vi.advanceTimersByTime(100);
      expect(service.announcement()).toBe('Default set. Validation issues (1)');
      service.updateAnnouncementAfter(null);
      vi.advanceTimersByTime(100);
      expect(service.announcement()).toBe('Default set.');
    });
    it(`does not erase a newer ${pending ? 'queued' : 'displayed'} action`, () => {
      vi.useFakeTimers();
      const service = TestBed.inject(TemplateService);
      service.announceAfter('Validation issues (1)');
      vi.advanceTimersByTime(100);
      service.announce('Field moved.');
      if (!pending) vi.advanceTimersByTime(100);
      service.updateAnnouncementAfter(null);
      vi.advanceTimersByTime(100);
      expect(service.announcement()).toBe('Field moved.');
    });
    it(`clears a standalone ${pending ? 'queued' : 'displayed'} validation count`, () => {
      vi.useFakeTimers();
      const service = TestBed.inject(TemplateService);
      service.announceAfter('Validation issues (1)');
      if (!pending) vi.advanceTimersByTime(100);
      service.updateAnnouncementAfter(null);
      vi.advanceTimersByTime(100);
      expect(service.announcement()).toBe('');
    });
  }
});
