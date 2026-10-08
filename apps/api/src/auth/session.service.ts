import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedActor } from './auth.types';
import type { SessionCookie } from './auth-flow.types';
import { hashToken, open, randomSecret, seal } from './auth.crypto';
import { isPermission } from '@repo/authorization';

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(identity: { subject: string; displayName: string }) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: identity.subject },
    });
    if (!user || user.name !== identity.displayName) return null;

    const token = randomSecret();
    const expiresAt = new Date(Date.now() + 60 * 60_000);
    await this.prisma.client.authSession.create({
      data: { tokenHash: hashToken(token), userId: user.id, expiresAt },
    });
    return seal(
      { token, expiresAt: expiresAt.getTime() } satisfies SessionCookie,
      'app-session',
    );
  }

  async authenticate(
    cookieHeader: string | undefined,
  ): Promise<AuthenticatedActor> {
    return (await this.authenticateSession(cookieHeader)).actor;
  }

  async authenticateSession(cookieHeader: string | undefined) {
    const session = this.readSessionCookie(
      this.readCookie(cookieHeader, 'app_session'),
    );
    if (!session) throw new UnauthorizedException('Authentication required');

    const stored = await this.prisma.client.authSession.findUnique({
      where: { tokenHash: hashToken(session.token) },
      include: {
        user: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
            assignedStores: true,
          },
        },
      },
    });
    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Session is expired or revoked');
    }

    const user = stored.user;
    const actor: AuthenticatedActor = {
      id: user.id,
      userId: user.id,
      name: user.name,
      tenantId: user.tenantId,
      region: user.region,
      refundLimit: Number(user.refundLimit),
      customerId: user.customerId,
      role: user.role.code,
      permissions: user.role.permissions
        .map(({ permission }) => permission.code)
        .filter(isPermission),
      storeIds: user.assignedStores.map(({ storeId }) => storeId),
    };
    return { actor, sessionHash: hashToken(session.token) };
  }

  async revokeCurrentSession(cookieHeader: string | undefined) {
    const session = this.readSessionCookie(
      this.readCookie(cookieHeader, 'app_session'),
    );
    if (!session) return 0;
    const result = await this.prisma.client.authSession.updateMany({
      where: {
        tokenHash: hashToken(session.token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async revokeAllSessions(cookieHeader: string | undefined) {
    const session = this.readSessionCookie(
      this.readCookie(cookieHeader, 'app_session'),
    );
    if (!session) return 0;
    const current = await this.prisma.client.authSession.findUnique({
      where: { tokenHash: hashToken(session.token) },
    });
    if (
      !current ||
      current.revokedAt ||
      current.expiresAt.getTime() < Date.now()
    )
      return 0;

    const result = await this.prisma.client.authSession.updateMany({
      where: { userId: current.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  private readSessionCookie(cookie: string | undefined) {
    const session = open<SessionCookie>(cookie, 'app-session');
    return session && session.expiresAt >= Date.now() ? session : null;
  }

  private readCookie(
    header: string | undefined,
    name: string,
  ): string | undefined {
    return header
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  }
}
