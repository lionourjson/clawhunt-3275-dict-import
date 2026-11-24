import '@testing-library/jest-dom/vitest';
import { setupServer } from 'msw/node';
import { createHandlers } from './mocks/handlers';
import { afterAll, afterEach, beforeAll } from 'vitest';

// jsdom 缺失 matchMedia / ResizeObserver / HTMLCanvasElement.getContext，TDesign 依赖它们
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

// jsdom 没有实现 URL.createObjectURL（TDesign MessagePlugin 用到）
if (typeof window !== 'undefined' && !window.URL.createObjectURL) {
  window.URL.createObjectURL = () => 'blob:mock';
  window.URL.revokeObjectURL = () => undefined;
}

/**
 * Vitest 用 MSW node 拦截 fetch：默认 success 场景。
 * 需要空态/报错时在测试里用 server.use(...createHandlers({ scenario: 'empty' })) 覆盖。
 */
export const server = setupServer(...createHandlers({ scenario: 'success' }));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
