# S2-TAX-017 · 字典导入向导

运营人员在 `/admin/taxonomy/import` 选择字典和 CSV 或 JSON，检查预演分类，然后确认导入。页面使用 React、TypeScript、TDesign 和 MSW，可独立启动。

## 运行与验证

```bash
npm ci
npm run dev
npm test
npm run build
npm run shots
```

在 Vite 输出的地址打开 `/admin/taxonomy/import`。截图脚本通过 `playwright-core` 使用本地 Chrome 或 Edge，可通过环境变量 `CHROME_PATH` 指定浏览器、`SHOTS_PORT` 指定预览端口。七张截图写入 `docs/screenshots/`，脚本还会检查浏览器下载的错误 CSV 的文件名、BOM、表头和首行行号。

| 验证目标 | 位置 |
| --- | --- |
| 路由、上传步、文件校验 | `src/App.test.tsx`、`src/pages/DictImportWizard/wizard.test.tsx` |
| 分类页签、下载、确认结果 | `src/pages/DictImportWizard/wizard.test.tsx` |
| 确认失败、旧预演、并发幂等 | `src/pages/DictImportWizard/wizard.test.tsx` |
| 上传、预演总览、四个页签、导入结果 | `docs/screenshots/`、`scripts/shots.mjs` |

## 文件格式和预演规则

- 上限为 2 × 1,024 × 1,024 字节。支持 UTF-8，允许 BOM。CSV 需要 `code,name` 两列，支持引号、双引号转义和多行字段。JSON 顶层是对象数组，每个对象包含字符串 `code`、`name`。页面提供两种模板。
- 同一份有效文件中重复的编码和已归档编码进入「冲突」。不合规编码、空名称和字段数量错误进入「错误」。其他编码按目标字典中是否存在进入「更新」或「新增」。确认只应用新增及更新。
- 错误行 CSV 的列为行号、原文、原因。CSV 行号为记录起始物理行，JSON 行号为数组中的一基序号。JSON 对象原文以 JSON 序列化形式导出，可能触发表格公式的值加单引号。
- 默认示例中 `demo_current` 会被更新，`demo_locked` 为冲突。`?mock=error` 会令确认接口返回模拟故障，可返回上传或再次确认。`?mock=slow` 启用可配置的响应延迟。刷新页面会重置模拟状态。

## 接入 S2-WB

用 `src/pages/DictImportWizard/index.tsx` 注册 `/admin/taxonomy/import`，保留工作台鉴权和路由守卫。将模板静态资源放在 `/templates/`。模拟服务由 `src/main.tsx` 启动，接入真实服务时移除该启动步骤并通过 `VITE_API_BASE_URL` 配置接口基地址，默认 `/api`。`VITE_MOCK_SLOW_DELAY_MS` 配置模拟延迟。

所有响应使用 `{ code, data, message? }` 信封，成功时 `code` 为 `0`，错误时返回对应 HTTP 状态和 `message`。客户端在 15 秒后停止等待。

| 接口 | 请求体 | 成功响应的 data |
| --- | --- | --- |
| `POST /taxonomy/import/preview` | `dictionaryId`、`format` 为 `csv` 或 `json`、`content` 为 UTF-8 解码文本 | `previewId`、`groups` 以新增、更新、冲突、错误为键。行字段为 `line`、`raw`、`code`、`name`、`reason` |
| `POST /taxonomy/import/confirm` | `previewId` | `status` 为 `success` 或 `partial`，及 `added`、`updated`、`succeeded`、`failed` |

真实服务需校验登录身份、组织及站点导入权限，并以事务处理确认。MSW 按字典模拟修订版本，旧版本预演返回 409，同一预演重复确认返回原结果，模拟故障发生在数据修改之前。模拟字典和模板使用虚构数据。向导无金额字段。模板框架的会员金额字段以整数分计。
