export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Minimal JSON fetch wrapper. Throws ApiError with the backend's `error` text when present. */
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Backend unreachable. Check that it is running and the rewrite URL is correct.', 0);
  }
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Server returned status ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  return err instanceof Error ? err.message : fallback;
}
