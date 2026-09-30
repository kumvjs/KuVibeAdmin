import type { AxiosResponse } from 'axios';

/** 后端业务失败，HTTP 错误仍以 AxiosError 抛出。 */
export class ApiBusinessError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly traceId?: string,
  ) {
    super(message);
    this.name = 'ApiBusinessError';
  }
}

type Unwrap<T> = T extends { code: number; data: infer D } ? D : T;

/** 保留生成函数必填参数检查，仅对 ResOp 解包；Blob 等原始响应原样返回。 */
export async function apiRequest<Args extends unknown[], Body>(
  method: (...args: Args) => Promise<AxiosResponse<Body>>,
  ...args: Args
): Promise<Unwrap<Body>> {
  const response = await method(...args);
  const body = response.data;
  if (body !== null && typeof body === 'object' && 'code' in body && 'data' in body) {
    const envelope = body as { code: number; data: unknown; message?: string; success?: boolean; traceId?: string };
    if (envelope.code !== 0 || envelope.success === false) {
      throw new ApiBusinessError(envelope.code, envelope.message || '请求失败', envelope.traceId);
    }
    return envelope.data as Unwrap<Body>;
  }
  return body as Unwrap<Body>;
}
