import { expect, test } from 'bun:test';
import { runFleetControl } from '../src/lib/fleet/bulk-control';
test('bulk control bounds concurrency and preserves refusals and failures', async () => {
  let active = 0, peak = 0;
  const result = await runFleetControl([1,2,3,4,5], async (item) => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    if (item === 2) return 'waiting for approval';
    if (item === 3) throw new Error('unavailable');
    return null;
  }, 2);
  expect(peak).toBe(2);
  expect(result.changed).toEqual([1,4,5]);
  expect(result.skipped.map(({item,reason}) => [item,reason])).toEqual([[2,'waiting for approval'],[3,'failed']]);
});
