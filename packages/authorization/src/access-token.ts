import { toAuthorizationContext, type PermissionGrant } from './policy.js';

const encoder = () => new TextEncoder();
const issuer = 'branch-co-api';
const audience = 'branch-co-bff';
export const accessTokenLifetimeSeconds = 10 * 60;

export type AccessClaims = {
  sub: string;
  attributes: { tenantId: string; storeIds: string[] };
  grants: PermissionGrant[];
  name: string;
  role: 'CUSTOMER' | 'STORE_STAFF' | 'STORE_MANAGER' | 'HQ_ADMIN';
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

async function signingKey(secret: string): Promise<CryptoKey> {
  const raw = decode(secret);
  if (raw.length < 32)
    throw new Error('AUTH_JWT_SECRET must be at least 32 bytes');
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
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
    await signingKey(secret),
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
      await signingKey(secret),
      decode(signature),
      encoder().encode(`${header}.${body}`),
    );
    if (!valid) return null;
    const data: unknown = JSON.parse(new TextDecoder().decode(decode(body)));
    if (!data || typeof data !== 'object') return null;
    const claims = data as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (
      claims.iss !== issuer ||
      claims.aud !== audience ||
      typeof claims.name !== 'string' ||
      typeof claims.role !== 'string' ||
      !['CUSTOMER', 'STORE_STAFF', 'STORE_MANAGER', 'HQ_ADMIN'].includes(
        claims.role,
      ) ||
      !toAuthorizationContext(claims) ||
      !Number.isInteger(claims.iat) ||
      !Number.isInteger(claims.exp) ||
      (claims.iat as number) > now + 5 ||
      (claims.exp as number) <= now ||
      (claims.exp as number) - (claims.iat as number) >
        accessTokenLifetimeSeconds
    )
      return null;
    return claims as AccessClaims;
  } catch {
    return null;
  }
}
