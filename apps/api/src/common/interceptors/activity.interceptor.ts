import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { JwtPayload } from "../../auth/strategies/jwt.strategy";

const COUNTRY_HEADER = "cf-ipcountry"; // set by Cloudflare when the request is tunneled/proxied through it

/**
 * Stamps lastSeenAt (and lastKnownCountry, when Cloudflare's header is present) on every
 * authenticated request — the admin panel's only source for "online now" / active-user
 * counts and geography. Runs for every request rather than sampling or throttling: at
 * this app's actual scale (a handful of staff per account) a single indexed-PK UPDATE per
 * request is not worth trading correctness for. Fire-and-forget so a write failure or a
 * slow DB never delays the response the request actually asked for.
 */
@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const userId = request.user?.sub;
    if (userId) {
      const countryHeader = request.headers[COUNTRY_HEADER];
      const country = typeof countryHeader === "string" && countryHeader.length === 2 ? countryHeader : undefined;
      this.prisma.user
        .update({ where: { id: userId }, data: { lastSeenAt: new Date(), ...(country ? { lastKnownCountry: country } : {}) } })
        .catch(() => {});
    }
    return next.handle();
  }
}
