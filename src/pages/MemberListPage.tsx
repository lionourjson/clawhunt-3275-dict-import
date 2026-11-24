import { useCallback, useEffect, useState } from 'react';
import { Button, Input, Select, Table, type TableProps } from 'tdesign-react';
import PageState from '../components/PageState';
import { apiGet } from '../api/client';
import { fenToYuan } from '../lib/money';
import type { Member } from '../mocks/data';

/** 列表页模板：筛选（关键词+状态）+ 分页 + 表格，空/加载/报错三态。 */
const columns: TableProps['columns'] = [
  { colKey: 'name', title: '会员名' },
  { colKey: 'phone', title: '手机号' },
  { colKey: 'level', title: '等级' },
  {
    colKey: 'status',
    title: '状态',
    cell: ({ row }) => (row.status === 'active' ? '正常' : '冻结'),
  },
  {
    colKey: 'balance_cents',
    title: '储值余额（元）',
    cell: ({ row }) => `¥${fenToYuan(row.balance_cents)}`,
  },
  { colKey: 'created_at', title: '创建时间' },
];

const PAGE_SIZE = 10;

export default function MemberListPage() {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(
    (opts: { keyword: string; status: string; page: number }) => {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams({
        keyword: opts.keyword,
        status: opts.status,
        page: String(opts.page),
        pageSize: String(PAGE_SIZE),
      });
      apiGet<{ list: Member[]; total: number }>(`/members?${qs.toString()}`)
        .then((d) => {
          setRows(d.list);
          setTotal(d.total);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    load({ keyword, status, page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const search = () => {
    setPage(1);
    load({ keyword, status, page: 1 });
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <Input
          placeholder="按会员名/手机号筛选"
          value={keyword}
          onChange={(v) => setKeyword(v as string)}
          style={{ width: 240 }}
          clearable
        />
        <Select
          placeholder="状态"
          value={status || undefined}
          onChange={(v) => setStatus((v as string) ?? '')}
          clearable
          style={{ width: 160 }}
          options={[
            { label: '正常', value: 'active' },
            { label: '冻结', value: 'frozen' },
          ]}
        />
        <Button theme="primary" onClick={search} data-testid="member-search-btn">
          查询
        </Button>
      </div>
      <PageState loading={loading} error={error} isEmpty={!error && rows.length === 0} emptyText="没有符合条件的会员" onRetry={() => load({ keyword, status, page })} />
      {!loading && !error && rows.length > 0 && (
        <>
          {/* TDesign Table 不透传 data-* 到 DOM，外面包一层便于测试定位 */}
          <div data-testid="member-table">
            <Table rowKey="id" columns={columns} data={rows} />
          </div>
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="member-prev-page">
              上一页
            </Button>
            <span style={{ margin: '0 12px' }} data-testid="member-page-info">
              第 {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))} 页（共 {total} 条）
            </span>
            <Button variant="outline" disabled={page >= Math.ceil(total / PAGE_SIZE)} onClick={() => setPage(page + 1)} data-testid="member-next-page">
              下一页
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
