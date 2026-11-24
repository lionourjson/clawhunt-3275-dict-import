import { setupWorker } from 'msw/browser';
import { createHandlers } from './handlers';
import { resolveScenario } from './scenario';
import { config } from '../config';

/**
 * 浏览器端 MSW worker。场景按 URL ?mock=success|empty|error|slow 解析，
 * 因此同一路由无需改代码即可展示/截图三态（空/加载/报错）。
 */
export const worker = setupWorker(
  ...createHandlers({ scenario: resolveScenario(), slowDelayMs: config.slowDelayMs }),
);

export async function enableMocking() {
  if (!config.enableMock) return;
  return worker.start({ onUnhandledRequest: 'bypass', quiet: true });
}
