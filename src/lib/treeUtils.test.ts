import { describe, expect, it } from 'vitest';
import { filterTree, matchRanges, moveNode, sameLevel, type TagNode } from './treeUtils';
import { DEMO_TAGS } from '../mocks/data';

describe('filterTree（搜索过滤）', () => {
  it('命中叶子时保留其祖先链', () => {
    const out = filterTree(DEMO_TAGS, '智能装备');
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('行业分类');
    expect(out[0].children?.[0].label).toBe('制造业');
    expect(out[0].children?.[0].children?.[0].label).toBe('智能装备');
  });

  it('大小写不敏感，且未命中时返回空数组', () => {
    expect(filterTree(DEMO_TAGS, '服务')).toHaveLength(1);
    expect(filterTree(DEMO_TAGS, '不存在的标签')).toHaveLength(0);
  });

  it('空关键词返回原树', () => {
    expect(filterTree(DEMO_TAGS, '  ')).toBe(DEMO_TAGS);
  });
});

describe('matchRanges（高亮区间）', () => {
  it('返回命中子串的区间，大小写不敏感', () => {
    expect(matchRanges('DevOps 服务', 'dev')).toEqual([[0, 3]]);
    expect(matchRanges('设计服务', '服务')).toEqual([[2, 4]]);
  });

  it('多处命中与空关键词', () => {
    expect(matchRanges('aba', 'a')).toEqual([[0, 1], [2, 3]]);
    expect(matchRanges('任何', '  ')).toEqual([]);
  });
});

describe('moveNode（拖拽移动）', () => {
  const tree: TagNode[] = [
    { id: 'a', label: 'A', children: [{ id: 'a1', label: 'A1' }] },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ];

  it('同级 after：A 拖到 B 之后', () => {
    expect(moveNode(tree, 'a', 'b', 'after').map((n) => n.id)).toEqual(['b', 'a', 'c']);
  });

  it('同级 before：C 拖到 A 之前', () => {
    expect(moveNode(tree, 'c', 'a', 'before').map((n) => n.id)).toEqual(['c', 'a', 'b']);
  });

  it('inside：B 拖进 A 的子级', () => {
    const out = moveNode(tree, 'b', 'a', 'inside');
    expect(out[0].id).toBe('a');
    expect(out[0].children?.map((n) => n.id)).toEqual(['a1', 'b']);
  });

  it('跨层级 before/after 被拒绝（仅允许同级排序）', () => {
    // a1 在 A 的子级，B 在根级：不同级，before/after 不生效
    expect(moveNode(tree, 'a1', 'b', 'after')).toEqual(tree);
    expect(moveNode(tree, 'a1', 'b', 'before')).toEqual(tree);
  });

  it('拖到自身或拖进自己的后代时原样返回', () => {
    expect(moveNode(tree, 'a', 'a', 'after')).toEqual(tree);
    expect(moveNode(tree, 'a', 'a1', 'inside')).toEqual(tree);
  });
});

describe('sameLevel（同级判定）', () => {
  it('根级之间是同级，子级和根级之间不是同级', () => {
    expect(sameLevel(DEMO_TAGS, 'svc', 'eco')).toBe(true);
    expect(sameLevel(DEMO_TAGS, 'ind-trade', 'svc-dev')).toBe(false);
    expect(sameLevel(DEMO_TAGS, 'ind-mfg-eq', 'ind-mfg-auto')).toBe(true);
  });
});
