/** 演示用虚构数据（全部自拟，不含任何真实企业/客户/个人信息）。 */

export interface Member {
  id: string;
  name: string;
  phone: string;
  level: 'basic' | 'silver' | 'gold';
  status: 'active' | 'frozen';
  /** 会员储值余额，单位：分（金额一律以分存整数） */
  balance_cents: number;
  org_id: string;
  created_at: string;
}

/** 23 条虚构会员，供分页演示（每页 10 条 → 共 3 页） */
export const MEMBERS: Member[] = Array.from({ length: 23 }, (_, i) => {
  const idx = i + 1;
  const levels: Member['level'][] = ['basic', 'silver', 'gold'];
  return {
    id: `m-${String(idx).padStart(3, '0')}`,
    name: `演示会员${idx}`,
    phone: `138${String(10000000 + idx * 137).slice(0, 8)}`,
    level: levels[idx % 3],
    status: idx % 7 === 0 ? 'frozen' : 'active',
    balance_cents: idx * 12345,
    org_id: 'org-demo-001',
    created_at: `2026-10-${String((idx % 28) + 1).padStart(2, '0')} 09:${String(idx % 60).padStart(2, '0')}:00`,
  };
});

export interface TagNode {
  id: string;
  label: string;
  disabled?: boolean;
  children?: TagNode[];
}

/** 虚构标签树（三级），用于树页演示 */
export const DEMO_TAGS: TagNode[] = [
  {
    id: 'ind',
    label: '行业分类',
    children: [
      {
        id: 'ind-mfg',
        label: '制造业',
        children: [{ id: 'ind-mfg-eq', label: '智能装备' }, { id: 'ind-mfg-auto', label: '汽车零部件' }],
      },
      { id: 'ind-trade', label: '跨境贸易' },
      { id: 'ind-edu', label: '教育培训', disabled: true },
    ],
  },
  {
    id: 'svc',
    label: '服务类目',
    children: [{ id: 'svc-design', label: '设计服务' }, { id: 'svc-dev', label: '软件开发' }],
  },
  { id: 'eco', label: '生态合作' },
];
