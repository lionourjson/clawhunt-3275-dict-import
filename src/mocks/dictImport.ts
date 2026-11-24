import { delay, http, HttpResponse } from 'msw';
import { config } from '../config';
import { dictionaries, MAX_IMPORT_BYTES, parseImport } from '../lib/dictImport';
import type { Entry, ImportResult, Preview, PreviewInput } from '../lib/dictImport';

import { PREVIEW_PATH, CONFIRM_PATH } from '../lib/dictImport';

const ok = <T,>(data: T) => HttpResponse.json({ code: 0, data });
const failure = (message: string, status = 400) => HttpResponse.json({ code: status, message, data: null }, { status });

export function createDictImportHandlers({ failConfirm = false, delayMs = 0 } = {}) {
  const catalogs = new Map(dictionaries.map(({ value }) => [value, {
    revision: 0,
    entries: new Map([
      ['demo_current', '星环旧分类'],
      ['demo_locked', '归档示例分类'],
    ]),
  }]));
  const sessions = new Map<string, { dictionaryId: string; revision: number; preview: Preview; result?: ImportResult }>();
  return [
    http.post(`${config.apiBaseUrl}${PREVIEW_PATH}`, async ({ request }) => {
      if (delayMs) await delay(delayMs);
      const input = await request.json().catch(() => null) as Partial<PreviewInput> | null;
      const catalog = input?.dictionaryId && catalogs.get(input.dictionaryId);
      if (!input || !input.dictionaryId || !catalog || (input.format !== 'csv' && input.format !== 'json') || typeof input.content !== 'string') {
        return failure('字典、格式或文件内容不正确');
      }
      if (new TextEncoder().encode(input.content).length > MAX_IMPORT_BYTES) return failure('文件不能超过 2 MB', 413);
      let rows;
      try { rows = parseImport(input.format, input.content); }
      catch (error) { return failure((error as Error).message); }
      const preview: Preview = { previewId: crypto.randomUUID(), groups: { 新增: [], 更新: [], 冲突: [], 错误: [] } };
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
        if (!/^[a-zA-Z0-9_-]+$/.test(code) || !name) {
          preview.groups.错误.push({ ...row, reason: 'code 必须为字母、数字、下划线或连字符，name 不能为空' });
        } else if ((counts.get(code) ?? 0) > 1 || code === 'demo_locked') {
          preview.groups.冲突.push({ ...row, reason: code === 'demo_locked' ? '该条目已归档' : '文件中 code 重复' });
        } else {
          const kind = catalog.entries.has(code) ? '更新' : '新增';
          preview.groups[kind].push({ ...row, reason: kind === '更新' ? '将覆盖现有名称' : '将创建条目' });
        }
      }
      sessions.set(preview.previewId, { dictionaryId: input.dictionaryId, revision: catalog.revision, preview });
      return ok(preview);
    }),
    http.post(`${config.apiBaseUrl}${CONFIRM_PATH}`, async ({ request }) => {
      if (delayMs) await delay(delayMs);
      const input = await request.json().catch(() => null) as { previewId?: string } | null;
      const session = input?.previewId && sessions.get(input.previewId);
      if (!session) return failure('预演不存在，请重新预演', 404);
      if (session.result) return ok(session.result);
      const catalog = catalogs.get(session.dictionaryId)!;
      if (session.revision !== catalog.revision) return failure('字典已变更，请重新预演', 409);
      if (failConfirm) return failure('模拟导入服务暂不可用，请稍后重试', 503);
      const groups = session.preview.groups;
      const added = groups.新增.length;
      const updated = groups.更新.length;
      const succeeded = added + updated;
      const failed = groups.冲突.length + groups.错误.length;
      if (!succeeded) return failure('没有可导入的行');
      for (const { code, name } of [...groups.新增, ...groups.更新]) catalog.entries.set(code, name);
      catalog.revision += 1;
      session.result = { status: failed ? 'partial' : 'success', added, updated, succeeded, failed };
      return ok(session.result);
    }),
  ];
}
