/**
 * 标签树纯函数：搜索过滤（含高亮定位）、同级拖拽移动。
 * 与 UI 解耦，便于单测；拖拽保存走 POST /api/tags/move。
 */

export interface TagNode {
  id: string;
  label: string;
  disabled?: boolean;
  children?: TagNode[];
}

export type MovePosition = 'before' | 'after' | 'inside';

/** 按关键词过滤树：命中节点保留，其祖先链保留（保证可展开到达）。空关键词返回原树。 */
export function filterTree(nodes: TagNode[], keyword: string): TagNode[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return nodes;
  const walk = (list: TagNode[]): TagNode[] => {
    const out: TagNode[] = [];
    for (const n of list) {
      const children = n.children ? walk(n.children) : undefined;
      const selfHit = n.label.toLowerCase().includes(kw);
      if (selfHit || (children && children.length > 0)) {
        out.push({ ...n, children: children && children.length > 0 ? children : n.children });
      }
    }
    return out;
  };
  return walk(nodes);
}

/** 命中关键词的子串区间列表（用于搜索结果高亮），大小写不敏感。 */
export function matchRanges(label: string, keyword: string): Array<[number, number]> {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return [];
  const hay = label.toLowerCase();
  const ranges: Array<[number, number]> = [];
  let from = 0;
  for (;;) {
    const idx = hay.indexOf(kw, from);
    if (idx === -1) break;
    ranges.push([idx, idx + kw.length]);
    from = idx + kw.length;
  }
  return ranges;
}

/**
 * 拖拽移动：把 dragId 节点移动到 dropId 相邻（before/after，仅限同级）或其子级（inside）。
 * 同级约束：before/after 要求两者父节点相同（同为根也视为同级）；不满足时原样返回。
 */
export function moveNode(
  nodes: TagNode[],
  dragId: string,
  dropId: string,
  position: MovePosition,
): TagNode[] {
  if (dragId === dropId) return nodes;
  if (!sameLevel(nodes, dragId, dropId) && position !== 'inside') return nodes;
  const removed = removeNode(nodes, dragId);
  if (!removed.node) return nodes;
  // inside 不允许把节点挂到自己的后代下面
  if (position === 'inside' && isDescendant(removed.node, dropId)) return nodes;
  return insertNode(removed.list, dropId, removed.node, position);
}

function findPath(nodes: TagNode[], id: string, trail: TagNode[] = []): TagNode[] | null {
  for (const n of nodes) {
    if (n.id === id) return [...trail, n];
    if (n.children) {
      const sub = findPath(n.children, id, [...trail, n]);
      if (sub) return sub;
    }
  }
  return null;
}

/** 同级 = 父节点相同（根节点之间也算同级） */
export function sameLevel(nodes: TagNode[], aId: string, bId: string): boolean {
  const pa = findPath(nodes, aId);
  const pb = findPath(nodes, bId);
  if (!pa || !pb) return false;
  const paKey = pa.length > 1 ? pa[pa.length - 2].id : '';
  const pbKey = pb.length > 1 ? pb[pb.length - 2].id : '';
  return paKey === pbKey;
}

function isDescendant(node: TagNode, id: string): boolean {
  if (node.id === id) return true;
  return (node.children ?? []).some((c) => isDescendant(c, id));
}

function removeNode(list: TagNode[], id: string): { list: TagNode[]; node: TagNode | null } {
  let picked: TagNode | null = null;
  const out: TagNode[] = [];
  for (const n of list) {
    if (n.id === id) {
      picked = n;
      continue;
    }
    if (n.children) {
      const sub = removeNode(n.children, id);
      if (sub.node) picked = sub.node;
      out.push({ ...n, children: sub.list.length > 0 ? sub.list : undefined });
    } else {
      out.push(n);
    }
  }
  return { list: out, node: picked };
}

function insertNode(
  list: TagNode[],
  dropId: string,
  node: TagNode,
  position: MovePosition,
): TagNode[] {
  const out: TagNode[] = [];
  for (const n of list) {
    if (n.id === dropId) {
      if (position === 'before') {
        out.push(node, n);
      } else if (position === 'after') {
        out.push(n, node);
      } else {
        out.push({ ...n, children: [...(n.children ?? []), node] });
      }
      continue;
    }
    out.push(n.children ? { ...n, children: insertNode(n.children, dropId, node, position) } : n);
  }
  return out;
}
