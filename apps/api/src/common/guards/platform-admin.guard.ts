import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { JwtPayload } from "../../auth/strategies/jwt.strategy";

/**
 * Gates the admin panel. Deliberately a fresh DB lookup on every request rather than a
 * claim baked into the JWT at login — revoking someone's admin access should take effect
 * immediately, not only once their (long-lived) access token expires. Admin panel traffic
 * is low-volume, so the extra query per request is a good trade for that.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    if (!request.user) throw new UnauthorizedException();

    const user = await this.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { isPlatformAdmin: true },
    });
    if (!user?.isPlatformAdmin) throw new ForbiddenException("Admin access required");
    return true;
  }
}
