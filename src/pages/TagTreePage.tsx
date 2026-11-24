import { useCallback, useEffect, useState } from 'react';
import { Button, Input, MessagePlugin, Tag } from 'tdesign-react';
import PageState from '../components/PageState';
import { apiGet, apiPost } from '../api/client';
import { filterTree, matchRanges, moveNode, sameLevel, type MovePosition, type TagNode } from '../lib/treeUtils';

/**
 * 树页模板：展开/收起、搜索高亮、同级拖拽排序（拖完调 mock 保存接口）。
 * 拖拽用原生 HTML5 drag & drop：同级 → before/after 排序；跨级 → 放入目标子级（inside）。
 */
interface FlatRow {
  node: TagNode;
  depth: number;
}

function flatten(nodes: TagNode[], depth = 0, expanded: Set<string>): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const n of nodes) {
    rows.push({ node: n, depth });
    if (n.children && expanded.has(n.id)) {
      rows.push(...flatten(n.children, depth + 1, expanded));
    }
  }
  return rows;
}

function collectIds(nodes: TagNode[], out: Set<string> = new Set()): Set<string> {
  for (const n of nodes) {
    if (n.children) {
      out.add(n.id);
      collectIds(n.children, out);
    }
  }
  return out;
}

function HighlightedLabel({ label, keyword }: { label: string; keyword: string }) {
  const ranges = matchRanges(label, keyword);
  if (ranges.length === 0) return <>{label}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(label.slice(cursor, start));
    parts.push(
      <mark key={`hl-${i}`} data-testid="search-highlight" style={{ background: '#ffe58f' }}>
        {label.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < label.length) parts.push(label.slice(cursor));
  return <>{parts}</>;
}

export default function TagTreePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<TagNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiGet<TagNode[]>('/tags')
      .then((d) => {
        setTags(d);
        setExpanded(collectIds(d));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** 拖拽落点：同级按鼠标位置取 before/after；跨级一律作为目标子级（inside）。 */
  const handleDrop = async (target: TagNode, offsetY: number, rowHeight: number) => {
    if (!dragId || dragId === target.id) return;
    const position: MovePosition = sameLevel(tags, dragId, target.id)
      ? offsetY < rowHeight / 2
        ? 'before'
        : 'after'
      : 'inside';
    const moved = moveNode(tags, dragId, target.id, position);
    if (moved === tags) return;
    setTags(moved);
    setSaving(true);
    try {
      // 拖完调保存接口（mock），把服务端返回的树同步回来，保证 UI 与"持久化"一致
      const serverTree = await apiPost<
        { id: string; targetId: string; position: MovePosition },
        TagNode[]
      >('/tags/move', { id: dragId, targetId: target.id, position });
      setTags(serverTree);
      await MessagePlugin.success(`已保存：${dragId} → ${target.id}（${position}）`);
    } catch (e) {
      setTags(tags); // 保存失败回滚
      await MessagePlugin.error(`保存失败：${(e as Error).message}`);
    } finally {
      setSaving(false);
      setDragId(null);
    }
  };

  const visible = filterTree(tags, keyword);
  const rows = flatten(visible, 0, expanded);
  const searching = keyword.trim() !== '';

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <Input
          placeholder="搜索标签（结果高亮）"
          value={keyword}
          onChange={(v) => setKeyword(v as string)}
          style={{ width: 240 }}
          clearable
          data-testid="tag-search-input"
        />
        <Button variant="outline" onClick={() => setKeyword('')} data-testid="tag-search-clear">
          清空搜索
        </Button>
        <span style={{ color: 'var(--td-text-color-placeholder, #a0a0a0)' }}>
          拖拽：同级=排序（上/下半行），跨级=放入目标子级；拖完自动调用保存接口
        </span>
      </div>
      <PageState loading={loading} error={error} isEmpty={!error && visible.length === 0} emptyText="没有匹配的标签" onRetry={load} />
      {!loading && !error && rows.length > 0 && (
        <ul data-testid="tag-tree" style={{ listStyle: 'none', margin: 0, padding: 0, maxWidth: 640 }}>
          {rows.map(({ node, depth }) => (
            <li
              key={node.id}
              draggable
              onDragStart={() => setDragId(node.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(node, e.nativeEvent.offsetY, e.currentTarget.clientHeight)}
              style={{
                marginLeft: depth * 24,
                padding: '6px 8px',
                marginBottom: 2,
                background: 'var(--td-bg-color-container, #fff)',
                border: '1px solid var(--td-border-level-1-color, #e7e7e7)',
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                opacity: node.disabled ? 0.55 : 1,
                color: node.disabled ? 'var(--td-text-color-disabled, #b8b8b8)' : undefined,
              }}
              data-testid={`tag-node-${node.id}`}
            >
              {node.children ? (
                <button
                  type="button"
                  onClick={() => toggle(node.id)}
                  style={{ cursor: 'pointer', border: 'none', background: 'none' }}
                  data-testid={`tag-toggle-${node.id}`}
                >
                  {expanded.has(node.id) ? '▾' : '▸'}
                </button>
              ) : (
                <span style={{ width: 14, display: 'inline-block' }} />
              )}
              <span>
                <HighlightedLabel label={node.label} keyword={searching ? keyword : ''} />
              </span>
              {node.disabled && <Tag theme="warning" data-testid={`tag-disabled-${node.id}`}>已停用</Tag>}
              {node.children ? <Tag variant="outline">引用 {node.children.length}</Tag> : null}
            </li>
          ))}
        </ul>
      )}
      {saving && <p data-testid="tag-saving">保存中...</p>}
    </div>
  );
}
