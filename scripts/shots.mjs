import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'docs/screenshots');
const port = process.env.SHOTS_PORT || '5217';
const base = `http://127.0.0.1:${port}`;
const browserPath = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);

if (!browserPath) throw new Error('未找到 Chrome，请设置 CHROME_PATH');
if (!existsSync(path.join(root, 'dist/index.html'))) throw new Error('请先运行 npm run build');
mkdirSync(output, { recursive: true });

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  cwd: root, stdio: 'inherit',
});
let browser;
try {
  for (let attempt = 0; ; attempt += 1) {
    if (server.exitCode !== null || attempt === 100) throw new Error('预览服务启动失败');
    if (await fetch(base).then((response) => response.ok).catch(() => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  browser = await chromium.launch({ executablePath: browserPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await page.addInitScript(() => sessionStorage.setItem('dict-import-demo-actor', 'demo-operator'));
  const external = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(base) && !request.url().startsWith('blob:')) external.push(request.url());
  });
  const shot = async (file, marker) => {
    await page.waitForSelector(`text=${marker}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(output, file), animations: 'disabled' });
    console.log(`[shots] ${file} ${marker}`);
  };
  await page.goto(`${base}/admin/taxonomy/import`);
  // Intercept browser fetch before MSW's service worker, which handles network before Playwright routing.
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    window.fetch = ((input, init) => {
      if (String(input).includes('dict_import_template.csv')) return Promise.resolve(new Response('', { status: 404 }));
      return original(input, init);
    });
  });
  await page.getByRole('button', { name: '下载 CSV 模板' }).click();
  await page.getByText('模板下载失败：HTTP 404，请稍后重试').waitFor();
  await page.reload();
  await page.getByRole('heading', { name: '字典导入向导' }).waitFor();
  console.log('[shots] 静态模板 404 显示失败提示');
  for (const [format, name] of [['CSV', 'dict_import_template.csv'], ['JSON', 'dict_import_template.json']]) {
    const pendingDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: `下载 ${format} 模板` }).click();
    const template = await pendingDownload;
    assert.equal(template.suggestedFilename(), name);
    assert.equal(readFileSync(await template.path(), 'utf8').trim(), readFileSync(path.join(root, 'public/templates', name), 'utf8').trim());
    console.log(`[shots] 浏览器已核对 ${format} 模板下载`);
  }
  await page.getByPlaceholder('请选择字典').click();
  await page.getByText('行业字典', { exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'example.csv', mimeType: 'text/csv',
    buffer: Buffer.from('code,name\ndemo_new,环轨材料\ndemo_current,星环新分类\ndemo_locked,示例档案\ninvalid code,错误示例'),
  });
  await shot('01-upload.png', '已选择 example.csv');
  await page.getByRole('button', { name: '生成预演' }).click();
  await page.waitForSelector('text=新增明细');
  await page.locator('section').filter({ has: page.getByRole('heading', { name: '预演结果', exact: true }) })
    .screenshot({ path: path.join(output, '02-preview.png'), animations: 'disabled' });
  console.log('[shots] 02-preview.png 预演分类及导入规则');
  for (const [kind, file] of [['新增', 'new'], ['更新', 'update'], ['冲突', 'conflict'], ['错误', 'error']]) {
    await page.getByText(`${kind}（1）`, { exact: true }).click();
    if (kind === '错误') await page.waitForSelector('text=下载错误行 CSV');
    await shot(`02-${file}.png`, `${kind}明细`);
  }
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载错误行 CSV' }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'dict_import_errors.csv');
  assert.match(readFileSync(await download.path(), 'utf8'), /^\uFEFF行号,原文,原因\r\n5,/);
  console.log('[shots] 已核对浏览器下载的错误行 CSV');
  await page.getByRole('button', { name: '确认导入' }).click();
  await shot('03-result.png', '成功 2 条，失败 2 条');
  assert.deepEqual(external, []);
  console.log('[shots] 此浏览器流程无站外请求');
} finally {
  await browser?.close();
  server.kill();
}
