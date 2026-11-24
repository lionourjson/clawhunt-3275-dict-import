import { describe, expect, it } from 'vitest';
import { resolveScenario } from './scenario';

describe('resolveScenario（mock 场景解析）', () => {
  it('支持 success/empty/error/slow 四种场景', () => {
    expect(resolveScenario('?mock=success')).toBe('success');
    expect(resolveScenario('?mock=empty')).toBe('empty');
    expect(resolveScenario('?mock=error')).toBe('error');
    expect(resolveScenario('?mock=slow')).toBe('slow');
  });

  it('非法值与缺省回退 success', () => {
    expect(resolveScenario('?mock=whatever')).toBe('success');
    expect(resolveScenario('')).toBe('success');
  });
});
