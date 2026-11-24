import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import Wizard from './index';
import Step2Preview from './Step2Preview';
import { errorCsv, MAX_IMPORT_BYTES, parseImport, validateFile } from '../../lib/dictImport';
import ImportGuard from '../../auth/ImportGuard';
import { setDemoActor } from '../../auth/demoAuth';
import type { ImportResult, Preview } from '../../lib/dictImport';
import { apiPost } from '../../api/client';
import { createDictImportHandlers } from '../../mocks/dictImport';
import { server } from '../../setupTests';
import csvTemplate from '../../../public/templates/dict_import_template.csv?raw';
import jsonTemplate from '../../../public/templates/dict_import_template.json?raw';

const fixture = 'code,name\ndemo_new,环轨材料\ndemo_current,星环新分类\ndemo_locked,示例档案\ninvalid code,错误示例';
const makeFile = (content: BlobPart, name = 'fixture.csv', type = 'text/csv') => new File([content], name, { type });

function chooseDictionary() {
  fireEvent.click(screen.getByPlaceholderText('请选择字典'));
  fireEvent.click(screen.getByText('行业字典'));
}

function selectFile(container: HTMLElement, file: File) {
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
}

const requestPreview = (content = fixture, format = 'csv') => apiPost<object, Preview>('/taxonomy/import/preview', { dictionaryId: 'industry', content, format });
const confirm = (previewId: string) => apiPost<object, ImportResult>('/taxonomy/import/confirm', { previewId });
const confirmWithSignal = (previewId: string, signal: AbortSignal) => apiPost<object, ImportResult>('/taxonomy/import/confirm', { previewId }, signal);

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('向导上传与下载', () => {
  it('未选字典不可预演；超过 2 MB 一字节在前端拦截且不调用预演', async () => {
    const called = vi.fn();
    server.use(http.post('*/api/taxonomy/import/preview', () => { called(); return HttpResponse.json({}); }));
    const { container } = render(<Wizard />);
    const button = screen.getByRole('button', { name: '生成预演' });
    selectFile(container, makeFile(fixture));
    await screen.findByText(/已选择 fixture.csv/);
    expect(button).toBeDisabled();
    chooseDictionary();
    expect(button).toBeEnabled();
    selectFile(container, makeFile(new Uint8Array(MAX_IMPORT_BYTES + 1), 'oversize.csv'));
    expect(await screen.findByRole('alert')).toHaveTextContent('文件不能超过 2 MB');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(called).not.toHaveBeenCalled();
  });

  it('正好 2 MB 放行，拒绝错误扩展名、MIME 和零字节', () => {
    expect(validateFile(makeFile(new Uint8Array(MAX_IMPORT_BYTES)))).toBe('csv');
    expect(() => validateFile(makeFile('x', 'data.txt'))).toThrow('仅支持');
    expect(() => validateFile(makeFile('x', 'data.json'))).toThrow('MIME');
    expect(() => validateFile(makeFile(''))).toThrow('文件为空');
  });

  it('拒绝 GBK 字节和仅有表头的 CSV，校验模板下载路径及内容', async () => {
    const { container } = render(<Wizard />);
    chooseDictionary();
    const button = screen.getByRole('button', { name: '生成预演' });
    selectFile(container, makeFile(new Uint8Array([0xd6, 0xd0]), 'gbk.csv'));
    await screen.findByText(/已选择 gbk.csv/);
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('UTF-8');
    selectFile(container, makeFile('code,name\n'));
    await screen.findByText(/已选择 fixture.csv/);
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('只有表头');
    expect(screen.getByRole('button', { name: '下载 CSV 模板' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '下载 JSON 模板' })).toBeEnabled();
    expect(parseImport('csv', csvTemplate)).toHaveLength(2);
    expect(parseImport('json', jsonTemplate)).toHaveLength(2);
  });

  it('模板按钮获取真实响应，404、坏内容和下载 API 异常均提示且可重试', async () => {
    const downloaded = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    server.use(http.get('*/templates/dict_import_template.csv', () => HttpResponse.text(csvTemplate)));
    server.use(http.get('*/templates/dict_import_template.json', () => HttpResponse.text(jsonTemplate)));
    render(<Wizard />);
    fireEvent.click(screen.getByRole('button', { name: '下载 CSV 模板' }));
    await waitFor(() => expect(downloaded.mock.contexts[0]).toHaveAttribute('download', 'dict_import_template.csv'));
    fireEvent.click(screen.getByRole('button', { name: '下载 JSON 模板' }));
    await waitFor(() => expect(downloaded.mock.contexts[1]).toHaveAttribute('download', 'dict_import_template.json'));
    server.use(http.get('*/templates/dict_import_template.csv', () => new HttpResponse(null, { status: 404 })));
    fireEvent.click(screen.getByRole('button', { name: '下载 CSV 模板' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 404');
    expect(downloaded).toHaveBeenCalledTimes(2);
    server.use(http.get('*/templates/dict_import_template.csv', () => HttpResponse.text('wrong,header')));
    fireEvent.click(screen.getByRole('button', { name: '下载 CSV 模板' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CSV 表头');
    server.use(http.get('*/templates/dict_import_template.csv', () => HttpResponse.text(csvTemplate)));
    downloaded.mockImplementationOnce(() => { throw new Error('browser download blocked'); });
    fireEvent.click(screen.getByRole('button', { name: '下载 CSV 模板' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('browser download blocked');
    fireEvent.click(screen.getByRole('button', { name: '下载 CSV 模板' }));
    await waitFor(() => expect(downloaded).toHaveBeenCalledTimes(4));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['JSON', 'json', '[null]', 1],
    ['JSON', 'json', '[{"code":"ok","name":"有效"},{"code":"bad code","name":"条目"}]', 2],
    ['JSON', 'json', '[{"code":"ok","name":123}]', 1],
    ['CSV', 'csv', 'code,name\nok,有效\nmissing,  ', 3],
    ['CSV', 'csv', 'code,name\nok,有效\nextra,名称,多一列', 3],
  ])('%s 模板包含无效行（%s: %s）时不下载并允许重试', async (label, format, source, line) => {
    const downloaded = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const endpoint = `*/templates/dict_import_template.${format}`;
    server.use(http.get(endpoint, () => HttpResponse.text(source)));
    render(<Wizard />);
    const downloadButton = () => screen.getByRole('button', { name: `下载 ${label} 模板` });
    fireEvent.click(downloadButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(`模板第 ${line} 行的 code 或 name 不合法`);
    expect(downloaded).not.toHaveBeenCalled();
    server.use(http.get(endpoint, () => HttpResponse.text(format === 'csv' ? csvTemplate : jsonTemplate)));
    await waitFor(() => expect(downloadButton()).toBeEnabled());
    fireEvent.click(downloadButton());
    await waitFor(() => expect(downloaded.mock.contexts[0]).toHaveAttribute('download', `dict_import_template.${format}`));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('显示四个分类，错误页签可下载，确认后显示部分成功', async () => {
    const { container } = render(<Wizard />);
    const downloaded = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    chooseDictionary();
    selectFile(container, makeFile(fixture));
    await screen.findByText(/已选择 fixture.csv/);
    fireEvent.click(screen.getByRole('button', { name: '生成预演' }));
    await screen.findByRole('heading', { name: '新增明细' });
    for (const kind of ['新增', '更新', '冲突', '错误']) expect(screen.getByText(`${kind}（1）`)).toBeInTheDocument();
    expect(screen.queryByText('下载错误行 CSV')).toBeNull();
    fireEvent.click(screen.getByText('错误（1）'));
    fireEvent.click(screen.getByRole('button', { name: '下载错误行 CSV' }));
    expect(downloaded.mock.contexts[0]).toHaveAttribute('download', 'dict_import_errors.csv');
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    expect(await screen.findByText('部分导入成功')).toBeInTheDocument();
    expect(screen.getByText('成功 2 条，失败 2 条')).toBeInTheDocument();
  });

  it.each([
    ['空响应信封', null],
    ['缺少所有字段', { code: 0, data: {} }],
    ['空载荷', { code: 0, data: null }],
    ['未知状态', { code: 0, data: { status: 'done', added: 1, updated: 1, succeeded: 2, failed: 2 } }],
    ['负数计数', { code: 0, data: { status: 'partial', added: -1, updated: 3, succeeded: 2, failed: 2 } }],
    ['小数计数', { code: 0, data: { status: 'partial', added: 0.5, updated: 1.5, succeeded: 2, failed: 2 } }],
    ['字符串计数', { code: 0, data: { status: 'partial', added: '1', updated: 1, succeeded: 2, failed: 2 } }],
    ['计数总和矛盾', { code: 0, data: { status: 'partial', added: 1, updated: 1, succeeded: 3, failed: 2 } }],
    ['状态与失败数矛盾', { code: 0, data: { status: 'success', added: 1, updated: 1, succeeded: 2, failed: 2 } }],
  ])('确认 HTTP 200/%s 保留预演并用同一预演重试', async (_, envelope) => {
    server.use(...createDictImportHandlers());
    const attempted = vi.fn();
    server.use(http.post('*/api/taxonomy/import/confirm', async ({ request }) => {
      attempted(await request.json());
      return HttpResponse.json(envelope);
    }, { once: true }));
    const { container } = render(<Wizard />);
    chooseDictionary();
    selectFile(container, makeFile(fixture));
    await screen.findByText(/已选择 fixture.csv/);
    fireEvent.click(screen.getByRole('button', { name: '生成预演' }));
    await screen.findByRole('heading', { name: '预演结果' });
    const button = screen.getByRole('button', { name: '确认导入' });
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('响应格式不正确，请重试');
    expect(screen.getByRole('heading', { name: '预演结果' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '导入结果' })).not.toBeInTheDocument();
    expect(button).toBeEnabled();
    const fetchCall = vi.spyOn(globalThis, 'fetch');
    fireEvent.click(button);
    expect(await screen.findByText('成功 2 条，失败 2 条')).toBeInTheDocument();
    expect(JSON.parse(fetchCall.mock.calls[0][1]!.body as string)).toEqual(attempted.mock.calls[0][0]);
  });

  it('错误行导出失败提示，切换身份后不能下载先前预演', async () => {
    const { container } = render(<Wizard />);
    chooseDictionary();
    selectFile(container, makeFile(fixture));
    await screen.findByText(/已选择 fixture.csv/);
    fireEvent.click(screen.getByRole('button', { name: '生成预演' }));
    await screen.findByRole('heading', { name: '新增明细' });
    fireEvent.click(screen.getByText('错误（1）'));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('download failed'); });
    fireEvent.click(screen.getByRole('button', { name: '下载错误行 CSV' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('错误行下载失败');
    expect(click).toHaveBeenCalledTimes(1);
    setDemoActor('demo-other-org');
    fireEvent.click(screen.getByRole('button', { name: '下载错误行 CSV' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('无权下载此预演');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it.each(['预演明细', '确认结果'])('同组织同站点运营身份切换清空旧%s，切回也不恢复', async (stage) => {
    server.use(...createDictImportHandlers());
    const { container } = render(<ImportGuard><Wizard /></ImportGuard>);
    chooseDictionary();
    selectFile(container, makeFile(fixture));
    await screen.findByText(/已选择 fixture.csv/);
    fireEvent.click(screen.getByRole('button', { name: '生成预演' }));
    await screen.findByRole('heading', { name: '新增明细' });
    fireEvent.click(screen.getByText('错误（1）'));
    expect(screen.getByText('invalid code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下载错误行 CSV' })).toBeEnabled();
    if (stage === '确认结果') {
      fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
      await screen.findByText('成功 2 条，失败 2 条');
    }
    for (const token of ['demo-operator-peer', 'demo-operator']) {
      act(() => setDemoActor(token));
      expect(screen.getByRole('heading', { name: '选择字典并上传文件' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '生成预演' })).toBeDisabled();
      expect(screen.queryByText('invalid code')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '下载错误行 CSV' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: '导入结果' })).not.toBeInTheDocument();
      expect(screen.queryByText(/已选择 fixture.csv/)).not.toBeInTheDocument();
    }
  });

  it.each([
    ['preview', '生成预演'],
    ['confirm', '确认导入'],
  ])('切换运营身份取消在途 %s，请求迟到时不恢复旧步骤', async (path, action) => {
    server.use(...createDictImportHandlers());
    let release = () => {};
    const resumed = new Promise<void>((resolve) => { release = resolve; });
    const handled = vi.fn();
    server.use(http.post(`*/api/taxonomy/import/${path}`, async () => {
      handled();
      await resumed;
      return HttpResponse.json({ code: 0, data: { status: 'success', added: 2, updated: 0, succeeded: 2, failed: 0 } });
    }, { once: true }));
    const { container } = render(<ImportGuard><Wizard /></ImportGuard>);
    chooseDictionary();
    selectFile(container, makeFile(fixture));
    await screen.findByText(/已选择 fixture.csv/);
    if (path === 'confirm') {
      fireEvent.click(screen.getByRole('button', { name: '生成预演' }));
      await screen.findByRole('heading', { name: '新增明细' });
    }
    const fetchCall = vi.spyOn(globalThis, 'fetch');
    fireEvent.click(screen.getByRole('button', { name: action }));
    try {
      await waitFor(() => expect(handled).toHaveBeenCalledOnce());
      const signal = fetchCall.mock.calls[0][1]!.signal;
      expect(signal?.aborted).toBe(false);
      act(() => setDemoActor('demo-operator-peer'));
      expect(signal?.aborted).toBe(true);
    } finally {
      await act(async () => release());
    }
    expect(screen.getByRole('heading', { name: '选择字典并上传文件' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '预演结果' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '导入结果' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['预演', 'preview', '生成预演', '选择字典并上传文件', '新增明细'],
    ['确认', 'confirm', '确认导入', '预演结果', '导入结果'],
  ])('%s请求真实等待 15 秒后中止，保留当前步骤并可重试', async (stage, path, action, current, next) => {
    server.use(...createDictImportHandlers());
    server.use(http.post(`*/api/taxonomy/import/${path}`, async () => {
      await delay(20000);
      return HttpResponse.error();
    }, { once: true }));
    const { container } = render(<Wizard />);
    chooseDictionary();
    selectFile(container, makeFile(fixture));
    await screen.findByText(/已选择 fixture.csv/);
    if (stage === '确认') {
      fireEvent.click(screen.getByRole('button', { name: '生成预演' }));
      await screen.findByRole('heading', { name: '新增明细' });
    }
    const button = screen.getByRole('button', { name: action });
    const started = performance.now();
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(await screen.findByRole('alert', {}, { timeout: 18000 })).toHaveTextContent('请求超时（15 秒），请重试');
    expect(performance.now() - started).toBeGreaterThanOrEqual(15000);
    expect(screen.getByRole('heading', { name: current })).toBeInTheDocument();
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(await screen.findByRole('heading', { name: next })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  }, 22000);

  it('无可导入行时禁用确认，零错误页隐藏下载', async () => {
    const { container } = render(<Wizard />);
    chooseDictionary();
    selectFile(container, makeFile('[{"code":"demo_locked","name":"示例"}]', 'file.json', 'application/json'));
    await screen.findByText(/已选择 file.json/);
    fireEvent.click(screen.getByRole('button', { name: '生成预演' }));
    expect(await screen.findByRole('button', { name: '确认导入' })).toBeDisabled();
    fireEvent.click(screen.getByText('错误（0）'));
    expect(screen.queryByText('下载错误行 CSV')).toBeNull();
  });
});

describe('预演与确认接口契约', () => {
  it('四种分类均有 11 行时每页 10 行，第 2 页出现第 11 条，切页签重置页码', async () => {
    const existingCodes = Array.from({ length: 11 }, (_, i) => `existing_${i}`);
    const archivedCodes = Array.from({ length: 11 }, (_, i) => `archived_${i}`);
    server.use(...createDictImportHandlers({ existingCodes, archivedCodes }));
    const lines = [
      ...Array.from({ length: 11 }, (_, i) => `new_${i},新增${i}`),
      ...existingCodes.map((code) => `${code},更新`),
      ...archivedCodes.map((code) => `${code},归档`),
      ...Array.from({ length: 11 }, (_, i) => `invalid ${i},错误`),
    ];
    const tenLines = lines.filter((_, index) => index % 11 < 10);
    const ten = await requestPreview(`code,name\n${tenLines.join('\n')}`);
    for (const kind of ['新增', '更新', '冲突', '错误'] as const) expect(ten.groups[kind]).toHaveLength(10);
    render(<Step2Preview preview={ten} busy={false} onBack={() => undefined} onConfirm={() => undefined} />);
    for (const kind of ['新增', '更新', '冲突', '错误']) {
      fireEvent.click(screen.getByText(`${kind}（10）`));
      expect(screen.queryByText('2', { selector: '.t-pagination__number' })).toBeNull();
    }
    cleanup();
    const preview = await requestPreview(`code,name\n${lines.join('\n')}`);
    for (const kind of ['新增', '更新', '冲突', '错误'] as const) expect(preview.groups[kind]).toHaveLength(11);
    render(<Step2Preview preview={preview} busy={false} onBack={() => undefined} onConfirm={() => undefined} />);
    for (const [kind, last] of [['新增', 'new_10'], ['更新', 'existing_10'], ['冲突', 'archived_10'], ['错误', 'invalid 10']]) {
      fireEvent.click(screen.getByText(`${kind}（11）`));
      expect(screen.queryByText(last)).toBeNull();
      fireEvent.click(screen.getByText('2', { selector: '.t-pagination__number' }));
      expect(await screen.findByText(last)).toBeInTheDocument();
    }
  });

  it('生成含 BOM、规定表头及准确行数的 CSV，处理引号和公式前缀', async () => {
    const { groups } = await requestPreview('code,name\n=1,\n"bad code","a""b"');
    const csv = errorCsv(groups.错误);
    expect(csv.split('\r\n')).toEqual([
      '\uFEFF行号,原文,原因',
      `2,"'=1,","${groups.错误[0].reason}"`,
      `3,"""bad code"",""a""""b""","${groups.错误[1].reason}"`,
      '',
    ]);
  });

  it('并发重复确认幂等，其他旧预演无效，下一次预演可见已导入条目', async () => {
    server.use(...createDictImportHandlers());
    const source = '[{"code":"test_idempotent","name":"星环示例"}]';
    const first = await requestPreview(source, 'json');
    const stale = await requestPreview(source, 'json');
    const result = { status: 'success', added: 1, updated: 0, succeeded: 1, failed: 0 };
    expect(await Promise.all([confirm(first.previewId), confirm(first.previewId)])).toEqual([result, result]);
    await expect(confirm(stale.previewId)).rejects.toThrow('字典已变更');
    expect((await requestPreview(source, 'json')).groups.更新).toHaveLength(1);
    await expect(confirm('unknown')).rejects.toThrow('预演不存在');
  });

  it('取消后的延迟确认不会写入；重试后旧预演交错返回 409', async () => {
    server.use(...createDictImportHandlers({ confirmDelayMs: (call) => call === 1 ? 200 : 0 }));
    const source = '[{"code":"race_entry","name":"虚构条目"}]';
    const first = await requestPreview(source, 'json');
    const stale = await requestPreview(source, 'json');
    const controller = new AbortController();
    const abandoned = confirmWithSignal(first.previewId, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 30));
    controller.abort();
    await expect(abandoned).rejects.toThrow();
    const result = await confirm(first.previewId);
    expect(result).toMatchObject({ succeeded: 1, added: 1 });
    await new Promise((resolve) => setTimeout(resolve, 240));
    expect(await confirm(first.previewId)).toEqual(result);
    await expect(confirm(stale.previewId)).rejects.toThrow('字典已变更');
    expect((await requestPreview(source, 'json')).groups.更新).toHaveLength(1);
  });

  it('服务端迟到成功与客户端超时交错后同一预演重试取回原结果，不会写两次', async () => {
    server.use(...createDictImportHandlers({ confirmDelayMs: (call) => call === 1 ? 160 : 0 }));
    const source = '[{"code":"late_entry","name":"虚构条目"}]';
    const preview = await requestPreview(source, 'json');
    // The first server commit is detached from the timed-out transport, like a remote DB commit.
    const lateCommit = confirm(preview.previewId);
    const controller = new AbortController();
    const interrupted = confirmWithSignal(preview.previewId, controller.signal);
    controller.abort();
    await expect(interrupted).rejects.toThrow();
    const firstResult = await lateCommit;
    expect(await confirm(preview.previewId)).toEqual(firstResult);
    const after = await requestPreview(source, 'json');
    expect(after.groups.更新).toHaveLength(1);
    await expect(confirm(after.previewId)).resolves.toMatchObject({ added: 0, updated: 1 });
  });

  it('整体失败保留预演且不写入字典', async () => {
    server.use(...createDictImportHandlers({ failConfirm: true }));
    const preview = await requestPreview();
    await expect(confirm(preview.previewId)).rejects.toThrow('模拟导入服务暂不可用');
    expect((await requestPreview()).groups.新增).toHaveLength(1);
  });

  it('匿名、只读及跨组织站点无法预演或确认他人会话；缓存结果也不可见', async () => {
    server.use(...createDictImportHandlers());
    setDemoActor(null);
    await expect(requestPreview()).rejects.toThrow('请先登录');
    setDemoActor('demo-viewer');
    await expect(requestPreview()).rejects.toThrow('没有字典导入权限');
    setDemoActor('demo-other-org');
    await expect(requestPreview()).rejects.toThrow('不可访问该组织或站点');
    setDemoActor('demo-other-site');
    await expect(requestPreview()).rejects.toThrow('不可访问该组织或站点');
    setDemoActor('demo-operator');
    const preview = await requestPreview();
    setDemoActor('demo-operator-peer');
    await expect(confirm(preview.previewId)).rejects.toThrow('预演不属于当前身份');
    setDemoActor(null);
    await expect(confirm(preview.previewId)).rejects.toThrow('请先登录');
    setDemoActor('demo-viewer');
    await expect(confirm(preview.previewId)).rejects.toThrow('没有字典导入权限');
    setDemoActor('demo-other-org');
    await expect(confirm(preview.previewId)).rejects.toThrow('预演不属于当前身份');
    setDemoActor('demo-other-site');
    await expect(confirm(preview.previewId)).rejects.toThrow('预演不属于当前身份');
    setDemoActor('demo-operator');
    const result = await confirm(preview.previewId);
    setDemoActor('demo-other-org');
    await expect(confirm(preview.previewId)).rejects.toThrow('预演不属于当前身份');
    setDemoActor('demo-operator');
    expect(await confirm(preview.previewId)).toEqual(result);
  });

  it('目标字典已删除或跨组织站点时拒绝预演；确认前字典失效也拒绝', async () => {
    server.use(...createDictImportHandlers({ dictionaryScope: { industry: { orgId: 'org-demo-001', siteId: 'site-demo-001', deleted: true } } }));
    await expect(requestPreview()).rejects.toThrow('目标字典已删除');
    server.use(...createDictImportHandlers({ dictionaryScope: { industry: { orgId: 'org-demo-002', siteId: 'site-demo-001' } } }));
    await expect(requestPreview()).rejects.toThrow('不可访问该组织或站点');
    server.use(...createDictImportHandlers({ dictionaryScope: { industry: { orgId: 'org-demo-001', siteId: 'site-demo-002' } } }));
    await expect(requestPreview()).rejects.toThrow('不可访问该组织或站点');
  });

  it('预演后目标字典被删除或移动到其他站点时确认被拒并保持未写入', async () => {
    const scope = { orgId: 'org-demo-001', siteId: 'site-demo-001', deleted: false };
    server.use(...createDictImportHandlers({ dictionaryScope: { industry: scope } }));
    const preview = await requestPreview();
    scope.deleted = true;
    await expect(confirm(preview.previewId)).rejects.toThrow('目标字典已删除');
    scope.deleted = false;
    scope.siteId = 'site-demo-002';
    await expect(confirm(preview.previewId)).rejects.toThrow('不可访问该组织或站点');
    scope.siteId = 'site-demo-001';
    expect((await requestPreview()).groups.新增).toHaveLength(1);
  });

  it('接近 2MB 的错误文件全量导出且大批确认，超限由服务拒绝', async () => {
    server.use(...createDictImportHandlers());
    const errors = Array.from({ length: 1400 }, (_, i) => `bad ${i},${'错'.repeat(400)}`);
    const source = `code,name\nbulk_ok,有效\n${errors.join('\n')}`;
    const size = new TextEncoder().encode(source).length;
    expect(size).toBeGreaterThan(MAX_IMPORT_BYTES - 500000);
    expect(size).toBeLessThanOrEqual(MAX_IMPORT_BYTES);
    const preview = await requestPreview(source);
    expect(preview.groups.错误).toHaveLength(1400);
    const csv = errorCsv(preview.groups.错误);
    expect(csv.startsWith('\uFEFF行号,原文,原因\r\n')).toBe(true);
    expect(csv.match(/\r\n/g)).toHaveLength(1401);
    expect(csv).toContain('1402,');
    const result = await confirm(preview.previewId);
    expect(result).toMatchObject({ succeeded: 1, failed: 1400 });
    expect(await confirm(preview.previewId)).toEqual(result);
    await expect(requestPreview(source + 'x'.repeat(MAX_IMPORT_BYTES - size + 1))).rejects.toThrow('不能超过 2 MB');
    const batch = `code,name\n${Array.from({ length: 11000 }, (_, i) => `bulk_${i},${'名'.repeat(48)}`).join('\n')}`;
    expect(new TextEncoder().encode(batch).length).toBeLessThanOrEqual(MAX_IMPORT_BYTES);
    const large = await requestPreview(batch);
    expect(large.groups.新增).toHaveLength(11000);
    expect(await confirm(large.previewId)).toMatchObject({ succeeded: 11000, failed: 0 });
  }, 30000);

  it('拒绝无效 JSON、CSV 列错位和错误字典参数', async () => {
    expect(() => parseImport('json', '{')).toThrow('JSON 格式');
    expect(() => parseImport('json', '{}')).toThrow('必须是数组');
    expect(() => parseImport('csv', 'wrong,name\none,two')).toThrow('CSV 表头');
    expect(() => parseImport('csv', 'code,name\n"bad,one')).toThrow('引号');
    expect((await requestPreview('code,name\none,two,three')).groups.错误).toHaveLength(1);
    await expect(apiPost('/taxonomy/import/preview', { dictionaryId: 'missing' })).rejects.toThrow('字典、格式或文件内容');
  });
});
