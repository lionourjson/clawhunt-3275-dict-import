import { Button, Space, Tag } from 'tdesign-react';
import type { ImportResult } from '../../lib/dictImport';

export default function Step3Result({ result, onReset }: { result: ImportResult; onReset: () => void }) {
  const partial = result.status === 'partial';
  return (
    <section>
      <h2>导入结果</h2>
      <Space align="center">
        <Tag theme={partial ? 'warning' : 'success'} variant="light">{partial ? '部分导入成功' : '全部导入成功'}</Tag>
        <span>成功 {result.succeeded} 条，失败 {result.failed} 条</span>
      </Space>
      <p>新增 {result.added} 条，更新 {result.updated} 条。</p>
      {partial && <p>冲突和错误行已跳过，修正后可重新导入。</p>}
      <Button onClick={onReset}>开始新的导入</Button>
    </section>
  );
}
