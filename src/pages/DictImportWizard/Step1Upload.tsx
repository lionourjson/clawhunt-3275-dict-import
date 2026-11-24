import { useState } from 'react';
import { Button, Select, Space, Upload } from 'tdesign-react';
import { dictionaries, downloadTemplate, MAX_IMPORT_BYTES, validateFile } from '../../lib/dictImport';

interface Props {
  dictionaryId: string;
  onDictionary: (id: string) => void;
  onFile: (file: File | null) => void;
  onError: (message: string) => void;
  file: File | null;
  busy: boolean;
  onPreview: () => void;
}

export default function Step1Upload({ dictionaryId, onDictionary, onFile, onError, file, busy, onPreview }: Props) {
  const [downloading, setDownloading] = useState(false);
  async function getTemplate(format: 'csv' | 'json') {
    if (downloading) return;
    setDownloading(true);
    onError('');
    try { await downloadTemplate(format); }
    catch (cause) { onError(cause instanceof Error ? cause.message : '模板下载失败，请重试'); }
    finally { setDownloading(false); }
  }
  return (
    <section>
      <h2>选择字典并上传文件</h2>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <p id="dict-label">导入目标</p>
          <Select aria-labelledby="dict-label" value={dictionaryId} options={dictionaries} disabled={busy}
            placeholder="请选择字典" onChange={(value) => onDictionary(String(value))} style={{ maxWidth: 320 }} />
        </div>
        <div>
          <p id="file-guidance">支持 UTF-8 CSV 或 JSON，文件上限 {MAX_IMPORT_BYTES / 1024 / 1024} MB。</p>
          <Upload theme="custom" accept=".csv,.json" disabled={busy} autoUpload={false} files={[]}
            beforeUpload={(candidate) => {
              try {
                if (!candidate.raw) throw new Error('未读取到文件，请重新选择');
                validateFile(candidate.raw);
                onFile(candidate.raw);
              } catch (error) {
                onFile(null);
                onError((error as Error).message);
              }
              return false;
            }}>
            <Button variant="outline" disabled={busy}>选择导入文件</Button>
          </Upload>
          {file && <p aria-live="polite">已选择 {file.name}（{file.size.toLocaleString()} 字节）</p>}
        </div>
        <Space style={{ flexWrap: 'wrap' }}>
          <Button variant="text" disabled={downloading} onClick={() => void getTemplate('csv')}>下载 CSV 模板</Button>
          <Button variant="text" disabled={downloading} onClick={() => void getTemplate('json')}>下载 JSON 模板</Button>
        </Space>
        <Button tag="button" loading={busy} disabled={!file || !dictionaryId || busy} onClick={onPreview}>生成预演</Button>
      </Space>
    </section>
  );
}
