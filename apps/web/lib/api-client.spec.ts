import { apiFetch, ApiError } from './api-client';
import { clearTokens, getAccessToken, setTokens } from './token-storage';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('apiFetch', () => {
  beforeEach(() => {
    clearTokens();
    global.fetch = jest.fn();
  });

  it('attaches the access token as a Bearer header', async () => {
    setTokens('access-1', 'refresh-1');
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiFetch('/documents');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer access-1');
  });

  it('does not attach a token when skipAuth is set', async () => {
    setTokens('access-1', 'refresh-1');
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiFetch('/auth/login', { skipAuth: true, body: { email: 'a', password: 'b' } });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('refreshes the access token once on a 401 and retries the original request', async () => {
    setTokens('expired-access', 'refresh-1');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' })) // original request
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'new-access', refreshToken: 'new-refresh' })) // refresh call
      .mockResolvedValueOnce(jsonResponse(200, { id: 'doc-1' })); // retried request

    const result = await apiFetch<{ id: string }>('/documents/doc-1');

    expect(result).toEqual({ id: 'doc-1' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(getAccessToken()).toBe('new-access');
    const [, retryInit] = (global.fetch as jest.Mock).mock.calls[2];
    expect(retryInit.headers.Authorization).toBe('Bearer new-access');
  });

  it('clears tokens and throws when refresh itself fails', async () => {
    setTokens('expired-access', 'bad-refresh');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'refresh token has already been used' }));

    await expect(apiFetch('/documents')).rejects.toBeInstanceOf(ApiError);
    expect(getAccessToken()).toBeNull();
  });

  it('surfaces the server-provided message, joining array-shaped validation errors', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(400, { message: ['email must be an email', 'password is too short'] }),
    );

    await expect(apiFetch('/auth/register', { skipAuth: true, body: {} })).rejects.toThrow(
      'email must be an email, password is too short',
    );
  });

  it('returns undefined for a 204 response', async () => {
    setTokens('access-1', 'refresh-1');
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 204 } as Response);

    const result = await apiFetch('/documents/doc-1');

    expect(result).toBeUndefined();
  });
});
