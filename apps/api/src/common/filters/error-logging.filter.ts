import { join } from "path";
import { ArgumentsHost, Catch, HttpException } from "@nestjs/common";
import { BaseExceptionFilter, HttpAdapterHost } from "@nestjs/core";
import { Request, Response } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { JwtPayload } from "../../auth/strategies/jwt.strategy";

// This file compiles to apps/api/dist/common/filters/error-logging.filter.js; four ".."
// segments walk back up to apps/, landing on the sibling apps/mobile/dist from there.
const MOBILE_DIST = join(__dirname, "..", "..", "..", "..", "mobile", "dist");

/**
 * Records every 5xx response to ErrorLog for the admin panel's error feed, then defers
 * to Nest's default handling for the actual client response — this never changes what a
 * client sees, it only ever adds a side-channel write. 4xx responses (validation errors,
 * 404s, permission checks) aren't logged here; those are expected traffic, not incidents.
 *
 * Also serves the mobile app's SPA fallback for a 404 on a non-API GET request — e.g. a
 * deep link like /items/abc123 isn't a real file on disk, so it needs to fall back to
 * index.html and let React Router take over client-side. This turned out to be the only
 * reliable place to do that: a route registered as a real Nest controller (a "*" catch-all
 * excluded from the global prefix) landed at genuinely unpredictable positions relative to
 * the other feature modules' controllers from one run to the next — it was seen shadowing
 * GET /api/v1/health outright in testing, which a controller-ordering fix should never be
 * able to do. A plain Express app.use() registered after the app initializes has the
 * opposite problem: Nest's own unmatched-route handling (which is exactly the 404 this
 * filter catches) runs before anything queued that way ever gets a chance. This filter is
 * the one thing guaranteed to run for every unmatched route, by construction — it's what
 * Nest's own 404 handling already funnels through.
 */
@Catch()
export class ErrorLoggingFilter extends BaseExceptionFilter {
  constructor(
    private readonly prisma: PrismaService,
    httpAdapterHost: HttpAdapterHost,
  ) {
    super(httpAdapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500) {
      const request = host.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
      // Fire-and-forget — logging the error must never itself cause a second error, or
      // delay the response the caller is already waiting on.
      this.logError(exception, request, status).catch(() => {});
    }

    if (status === 404 && this.isSpaFallbackCandidate(host)) {
      const response = host.switchToHttp().getResponse<Response>();
      response.sendFile(join(MOBILE_DIST, "index.html"));
      return;
    }

    super.catch(exception, host);
  }

  private isSpaFallbackCandidate(host: ArgumentsHost): boolean {
    const request = host.switchToHttp().getRequest<Request>();
    return request.method === "GET" && !request.path.startsWith("/api/") && !request.path.startsWith("/admin");
  }

  private async logError(exception: unknown, request: Request & { user?: JwtPayload }, status: number): Promise<void> {
    const message = exception instanceof Error ? exception.message : String(exception);
    const stack = exception instanceof Error ? exception.stack : undefined;
    await this.prisma.errorLog.create({
      data: {
        message: message.slice(0, 2000),
        stack: stack?.slice(0, 8000),
        path: request.originalUrl ?? request.url,
        method: request.method,
        statusCode: status,
        userId: request.user?.sub,
        accountId: request.user?.accountId,
      },
    });
  }
}
