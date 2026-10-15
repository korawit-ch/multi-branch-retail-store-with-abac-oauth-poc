import { clientFetch } from './client';

const endpoint = { url: '/retail', method: 'GET' as const };
const response = (status: number, body?: unknown) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  }) as Response;

describe('clientFetch access-token renewal', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renews an expired access token and retries the protected request once', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(204))
      .mockResolvedValueOnce(response(200, { stores: [] }));
    global.fetch = fetchMock;

    await expect(clientFetch(endpoint)).resolves.toEqual({ stores: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/bff/retail',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/bff/retail',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
  });

  it('does not renew or retry an authorization denial', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(response(403, { message: 'Forbidden' }));
    global.fetch = fetchMock;

    await expect(clientFetch(endpoint)).rejects.toMatchObject({
      status: 403,
      message: 'Forbidden',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
