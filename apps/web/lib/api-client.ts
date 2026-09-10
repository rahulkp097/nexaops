import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './token-storage';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Dedupes concurrent refresh attempts: several requests can 401 around the
// same moment (e.g. a page that fires 3 fetches on mount right as the
// access token expires) — without this they'd each rotate the refresh
// token and the losers would fail with "already used".
let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }
  refreshPromise = doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function doRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return null;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      clearTokens();
      return null;
    }
    const body = (await response.json()) as { accessToken: string; refreshToken: string };
    setTokens(body.accessToken, body.refreshToken);
    return body.accessToken;
  } catch {
    return null;
  }
}

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  // Login/register/refresh never carry (or need) an access token.
  skipAuth?: boolean;
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) {
      return body.message.join(', ');
    }
    if (typeof body.message === 'string') {
      return body.message;
    }
  } catch {
    // no JSON body — fall through to the generic message
  }
  return `Request failed with status ${response.status}`;
}

function buildUrl(path: string, query?: ApiFetchOptions['query']): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, query, skipAuth = false } = options;
  const url = buildUrl(path, query);

  const doFetch = (token: string | null) =>
    fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let response = await doFetch(skipAuth ? null : getAccessToken());

  if (response.status === 401 && !skipAuth) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      response = await doFetch(refreshedToken);
    }
  }

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    if (response.status === 401) {
      clearTokens();
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
