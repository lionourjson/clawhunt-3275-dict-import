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

在 Vite 输出的地址打开 `/admin/taxonomy/import`。独立演示默认匿名且拒绝访问：在同源浏览器控制台执行 `sessionStorage.setItem('dict-import-demo-actor', 'demo-operator'); location.reload()` 后可使用虚构运营身份。公开演示令牌不是凭证，不可用于生产鉴权。截图脚本通过 `playwright-core` 使用本地 Chrome 或 Edge，可通过环境变量 `CHROME_PATH` 指定浏览器、`SHOTS_PORT` 指定预览端口。七张截图写入 `docs/screenshots/`；脚本等待蓝色指示条的两端与选中页签对齐后截图，并验证两种模板和错误 CSV 的浏览器下载、模板 404 提示及当前流程的站外请求。

| 验证目标 | 位置 |
| --- | --- |
| 路由、上传步、文件校验 | `src/App.test.tsx`、`src/pages/DictImportWizard/wizard.test.tsx` |
| 分类页签、下载、确认结果 | `src/pages/DictImportWizard/wizard.test.tsx` |
| 匿名/跨组织站点/他人预演、字典删除、客户端取消与迟到成功、并发幂等 | `src/App.test.tsx`、`src/pages/DictImportWizard/wizard.test.tsx` |
| 四页签 10/11 行分页、近 2 MB 错误 CSV 与大批量确认、静态模板 404 与下载异常 | `src/pages/DictImportWizard/wizard.test.tsx` |
| 上传、预演总览、四个页签、导入结果 | `docs/screenshots/`、`scripts/shots.mjs` |

## 文件格式和预演规则

- 上限为 2 × 1,024 × 1,024 字节。支持 UTF-8，允许 BOM。CSV 需要 `code,name` 两列，支持引号、双引号转义和多行字段。JSON 顶层是对象数组，每个对象包含字符串 `code`、`name`。页面提供两种模板。
- 同一份有效文件中重复的编码和已归档编码进入「冲突」。不合规编码、空名称和字段数量错误进入「错误」。其他编码按目标字典中是否存在进入「更新」或「新增」。确认只应用新增及更新。
- 错误行 CSV 的列为行号、原文、原因。CSV 行号为记录起始物理行，JSON 行号为数组中的一基序号。JSON 对象原文以 JSON 序列化形式导出，可能触发表格公式的值加单引号。
- 默认示例中 `demo_current` 会被更新，`demo_locked` 为冲突。`?mock=error` 会令确认接口返回模拟故障，可返回上传或再次确认。`?mock=slow` 启用可配置的响应延迟。刷新页面会重置模拟状态。

## 接入 S2-WB

`src/App.tsx` 已将 `/admin/taxonomy/import` 包入 `src/auth/ImportGuard.tsx`：匿名和只读身份拒绝访问。`src/auth/demoAuth.ts` 是独立演示身份桩，内置虚构 operator/viewer/跨组织/跨站点身份；`src/api/client.ts` 仅对两条导入接口传 `X-Demo-Actor`。MSW 自行识别身份、角色、字典组织与站点、删除状态、预演所属人及确认时字典修订。**公开 demo token 可被伪造，不能当作生产凭证或完整权限防线。** S2-WB 集成时用宿主的会话与路由守卫替换 `src/auth/`，服务端必须从真实认证上下文校验身份与组织站点，不接受客户端提交的组织字段或 demo token；并将模板静态资源放在 `/templates/`。模拟服务由 `src/main.tsx` 启动，接入真实服务时移除该启动步骤并通过 `VITE_API_BASE_URL` 配置接口基地址，默认 `/api`。`VITE_MOCK_SLOW_DELAY_MS` 配置模拟延迟。

所有响应使用 `{ code, data, message? }` 信封，成功时 `code` 为 `0`，错误时返回对应 HTTP 状态和 `message`。预演和确认请求均在 15 秒后停止等待。超时显示提示、保留当前步骤并允许重试；确认重试沿用同一个预演 ID，服务端须以此实现幂等，不能将客户端取消等同于未提交。mock 延迟后检查取消信号，按会话缓存结果处理迟到提交或重复确认。向导按调用者、组织和站点重置界面，卸载时取消尚未结束的预演和确认；切换身份后从上传步骤开始。`wizard.test.tsx` 对两次客户端超时做真实 15 秒等待，另测试换人取消请求、旧数据清理和独立迟到提交的交错。确认成功响应须含已知状态以及一致的非负整数计数，格式错误保留预演并提示重试。模板文件通过同源 fetch 下载，下载前逐行验证编码和非空名称；404、坏内容或同步下载异常显示错误；错误行导出同步异常会提示重试。浏览器下载管理器在 click 成功后的异步磁盘故障不能由页面探测。

| 接口 | 请求体 | 成功响应的 data |
| --- | --- | --- |
| `POST /taxonomy/import/preview` | `dictionaryId`、`format` 为 `csv` 或 `json`、`content` 为 UTF-8 解码文本 | `previewId`、演示会话的 `ownerId`、`orgId`、`siteId`、`groups` 以新增、更新、冲突、错误为键。行字段为 `line`、`raw`、`code`、`name`、`reason` |
| `POST /taxonomy/import/confirm` | `previewId` | `status` 为 `success` 或 `partial`，及 `added`、`updated`、`succeeded`、`failed` |

真实服务必须以事务处理确认，并用真实调用者身份、组织及站点鉴权，持久化预演所有权和幂等结果，避免迟到提交与重试重复写入。当前仅 MSW 模拟字典修订、删除状态、身份所有权、旧预演 409、同一预演重复确认返回原结果及写入前 503；无真实后端和生产级事务。页面示例数据均为虚构。向导无金额字段，模板框架的会员金额字段以整数分计。应用源码里的 fetch 仅调用环境配置的 API 和同源模板；`scripts/shots.mjs` 检查截图流程的站外请求，依赖间接行为与其他部署环境未做无外送的全量证明。
