import { useLayoutEffect, useRef, useState } from 'react';
import { Alert, Card, Steps } from 'tdesign-react';
import { apiPost } from '../../api/client';
import { CONFIRM_PATH, PREVIEW_PATH, parseImport, readFile, validateFile, isImportResult } from '../../lib/dictImport';
import type { ImportResult, Preview, PreviewInput } from '../../lib/dictImport';
import Step1Upload from './Step1Upload';
import Step2Preview from './Step2Preview';
import Step3Result from './Step3Result';

export default function DictImportWizard() {
  const [dictionaryId, setDictionaryId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview>();
  const [result, setResult] = useState<ImportResult>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const step = result ? 2 : preview ? 1 : 0;

  useLayoutEffect(() => () => {
    const request = pending.current;
    pending.current = null;
    request?.abort();
  }, []);

  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return;
    const request = new AbortController();
    pending.current = request;
    setBusy(true);
    setError('');
    const timeout = setTimeout(() => request.abort(), 15000);
    try {
      await operation(request.signal);
    } catch (cause) {
      if (pending.current === request) {
        setError(request.signal.aborted ? '请求超时（15 秒），请重试'
          : cause instanceof Error ? cause.message : '操作失败，请重试');
      }
    } finally {
      clearTimeout(timeout);
      if (pending.current === request) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  function reset() {
    setDictionaryId('');
    setFile(null);
    setPreview(undefined);
    setResult(undefined);
    setError('');
  }

  return (
    <Card>
      <h1>字典导入向导</h1>
      <Steps current={step} options={[{ title: '上传文件' }, { title: '预演结果' }, { title: '导入结果' }]} />
      {error && <div role="alert" style={{ marginTop: 20 }}><Alert theme="error" message={error} /></div>}
      {result ? <Step3Result result={result} onReset={reset} /> : preview ? (
        <Step2Preview preview={preview} busy={busy} onBack={() => { setError(''); setPreview(undefined); }}
          onConfirm={() => void run(async (signal) => {
            const data = await apiPost<{ previewId: string }, unknown>(CONFIRM_PATH, { previewId: preview.previewId }, signal);
            signal.throwIfAborted();
            if (!isImportResult(data)) throw new Error('导入确认响应格式不正确，请重试');
            setResult(data);
          })} />
      ) : (
        <Step1Upload dictionaryId={dictionaryId} onDictionary={setDictionaryId} file={file} busy={busy}
          onFile={(next) => { setError(''); setFile(next); }} onError={setError} onPreview={() => {
            if (!file || !dictionaryId) return;
            void run(async (signal) => {
              const format = validateFile(file);
              const content = await readFile(file);
              signal.throwIfAborted();
              parseImport(format, content);
              const data = await apiPost<PreviewInput, Preview>(PREVIEW_PATH, { dictionaryId, format, content }, signal);
              signal.throwIfAborted();
              setPreview(data);
            });
          }} />
      )}
    </Card>
  );
}
