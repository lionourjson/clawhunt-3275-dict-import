import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TagTreePage from './TagTreePage';
import { server } from '../setupTests';
import { createHandlers } from '../mocks/handlers';

describe('TagTreePage（树页：展开/搜索高亮/停用标记）', () => {
  it('成功场景：渲染虚构标签树', async () => {
    render(<TagTreePage />);
    await waitFor(() => expect(screen.getByTestId('tag-node-ind')).toBeInTheDocument());
    expect(screen.getByText('行业分类')).toBeInTheDocument();
    expect(screen.getByText('服务类目')).toBeInTheDocument();
    expect(screen.getByText('生态合作')).toBeInTheDocument();
  });

  it('已停用标签显示停用标记', async () => {
    render(<TagTreePage />);
    await waitFor(() => expect(screen.getByTestId('tag-disabled-ind-edu')).toBeInTheDocument());
    expect(screen.getByTestId('tag-disabled-ind-edu').textContent).toBe('已停用');
  });

  it('搜索命中后出现高亮标记（mark）', async () => {
    render(<TagTreePage />);
    await waitFor(() => expect(screen.getByTestId('tag-node-ind')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('搜索标签（结果高亮）'), { target: { value: '制造' } });
    await waitFor(() => expect(screen.getAllByTestId('search-highlight').length).toBeGreaterThan(0));
    // 未命中的根节点被过滤掉
    expect(screen.queryByText('服务类目')).not.toBeInTheDocument();
  });

  it('点击展开/收起切换子级显示', async () => {
    render(<TagTreePage />);
    await waitFor(() => expect(screen.getByTestId('tag-node-ind')).toBeInTheDocument());
    // 默认全展开：子级可见
    expect(screen.getByTestId('tag-node-ind-mfg')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tag-toggle-ind'));
    await waitFor(() => expect(screen.queryByTestId('tag-node-ind-mfg')).not.toBeInTheDocument());
    fireEvent.click(screen.getByTestId('tag-toggle-ind'));
    await waitFor(() => expect(screen.getByTestId('tag-node-ind-mfg')).toBeInTheDocument());
  });

  it('拖拽保存：drop 到同级节点后调用保存接口并同步服务端树', async () => {
    render(<TagTreePage />);
    await waitFor(() => expect(screen.getByTestId('tag-node-ind')).toBeInTheDocument());
    const dragNode = screen.getByTestId('tag-node-svc'); // 服务类目（根级）
    const dropNode = screen.getByTestId('tag-node-eco'); // 生态合作（根级，同级）
    fireEvent.dragStart(dragNode, { dataTransfer: { setData: () => undefined } });
    fireEvent.drop(dropNode, { dataTransfer: {} }); // offsetY=0、clientHeight=0 → 0<0 为假 → 同级 after
    // 保存中提示 → 成功后树为 [行业分类, 生态合作, 服务类目]
    await waitFor(() => expect(screen.getByTestId('tag-saving')).toBeInTheDocument());
    await waitFor(() => {
      const eco = screen.getByTestId('tag-node-eco');
      const svc = screen.getByTestId('tag-node-svc');
      // DOM 顺序：svc（服务类目）被移到 eco（生态合作）之后
      expect(eco.compareDocumentPosition(svc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    expect(screen.queryByTestId('tag-saving')).not.toBeInTheDocument();
  });

  it('报错态：mock=error 时显示报错+重试', async () => {
    server.use(...createHandlers({ scenario: 'error' }));
    render(<TagTreePage />);
    await waitFor(() => expect(screen.getByTestId('page-error')).toBeInTheDocument());
    server.use(...createHandlers({ scenario: 'success' }));
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(screen.getByTestId('tag-node-ind')).toBeInTheDocument());
  });
});
