export const internalApiUrl = () =>
  process.env.API_INTERNAL_URL ||
  `http://localhost:${process.env.API_PORT || 3001}`;

export const webOrigin = () =>
  new URL(
    process.env.WEB_URL || process.env.WEB_ORIGIN || 'http://localhost:3000',
  ).origin;

export function isTrustedOrigin(origin: string | null): boolean {
  return origin === webOrigin();
}
