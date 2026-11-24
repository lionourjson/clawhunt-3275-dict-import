import { createDictImportHandlers } from './dictImport';
import { http, HttpResponse, delay } from 'msw';
import { config } from '../config';
import { MEMBERS, DEMO_TAGS, type Member, type TagNode } from './data';
import { moveNode } from '../lib/treeUtils';
import type { MockScenario } from './scenario';

/**
 * MSW 请求处理器。场景（success/empty/error/slow）由初始化方注入：
 * - 浏览器端：启动时按 URL ?mock= 参数解析（见 src/mocks/browser.ts）
 * - Vitest 端：默认 success，需要其它场景时用 server.use 覆盖（见各测试文件）
 */
export interface HandlerOptions {
  scenario: MockScenario;
  slowDelayMs?: number;
}

/** 标签树的可变副本：拖拽保存接口演示"改动被持久化"（仅在当前页面会话内） */
let tagStore: TagNode[] = DEMO_TAGS;

function fail() {
  return HttpResponse.json({ code: 1, message: '服务异常（mock 演示）' }, { status: 500 });
}

export function createHandlers({ scenario, slowDelayMs = 3000 }: HandlerOptions) {
  const maybeSlow = async () => {
    if (scenario === 'slow') await delay(slowDelayMs);
  };

  return [
    ...createDictImportHandlers({ failConfirm: scenario === 'error', delayMs: scenario === 'slow' ? slowDelayMs : 0 }),
    http.get(`${config.apiBaseUrl}/members`, async ({ request }) => {
      await maybeSlow();
      if (scenario === 'error') return fail();
      const url = new URL(request.url);
      const keyword = (url.searchParams.get('keyword') ?? '').trim();
      const status = url.searchParams.get('status') ?? '';
      const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
      const pageSize = Math.max(1, Number(url.searchParams.get('pageSize') ?? 10));
      let list = MEMBERS;
      if (keyword) list = list.filter((m) => m.name.includes(keyword) || m.phone.includes(keyword));
      if (status) list = list.filter((m) => m.status === status);
      const total = scenario === 'empty' ? 0 : list.length;
      const paged = scenario === 'empty' ? [] : list.slice((page - 1) * pageSize, page * pageSize);
      return HttpResponse.json({ code: 0, data: { list: paged, total } });
    }),

    http.post(`${config.apiBaseUrl}/members`, async ({ request }) => {
      await maybeSlow();
      if (scenario === 'error') return fail();
      const body = (await request.json()) as Partial<Member>;
      if (!body?.name || typeof body.balance_cents !== 'number') {
        return HttpResponse.json({ code: 1, message: '参数缺失（mock 演示）' }, { status: 400 });
      }
      return HttpResponse.json(
        { code: 0, data: { id: `m-${Date.now()}`, ...body, org_id: 'org-demo-001', created_at: '2026-11-18 00:00:00' } },
        { status: 201 },
      );
    }),

    http.get(`${config.apiBaseUrl}/tags`, async () => {
      await maybeSlow();
      if (scenario === 'error') return fail();
      return HttpResponse.json({ code: 0, data: scenario === 'empty' ? [] : tagStore });
    }),

    http.post(`${config.apiBaseUrl}/tags/move`, async ({ request }) => {
      await maybeSlow();
      if (scenario === 'error') return fail();
      const body = (await request.json()) as { id?: string; targetId?: string; position?: 'before' | 'after' | 'inside' };
      if (!body?.id || !body?.targetId || !body?.position) {
        return HttpResponse.json({ code: 1, message: '参数缺失（mock 演示）' }, { status: 400 });
      }
      tagStore = moveNode(tagStore, body.id, body.targetId, body.position);
      return HttpResponse.json({ code: 0, data: tagStore });
    }),
  ];
}

export const handlers = createHandlers({ scenario: 'success' });
