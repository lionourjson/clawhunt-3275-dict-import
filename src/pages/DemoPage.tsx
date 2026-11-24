import { useEffect, useState } from 'react';
import { Card } from 'tdesign-react';
import PageState from '../components/PageState';
import { apiGet } from '../api/client';
import { fenToYuan } from '../lib/money';
import type { Member } from '../mocks/data';

/** 工作台演示页：演示三态组件与金额展示（分→元）。 */
export default function DemoPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<{ list: Member[]; total: number }>('/members?page=1&pageSize=5')
      .then((d) => setMembers(d.list))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const totalBalance = members.reduce((sum, m) => sum + m.balance_cents, 0);

  return (
    <div>
      <Card title="工作台演示（/admin/demo）" style={{ marginBottom: 16 }}>
        <p>这是会员空间平台的前端模板演示页。技术栈：Vite + React + TypeScript + TDesign + Vitest + MSW。</p>
        <p>切换 mock 场景：在地址栏加 ?mock=success | empty | error | slow 后刷新，可分别看到正常 / 空态 / 报错 / 慢响应加载。</p>
        <p>下方卡片数据来自 MSW mock 接口 GET /api/members（前 5 条）。</p>
      </Card>
      <PageState loading={loading} error={error} isEmpty={!error && members.length === 0} onRetry={load} />
      {!loading && !error && members.length > 0 && (
        <Card title="最近会员（金额以分存储，展示层转元）">
          <ul data-testid="demo-member-list">
            {members.map((m) => (
              <li key={m.id}>
                {m.name}（{m.level}）· 储值余额 ¥{fenToYuan(m.balance_cents)}
              </li>
            ))}
          </ul>
          <p data-testid="demo-total-balance">合计储值（分）：{totalBalance}</p>
        </Card>
      )}
    </div>
  );
}
