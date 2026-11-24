export const PREVIEW_PATH = '/taxonomy/import/preview';
export const CONFIRM_PATH = '/taxonomy/import/confirm';
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const dictionaries = [
  { value: 'industry', label: '行业字典' },
  { value: 'service', label: '服务字典' },
  { value: 'resource', label: '资源字典' },
];
export const kinds = ['新增', '更新', '冲突', '错误'] as const;
export type Kind = typeof kinds[number];
export type ImportFormat = 'csv' | 'json';
export interface Entry { code: string; name: string }
interface ParsedRow { line: number; raw: string; value: unknown }
export interface PreviewRow { line: number; raw: string; code: string; name: string; reason: string }
export interface Preview { previewId: string; ownerId: string; orgId: string; siteId: string; groups: Record<Kind, PreviewRow[]> }
export interface ImportResult { status: 'success' | 'partial'; added: number; updated: number; succeeded: number; failed: number }
export interface PreviewInput { dictionaryId: string; format: ImportFormat; content: string }

const acceptedMime: Record<ImportFormat, string[]> = {
  csv: ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'],
  json: ['application/json', 'text/json', 'text/plain'],
};

export function validateFile(file: File): ImportFormat {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('文件不能超过 2 MB');
  if (!file.size) throw new Error('文件为空，请上传包含数据的文件');
  const format = file.name.split('.').pop()?.toLowerCase();
  if (!file.name.includes('.') || (format !== 'csv' && format !== 'json')) {
    throw new Error('仅支持 .csv 或 .json 文件');
  }
  if (file.type && file.type !== 'application/octet-stream' && !acceptedMime[format].includes(file.type)) {
    throw new Error('文件 MIME 类型与扩展名不符');
  }
  return format;
}

export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败，请重新选择'));
    reader.onload = () => {
      try {
        const content = new TextDecoder('utf-8', { fatal: true }).decode(reader.result as ArrayBuffer);
        if (content.includes('\0')) throw new Error();
        resolve(content);
      } catch {
        reject(new Error('仅支持 UTF-8 编码，请将 GBK 等编码转换为 UTF-8'));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// CSV records may span physical lines. Keep the exact input text for the error export.
function csvRecords(content: string) {
  const field = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r\n|\r|\n|$)/y;
  const records: { line: number; raw: string; values: string[] }[] = [];
  let line = 1;
  let offset = 0;
  while (offset < content.length) {
    const start = offset;
    const firstLine = line;
    const values: string[] = [];
    let delimiter: string;
    do {
      field.lastIndex = offset;
      const match = field.exec(content);
      if (!match) throw new Error(`CSV 第 ${line} 行引号或分隔符格式不正确`);
      values.push(match[1]?.replace(/""/g, '"') ?? match[2]);
      line += (match[0].match(/\r\n|\r|\n/g) ?? []).length;
      offset = field.lastIndex;
      delimiter = match[3];
    } while (delimiter === ',');
    const raw = content.slice(start, offset - delimiter.length);
    if (raw.trim()) records.push({ line: firstLine, raw, values });
  }
  return records;
}

export function parseImport(format: ImportFormat, source: string): ParsedRow[] {
  const content = source.replace(/^\uFEFF/, '');
  if (!content.trim()) throw new Error('文件为空，请上传包含数据的文件');
  if (format === 'json') {
    let data: unknown;
    try { data = JSON.parse(content); }
    catch { throw new Error('JSON 格式不正确，请检查括号和引号'); }
    if (!Array.isArray(data)) throw new Error('JSON 顶层必须是数组');
    if (!data.length) throw new Error('文件没有数据行');
    return data.map((value, index) => ({ line: index + 1, raw: JSON.stringify(value), value }));
  }
  const [header, ...rows] = csvRecords(content);
  const columns = header?.values.map((value) => value.trim());
  if (columns?.length !== 2 || !columns.includes('code') || !columns.includes('name')) {
    throw new Error('CSV 表头必须包含 code 和 name 两列');
  }
  if (!rows.length) throw new Error('CSV 只有表头，没有数据行');
  const codeIndex = columns.indexOf('code');
  const nameIndex = columns.indexOf('name');
  return rows.map(({ line, raw, values }) => ({
    line, raw, value: values.length === 2 ? { code: values[codeIndex], name: values[nameIndex] } : null,
  }));
}

function quoteCsv(value: string) {
  const safe = /^[\s\uFEFF]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|^[\t\r\n]/u.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function errorCsv(rows: PreviewRow[]) {
  return '\uFEFF行号,原文,原因\r\n' + rows.map(({ line, raw, reason }) => (
    [line, quoteCsv(raw), quoteCsv(reason)].join(',')
  )).join('\r\n') + '\r\n';
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
  } finally {
    // Keep the object URL alive long enough for the browser download to start.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

export function downloadErrors(rows: PreviewRow[]) {
  downloadBlob(new Blob([errorCsv(rows)], { type: 'text/csv;charset=utf-8' }), 'dict_import_errors.csv');
}

export async function downloadTemplate(format: ImportFormat) {
  const name = `dict_import_template.${format}`;
  const response = await fetch(new URL(`/templates/${name}`, window.location.href), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`模板下载失败：HTTP ${response.status}，请稍后重试`);
  const text = await response.text();
  const rows = parseImport(format, text);
  if (!rows.length) throw new Error('模板文件没有数据，请稍后重试');
  downloadBlob(new Blob([text], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' }), name);
}
