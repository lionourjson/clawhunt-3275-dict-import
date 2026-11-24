/** 配置全部从环境变量读取；没有 .env 时使用安全默认值。 */
export const config = {
  /** 后端 API 基地址：真实环境通过 VITE_API_BASE_URL 注入；模板默认走本机 MSW mock */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, ''),
  enableMock: import.meta.env.VITE_ENABLE_MOCK !== 'false',
  /** 慢响应演示时长（毫秒），mock=slow 场景使用 */
  slowDelayMs: Number(import.meta.env.VITE_MOCK_SLOW_DELAY_MS ?? 3000),
} as const;
