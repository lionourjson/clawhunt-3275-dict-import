import { delay, http, HttpResponse } from 'msw';
import { config } from '../config';
import { canImport, resolveDemoActor } from '../auth/demoAuth';
import type { DemoActor } from '../auth/demoAuth';
import { dictionaries, isValidEntry, MAX_IMPORT_BYTES, parseImport } from '../lib/dictImport';
import type { Entry, ImportResult, Preview, PreviewInput } from '../lib/dictImport';
import { PREVIEW_PATH, CONFIRM_PATH } from '../lib/dictImport';

const ok = <T,>(data: T) => HttpResponse.json({ code: 0, data });
const failure = (message: string, status = 400) => HttpResponse.json({ code: status, message, data: null }, { status });
type Scope = { orgId: string; siteId: string; deleted?: boolean };
type Options = {
  failConfirm?: boolean;
  delayMs?: number;
  confirmDelayMs?: (call: number) => number;
  // Only used by the race test to model a real server which commits despite client disconnect.
  commitAfterAbort?: boolean;
  dictionaryScope?: Partial<Record<string, Scope>>;
  existingCodes?: string[];
  archivedCodes?: string[];
};

function authorized(request: Request): DemoActor | Response {
  const actor = resolveDemoActor(request.headers.get('X-Demo-Actor'));
  if (!actor) return failure('请先登录工作台', 401);
  if (!canImport(actor)) return failure('没有字典导入权限', 403);
  return actor;
}

export function createDictImportHandlers({ failConfirm = false, delayMs = 0, confirmDelayMs, commitAfterAbort = false, dictionaryScope = {}, existingCodes = [], archivedCodes = ['demo_locked'] }: Options = {}) {
  const archived = new Set(archivedCodes);
  const catalogs = new Map(dictionaries.map(({ value }) => [value, {
    scope: dictionaryScope[value] ?? { orgId: 'org-demo-001', siteId: 'site-demo-001' },
    revision: 0,
    entries: new Map([
      ['demo_current', '星环旧分类'],
      ['demo_locked', '归档示例分类'],
      ...existingCodes.map((code): [string, string] => [code, '已有条目']),
    ]),
  }]));
  const sessions = new Map<string, { dictionaryId: string; actorId: string; orgId: string; siteId: string; revision: number; preview: Preview; result?: ImportResult }>();
  let confirmCalls = 0;
  return [
    http.post(`${config.apiBaseUrl}${PREVIEW_PATH}`, async ({ request }) => {
      const actor = authorized(request);
      if (actor instanceof Response) return actor;
      if (delayMs) await delay(delayMs);
      if (request.signal.aborted) return HttpResponse.error();
      const input = await request.json().catch(() => null) as Partial<PreviewInput> | null;
      const catalog = input?.dictionaryId && catalogs.get(input.dictionaryId);
      if (!input || !input.dictionaryId || !catalog || (input.format !== 'csv' && input.format !== 'json') || typeof input.content !== 'string') {
        return failure('字典、格式或文件内容不正确');
      }
      if (catalog.scope.deleted) return failure('目标字典已删除', 410);
      if (catalog.scope.orgId !== actor.orgId || catalog.scope.siteId !== actor.siteId) return failure('不可访问该组织或站点的字典', 403);
      if (new TextEncoder().encode(input.content).length > MAX_IMPORT_BYTES) return failure('文件不能超过 2 MB', 413);
      let rows;
      try { rows = parseImport(input.format, input.content); }
      catch (error) { return failure((error as Error).message); }
      const preview: Preview = { previewId: crypto.randomUUID(), ownerId: actor.id, orgId: actor.orgId, siteId: actor.siteId, groups: { 新增: [], 更新: [], 冲突: [], 错误: [] } };
      const counts = new Map<string, number>();
      const normalized = rows.map(({ line, raw, value }) => {
        const entry = value as Partial<Entry> | null;
        const code = typeof entry?.code === 'string' ? entry.code.trim() : '';
        const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
        if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
        return { line, raw, code, name };
      });
      for (const row of normalized) {
        const { code, name } = row;
        if (!isValidEntry(row)) {
          preview.groups.错误.push({ ...row, reason: 'code 必须为字母、数字、下划线或连字符，name 不能为空' });
        } else if ((counts.get(code) ?? 0) > 1 || archived.has(code)) {
          preview.groups.冲突.push({ ...row, reason: archived.has(code) ? '该条目已归档' : '文件中 code 重复' });
        } else {
          const kind = catalog.entries.has(code) ? '更新' : '新增';
          preview.groups[kind].push({ ...row, reason: kind === '更新' ? '将覆盖现有名称' : '将创建条目' });
        }
      }
      sessions.set(preview.previewId, { dictionaryId: input.dictionaryId, actorId: actor.id, orgId: actor.orgId, siteId: actor.siteId, revision: catalog.revision, preview });
      return ok(preview);
    }),
    http.post(`${config.apiBaseUrl}${CONFIRM_PATH}`, async ({ request }) => {
      const actor = authorized(request);
      if (actor instanceof Response) return actor;
      confirmCalls += 1;
      const wait = confirmDelayMs?.(confirmCalls) ?? delayMs;
      if (wait) await delay(wait);
      if (request.signal.aborted && !commitAfterAbort) return HttpResponse.error();
      const input = await request.json().catch(() => null) as { previewId?: string } | null;
      const session = input?.previewId && sessions.get(input.previewId);
      if (!session) return failure('预演不存在，请重新预演', 404);
      // Ownership must precede the cached result check: a successful preview is still private.
      if (session.actorId !== actor.id || session.orgId !== actor.orgId || session.siteId !== actor.siteId) return failure('预演不属于当前身份', 403);
      const catalog = catalogs.get(session.dictionaryId);
      if (!catalog || catalog.scope.deleted) return failure('目标字典已删除', 410);
      if (catalog.scope.orgId !== actor.orgId || catalog.scope.siteId !== actor.siteId) return failure('不可访问该组织或站点的字典', 403);
      if (session.result) return ok(session.result);
      if (session.revision !== catalog.revision) return failure('字典已变更，请重新预演', 409);
      if (failConfirm) return failure('模拟导入服务暂不可用，请稍后重试', 503);
      const groups = session.preview.groups;
      const added = groups.新增.length;
      const updated = groups.更新.length;
      const succeeded = added + updated;
      const failed = groups.冲突.length + groups.错误.length;
      if (!succeeded) return failure('没有可导入的行');
      // No await from revision check through commit: mock mutation is atomic per event loop turn.
      for (const { code, name } of [...groups.新增, ...groups.更新]) catalog.entries.set(code, name);
      catalog.revision += 1;
      session.result = { status: failed ? 'partial' : 'success', added, updated, succeeded, failed };
      return ok(session.result);
    }),
  ];
}
