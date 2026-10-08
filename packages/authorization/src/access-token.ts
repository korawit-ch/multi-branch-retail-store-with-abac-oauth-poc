import { isPermission, type AuthorizationContext } from './policy.js';

const encoder = () => new TextEncoder();
const issuer = 'branch-co-api';
const audience = 'branch-co-bff';
export const accessTokenLifetimeSeconds = 60;

export type AccessClaims = AuthorizationContext & {
  sub: string;
  sid: string;
  name: string;
  region: string;
  role: 'CUSTOMER' | 'STORE_STAFF' | 'STORE_MANAGER' | 'HQ_ADMIN';
  refundLimit: number;
  customerId: string | null;
  iss: typeof issuer;
  aud: typeof audience;
  iat: number;
  exp: number;
};

function encode(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function decode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivedKey(secret: string, purpose: string): Promise<CryptoKey> {
  const raw = decode(secret);
  if (raw.length < 32)
    throw new Error('AUTH_COOKIE_SECRET must be at least 32 bytes');
  const material = new Uint8Array(
    raw.length + encoder().encode(purpose).length,
  );
  material.set(raw);
  material.set(encoder().encode(purpose), raw.length);
  const digest = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey(
    'raw',
    digest,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function internalExchangeKey(secret: string): Promise<string> {
  const key = await derivedKey(secret, 'bff-exchange-v1');
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder().encode('request-access-token'),
  );
  return encode(new Uint8Array(signature));
}

export async function signAccessToken(
  claims: Omit<AccessClaims, 'iss' | 'aud' | 'iat' | 'exp'>,
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessClaims = {
    ...claims,
    iss: issuer,
    aud: audience,
    iat: now,
    exp: now + accessTokenLifetimeSeconds,
  };
  const header = encode(
    encoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
  );
  const body = encode(encoder().encode(JSON.stringify(payload)));
  const message = `${header}.${body}`;
  const signature = await crypto.subtle.sign(
    'HMAC',
    await derivedKey(secret, 'access-token-v1'),
    encoder().encode(message),
  );
  return `${message}.${encode(new Uint8Array(signature))}`;
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<AccessClaims | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    if (!header || !body || !signature) return null;
    const headerData: unknown = JSON.parse(
      new TextDecoder().decode(decode(header)),
    );
    if (
      !headerData ||
      typeof headerData !== 'object' ||
      !('alg' in headerData) ||
      headerData.alg !== 'HS256' ||
      !('typ' in headerData) ||
      headerData.typ !== 'JWT'
    )
      return null;
    const valid = await crypto.subtle.verify(
      'HMAC',
      await derivedKey(secret, 'access-token-v1'),
      decode(signature),
      encoder().encode(`${header}.${body}`),
    );
    if (!valid) return null;
    const data: unknown = JSON.parse(new TextDecoder().decode(decode(body)));
    if (!data || typeof data !== 'object') return null;
    const c = data as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (
      c.iss !== issuer ||
      c.aud !== audience ||
      typeof c.sub !== 'string' ||
      !c.sub ||
      c.userId !== c.sub ||
      typeof c.sid !== 'string' ||
      !c.sid ||
      typeof c.name !== 'string' ||
      typeof c.tenantId !== 'string' ||
      !c.tenantId ||
      typeof c.region !== 'string' ||
      typeof c.role !== 'string' ||
      !['CUSTOMER', 'STORE_STAFF', 'STORE_MANAGER', 'HQ_ADMIN'].includes(
        c.role,
      ) ||
      typeof c.refundLimit !== 'number' ||
      !Number.isFinite(c.refundLimit) ||
      (c.customerId !== null && typeof c.customerId !== 'string') ||
      !Array.isArray(c.permissions) ||
      !c.permissions.every((value: unknown) =>
        typeof value === 'string' ? isPermission(value) : false,
      ) ||
      !Array.isArray(c.storeIds) ||
      !c.storeIds.every((value: unknown) => typeof value === 'string') ||
      !Number.isInteger(c.iat) ||
      !Number.isInteger(c.exp) ||
      (c.iat as number) > now + 5 ||
      (c.exp as number) <= now ||
      (c.exp as number) - (c.iat as number) > accessTokenLifetimeSeconds
    )
      return null;
    return c as AccessClaims;
  } catch {
    return null;
  }
}
