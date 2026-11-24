/** 统一 API 客户端：基地址从环境变量读取；超时与错误处理集中在这里。 */
import { config } from '../config';

export interface ApiEnvelope<T> {
  code: number;
  message?: string;
  data: T;
}

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${config.apiBaseUrl}${path}`, { signal });
  if (!res.ok) {
    throw new ApiError(`接口异常：HTTP ${res.status}`);
  }
  const body = (await res.json()) as ApiEnvelope<T>;
  if (body.code !== 0) {
    throw new ApiError(body.message ?? '接口返回错误');
  }
  return body.data;
}

export async function apiPost<TBody extends object, T>(path: string, body: TBody, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => null) as Partial<ApiEnvelope<T>> | null;
    throw new ApiError(typeof error?.message === 'string' ? error.message : `接口异常：HTTP ${res.status}`);
  }
  const env = (await res.json()) as ApiEnvelope<T>;
  if (env.code !== 0) {
    throw new ApiError(env.message ?? '接口返回错误');
  }
  return env.data;
}
