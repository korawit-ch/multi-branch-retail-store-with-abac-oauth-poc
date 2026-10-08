import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  internalExchangeKey,
  signAccessToken,
  verifyAccessToken,
} from '@repo/authorization';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedActor } from './auth.types';
import type { SessionService } from './session.service';
import { AccessTokenService } from './access-token.service';

const secret = Buffer.alloc(32, 3).toString('base64url');
const actor: AuthenticatedActor = {
  id: 'manager',
  userId: 'manager',
  name: 'Manager',
  tenantId: 'thai-food',
  region: 'TH',
  role: 'STORE_MANAGER',
  customerId: null,
  refundLimit: 500,
  permissions: ['store.read', 'order.refund'],
  storeIds: ['10'],
};

function setup() {
  const sessions = {
    authenticateSession: jest.fn().mockResolvedValue({
      actor,
      sessionHash: 'session-hash',
    }),
  };
  const authSession = {
    findUnique: jest.fn().mockResolvedValue({
      userId: actor.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    }),
  };
  const service = new AccessTokenService(
    sessions as unknown as SessionService,
    { client: { authSession } } as unknown as PrismaService,
  );
  return { service, sessions, authSession };
}

describe('AccessTokenService', () => {
  const previousSecret = process.env.AUTH_COOKIE_SECRET;
  beforeEach(() => {
    process.env.AUTH_COOKIE_SECRET = secret;
  });
  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AUTH_COOKIE_SECRET;
    else process.env.AUTH_COOKIE_SECRET = previousSecret;
  });

  it('exchanges only through the BFF and signs a one-minute authorization snapshot', async () => {
    const { service, sessions } = setup();
    await expect(
      service.exchange('app_session=abc', 'wrong'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.authenticateSession).not.toHaveBeenCalled();
    const result = await service.exchange(
      'app_session=abc',
      await internalExchangeKey(secret),
    );
    expect(result.expiresIn).toBe(60);
    const claims = await verifyAccessToken(result.accessToken, secret);
    expect(claims).toMatchObject({
      sub: actor.id,
      sid: 'session-hash',
      permissions: actor.permissions,
      storeIds: ['10'],
    });
    expect(claims!.exp - claims!.iat).toBe(60);
    expect(
      await verifyAccessToken(
        result.accessToken,
        Buffer.alloc(32, 4).toString('base64url'),
      ),
    ).toBeNull();
  });

  it('rejects bearer tokens after database revocation, and checks permission separately', async () => {
    const { service, authSession } = setup();
    const token = await signAccessToken(
      { ...actor, sub: actor.id, sid: 'session-hash' },
      secret,
    );
    await expect(
      service.authenticate(`Bearer ${token}`, 'store.read'),
    ).resolves.toMatchObject({ id: actor.id });
    await expect(
      service.authenticate(`Bearer ${token}`, 'inventory.adjust'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    authSession.findUnique.mockResolvedValue({
      userId: actor.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    });
    await expect(
      service.authenticate(`Bearer ${token}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a forged or expired token before querying the database', async () => {
    const { service, authSession } = setup();
    await expect(service.authenticate('Bearer forged')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authSession.findUnique).not.toHaveBeenCalled();
    const realNow = Date.now;
    const start = realNow();
    Date.now = () => start;
    try {
      const token = await signAccessToken(
        { ...actor, sub: actor.id, sid: 'session-hash' },
        secret,
      );
      Date.now = () => start + 61_000;
      await expect(
        service.authenticate(`Bearer ${token}`),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authSession.findUnique).not.toHaveBeenCalled();
    } finally {
      Date.now = realNow;
    }
  });
});
