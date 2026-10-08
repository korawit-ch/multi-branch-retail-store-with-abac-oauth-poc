import {
  can,
  internalExchangeKey,
  signAccessToken,
  verifyAccessToken,
  type Permission,
} from '@repo/authorization';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedActor } from './auth.types';
import { SessionService } from './session.service';

function secret() {
  const value = process.env.AUTH_COOKIE_SECRET;
  if (!value) throw new Error('AUTH_COOKIE_SECRET is required');
  return value;
}

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async exchange(cookie: string | undefined, exchangeKey: string | undefined) {
    const expected = await internalExchangeKey(secret());
    const received = Buffer.from(exchangeKey || '');
    const expectedBytes = Buffer.from(expected);
    if (
      received.length !== expectedBytes.length ||
      !timingSafeEqual(received, expectedBytes)
    )
      throw new UnauthorizedException('BFF authentication required');

    const { actor, sessionHash } =
      await this.sessions.authenticateSession(cookie);
    const accessToken = await signAccessToken(
      {
        sub: actor.id,
        sid: sessionHash,
        userId: actor.userId,
        name: actor.name,
        tenantId: actor.tenantId,
        region: actor.region,
        role: actor.role,
        refundLimit: actor.refundLimit,
        customerId: actor.customerId,
        permissions: actor.permissions,
        storeIds: actor.storeIds,
      },
      secret(),
    );
    return { accessToken, tokenType: 'Bearer' as const, expiresIn: 60 };
  }

  async authenticate(
    authorization: string | undefined,
    permission?: Permission,
  ): Promise<AuthenticatedActor> {
    if (!authorization?.startsWith('Bearer '))
      throw new UnauthorizedException('Access token required');
    const claims = await verifyAccessToken(authorization.slice(7), secret());
    if (!claims)
      throw new UnauthorizedException('Invalid or expired access token');
    const stored = await this.prisma.client.authSession.findUnique({
      where: { tokenHash: claims.sid },
      select: { userId: true, expiresAt: true, revokedAt: true },
    });
    if (
      !stored ||
      stored.userId !== claims.sub ||
      stored.revokedAt ||
      stored.expiresAt.getTime() <= Date.now()
    )
      throw new UnauthorizedException('Session is expired or revoked');
    if (permission && !can(claims, permission))
      throw new ForbiddenException('Role lacks permission');
    return {
      id: claims.sub,
      userId: claims.userId,
      name: claims.name,
      tenantId: claims.tenantId,
      region: claims.region,
      role: claims.role,
      refundLimit: claims.refundLimit,
      customerId: claims.customerId,
      permissions: claims.permissions,
      storeIds: claims.storeIds,
    };
  }
}
