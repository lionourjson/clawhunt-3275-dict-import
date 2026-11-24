import { useState } from 'react';
import { Button, Space, Table, Tabs } from 'tdesign-react';
import { downloadErrors, kinds } from '../../lib/dictImport';
import type { Kind, Preview } from '../../lib/dictImport';

interface Props {
  preview: Preview;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

export default function Step2Preview({ preview, busy, onBack, onConfirm }: Props) {
  const [kind, setKind] = useState<Kind>('新增');
  const [page, setPage] = useState(1);
  const rows = preview.groups[kind];
  const canConfirm = preview.groups.新增.length + preview.groups.更新.length > 0;
  const pageSize = 10;
  return (
    <section>
      <h2>预演结果</h2>
      <p>确认后只导入新增和更新行，跳过冲突和错误行。</p>
      <Tabs value={kind} onChange={(value) => { setKind(value as Kind); setPage(1); }}>
        {kinds.map((item) => <Tabs.TabPanel key={item} value={item} label={`${item}（${preview.groups[item].length}）`} />)}
      </Tabs>
      <h3>{kind}明细</h3>
      <Table rowKey="line" data={rows.slice((page - 1) * pageSize, page * pageSize)} size="small" disableDataPage
        empty={`没有${kind}行`} pagination={rows.length > pageSize ? { current: page, pageSize, total: rows.length, pageSizeOptions: [] } : undefined}
        onPageChange={({ current }) => setPage(current)}
        columns={[
          { colKey: 'line', title: '行号', width: 80 },
          { colKey: 'code', title: '编码', ellipsis: true },
          { colKey: 'name', title: '名称', ellipsis: true },
          ...(kind === '错误' ? [{ colKey: 'raw', title: '原文', ellipsis: true }] : []),
          { colKey: 'reason', title: '说明', ellipsis: true },
        ]} />
      <Space style={{ flexWrap: 'wrap', marginTop: 20 }}>
        <Button variant="outline" disabled={busy} onClick={onBack}>返回上传</Button>
        {kind === '错误' && rows.length > 0 && <Button variant="outline" onClick={() => downloadErrors(rows)}>下载错误行 CSV</Button>}
        <Button tag="button" loading={busy} disabled={!canConfirm || busy} onClick={onConfirm}>确认导入</Button>
      </Space>
      {!canConfirm && <p>没有可导入的行，请修正文件后重新预演。</p>}
    </section>
  );
}
