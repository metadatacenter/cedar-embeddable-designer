import { nextPresetSize } from './preset-sizes';

it('steps to the next larger preset and wraps from the largest to the smallest', () => {
  const presets = [10, 33.33, 75];
  expect(nextPresetSize(10, presets)).toBe(33.33);
  expect(nextPresetSize(33.33, presets)).toBe(75);
  expect(nextPresetSize(75, presets)).toBe(10);
  // A size between two presets steps to the larger one.
  expect(nextPresetSize(20, presets)).toBe(33.33);
  expect(nextPresetSize(50, presets)).toBe(75);
  // Past the largest, as after the room for a panel shrinks, it wraps.
  expect(nextPresetSize(90, presets)).toBe(10);
});

it('takes the presets in any order and passes over a default equal to the minimum', () => {
  expect(nextPresetSize(224, [224, 224, 480])).toBe(480);
  expect(nextPresetSize(480, [480, 224, 256])).toBe(224);
  expect(nextPresetSize(256, [480, 224, 256])).toBe(480);
});
