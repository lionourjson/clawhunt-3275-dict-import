import { describe, expect, it } from 'vitest';
import { fenToYuan, yuanToFen } from './money';

describe('money（金额以分存整数）', () => {
  it('分转元', () => {
    expect(fenToYuan(1234)).toBe('12.34');
    expect(fenToYuan(5)).toBe('0.05');
    expect(fenToYuan(0)).toBe('0.00');
  });

  it('非整数分抛错（金额必须以分存整数）', () => {
    expect(() => fenToYuan(12.5)).toThrow(TypeError);
  });

  it('元转分（表单层）', () => {
    expect(yuanToFen('12.34')).toBe(1234);
    expect(yuanToFen('0.05')).toBe(5);
    expect(yuanToFen('abc')).toBeNaN();
  });
});
