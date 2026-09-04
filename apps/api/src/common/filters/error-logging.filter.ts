import { ArgumentsHost, Catch, HttpException } from "@nestjs/common";
import { BaseExceptionFilter, HttpAdapterHost } from "@nestjs/core";
import { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { JwtPayload } from "../../auth/strategies/jwt.strategy";

/**
 * Records every 5xx response to ErrorLog for the admin panel's error feed, then defers
 * to Nest's default handling for the actual client response — this never changes what a
 * client sees, it only ever adds a side-channel write. 4xx responses (validation errors,
 * 404s, permission checks) aren't logged here; those are expected traffic, not incidents.
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
    super.catch(exception, host);
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
