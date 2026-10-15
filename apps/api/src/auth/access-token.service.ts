import {
  hasPermission,
  signAccessToken,
  toAuthorizationContext,
  verifyAccessToken,
  type Permission,
} from '@repo/authorization';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedActor } from './auth.types';

function jwtSecret() {
  const value = process.env.AUTH_JWT_SECRET;
  if (!value) throw new Error('AUTH_JWT_SECRET is required');
  return value;
}

@Injectable()
export class AccessTokenService {
  constructor(private readonly prisma: PrismaService) {}

  issue(actor: AuthenticatedActor) {
    return signAccessToken(
      {
        sub: actor.id,
        attributes: {
          tenantId: actor.subject.tenantId,
          storeIds: actor.subject.storeIds,
        },
        grants: actor.grants,
        name: actor.name,
        role: actor.role,
      },
      jwtSecret(),
    );
  }

  async authenticate(
    authorization: string | undefined,
    permission?: Permission,
  ): Promise<AuthenticatedActor> {
    if (!authorization?.startsWith('Bearer '))
      throw new UnauthorizedException('Access token required');
    const claims = await verifyAccessToken(authorization.slice(7), jwtSecret());
    if (!claims)
      throw new UnauthorizedException('Invalid or expired access token');
    const auth = toAuthorizationContext(claims);
    if (!auth) throw new UnauthorizedException('Invalid authorization claims');
    if (permission && !hasPermission(auth, permission))
      throw new ForbiddenException('Role lacks permission');

    // Mutable domain attributes come from the current user, not the JWT.
    const user = await this.prisma.client.user.findUnique({
      where: { id: claims.sub },
      select: {
        name: true,
        tenantId: true,
        region: true,
        refundLimit: true,
        customerId: true,
      },
    });
    if (!user || user.tenantId !== auth.subject.tenantId)
      throw new UnauthorizedException('User or tenant changed');
    return {
      ...auth,
      id: claims.sub,
      name: user.name,
      role: claims.role,
      region: user.region,
      refundLimit: Number(user.refundLimit),
      customerId: user.customerId,
    };
  }
}
