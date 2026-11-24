import { useRef, useState } from 'react';
import { Alert, Card, Steps } from 'tdesign-react';
import { apiPost } from '../../api/client';
import { CONFIRM_PATH, PREVIEW_PATH, parseImport, readFile, validateFile } from '../../lib/dictImport';
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
  const pending = useRef(false);
  const step = result ? 2 : preview ? 1 : 0;

  async function run(operation: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请重试'); }
    finally {
      pending.current = false;
      setBusy(false);
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
          onConfirm={() => void run(async () => {
            setResult(await apiPost<{ previewId: string }, ImportResult>(CONFIRM_PATH, { previewId: preview.previewId }, AbortSignal.timeout(15000)));
          })} />
      ) : (
        <Step1Upload dictionaryId={dictionaryId} onDictionary={setDictionaryId} file={file} busy={busy}
          onFile={(next) => { setError(''); setFile(next); }} onError={setError} onPreview={() => {
            if (!file || !dictionaryId) return;
            void run(async () => {
              const format = validateFile(file);
              const content = await readFile(file);
              parseImport(format, content);
              setPreview(await apiPost<PreviewInput, Preview>(PREVIEW_PATH, { dictionaryId, format, content }, AbortSignal.timeout(15000)));
            });
          }} />
      )}
    </Card>
  );
}
