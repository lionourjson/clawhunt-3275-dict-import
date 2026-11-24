import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MemberListPage from './MemberListPage';
import { server } from '../setupTests';
import { createHandlers } from '../mocks/handlers';
import { MEMBERS } from '../mocks/data';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/members']}>
      <MemberListPage />
    </MemoryRouter>,
  );
}

describe('MemberListPage（列表页：筛选+分页+表格）', () => {
  it('成功场景：渲染第一页 10 条，共 23 条', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('member-table')).toBeInTheDocument());
    expect(screen.getByText('演示会员1')).toBeInTheDocument();
    expect(screen.getByText(/共 23 条/)).toBeInTheDocument();
    const rows = screen.getAllByText(/演示会员\d+/);
    expect(rows).toHaveLength(10);
  });

  it('翻页：点下一页到第 2 页', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('member-next-page')).toBeEnabled());
    fireEvent.click(screen.getByTestId('member-next-page'));
    await waitFor(() => expect(screen.getByText(/第 2 \/ 3 页/)).toBeInTheDocument());
    expect(screen.getByText('演示会员11')).toBeInTheDocument();
  });

  it('筛选：按关键词过滤', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('member-search-btn')).toBeEnabled());
    fireEvent.change(screen.getByPlaceholderText('按会员名/手机号筛选'), { target: { value: '演示会员3' } });
    fireEvent.click(screen.getByTestId('member-search-btn'));
    await waitFor(() => expect(screen.getByText(/共 1 条/)).toBeInTheDocument());
    expect(screen.getByText('演示会员3')).toBeInTheDocument();
  });

  it('空态：mock=empty 时显示空态组件', async () => {
    server.use(...createHandlers({ scenario: 'empty' }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('page-empty')).toBeInTheDocument());
    expect(screen.getByText('没有符合条件的会员')).toBeInTheDocument();
  });

  it('报错态：mock=error 时显示报错+重试，重试恢复成功', async () => {
    server.use(...createHandlers({ scenario: 'error' }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('page-error')).toBeInTheDocument());
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
    server.use(...createHandlers({ scenario: 'success' }));
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(screen.getByTestId('member-table')).toBeInTheDocument());
  });
});

describe('金额展示', () => {
  it('表格里金额以分存储、按元展示', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(`¥${(MEMBERS[0].balance_cents / 100).toFixed(2)}`)).toBeInTheDocument());
  });
});
