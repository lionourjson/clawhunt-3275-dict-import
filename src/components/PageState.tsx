import { Empty, Loading } from 'tdesign-react';

/** 页面三态组件：加载 / 空态 / 报错+重试。成功态由页面自行渲染。 */
export interface PageStateProps {
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  emptyText?: string;
  onRetry?: () => void;
}

export default function PageState({ loading, error, isEmpty, emptyText = '暂无数据', onRetry }: PageStateProps) {
  if (loading) {
    return (
      <div className="page-state page-state--loading" data-testid="page-loading" style={{ padding: '64px 0', textAlign: 'center' }}>
        <Loading size="large" text="加载中..." />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page-state page-state--error" data-testid="page-error" style={{ padding: '64px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--td-error-color, #d54941)', marginBottom: 16 }}>加载失败：{error}</p>
        {onRetry ? (
          <button type="button" className="page-state__retry" onClick={onRetry} style={{ padding: '6px 16px' }}>
            重试
          </button>
        ) : null}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="page-state page-state--empty" data-testid="page-empty" style={{ padding: '64px 0', textAlign: 'center' }}>
        <Empty title={emptyText} />
      </div>
    );
  }
  return null;
}
