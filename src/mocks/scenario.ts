/**
 * Mock 场景：通过 URL 查询参数 ?mock=success|empty|error|slow 切换，
 * 方便演示三态（空态/加载/报错）以及截图脚本逐状态截图。
 * 默认 success。配置从环境变量读取（慢响应时长见 src/config.ts）。
 */
export type MockScenario = 'success' | 'empty' | 'error' | 'slow';

export function resolveScenario(search: string = window.location.search): MockScenario {
  const raw = new URLSearchParams(search).get('mock');
  if (raw === 'empty' || raw === 'error' || raw === 'slow') return raw;
  return 'success';
}
