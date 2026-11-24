import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

describe('App（路由 + 布局冒烟）', () => {
  it('默认跳转到字典导入向导', async () => {
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(await screen.findByRole('heading', { name: '字典导入向导' })).toBeInTheDocument();
    // 布局三要素：侧边栏导航 + 顶栏 + 内容
    expect(screen.getByText('会员列表')).toBeInTheDocument();
    expect(screen.getByText('标签树')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '选择字典并上传文件' })).toBeInTheDocument();
  });

  it('演示页合计储值以分计算（前 5 条之和 = 185175 分）', async () => {
    window.history.replaceState({}, '', '/admin/demo');
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('demo-total-balance')).toBeInTheDocument());
    // 12345+24690+37035+49380+61725 = 185175
    expect(screen.getByTestId('demo-total-balance').textContent).toBe('合计储值（分）：185175');
  });
});
