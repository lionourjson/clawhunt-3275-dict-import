import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PageState from './PageState';

describe('PageState（三态组件）', () => {
  it('加载态显示加载中', () => {
    render(<PageState loading error={null} isEmpty={false} />);
    expect(screen.getByTestId('page-loading')).toBeInTheDocument();
  });

  it('空态显示暂无数据', () => {
    render(<PageState loading={false} error={null} isEmpty />);
    expect(screen.getByTestId('page-empty')).toBeInTheDocument();
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('报错态显示错误信息，点重试触发回调', () => {
    const onRetry = vi.fn();
    render(<PageState loading={false} error="HTTP 500" isEmpty={false} onRetry={onRetry} />);
    expect(screen.getByTestId('page-error')).toBeInTheDocument();
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
