import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import Wizard from './index';
import { errorCsv, MAX_IMPORT_BYTES, parseImport, validateFile } from '../../lib/dictImport';
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
    expect(screen.getByRole('link', { name: '下载 CSV 模板' })).toHaveAttribute('download', 'dict_import_template.csv');
    expect(screen.getByRole('link', { name: '下载 JSON 模板' })).toHaveAttribute('href', '/templates/dict_import_template.json');
    expect(parseImport('csv', csvTemplate)).toHaveLength(2);
    expect(parseImport('json', jsonTemplate)).toHaveLength(2);
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

  it('整体失败保留预演且不写入字典', async () => {
    server.use(...createDictImportHandlers({ failConfirm: true }));
    const preview = await requestPreview();
    await expect(confirm(preview.previewId)).rejects.toThrow('模拟导入服务暂不可用');
    expect((await requestPreview()).groups.新增).toHaveLength(1);
  });

  it('拒绝无效 JSON、CSV 列错位和错误字典参数', async () => {
    expect(() => parseImport('json', '{')).toThrow('JSON 格式');
    expect(() => parseImport('json', '{}')).toThrow('必须是数组');
    expect(() => parseImport('csv', 'wrong,name\none,two')).toThrow('CSV 表头');
    expect(() => parseImport('csv', 'code,name\n"bad,one')).toThrow('引号');
    expect((await requestPreview('code,name\none,two,three')).groups.错误).toHaveLength(1);
    await expect(apiPost('/taxonomy/import/preview', { dictionaryId: 'missing' })).rejects.toThrow('字典、格式或文件内容');
  });
});
