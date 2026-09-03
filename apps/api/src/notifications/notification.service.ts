import { Injectable, Logger } from "@nestjs/common";
import { MfaMethod } from "@omnianote/shared";

/**
 * Sends an out-of-band OTP code to the user. The dev/default implementation just logs
 * it — swap this for Twilio (SMS) and SES/Postmark (email) providers behind the same
 * interface before going to production. Kept out of the request path: callers should
 * fire-and-forget via the notifications queue, not await delivery inline.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async sendOtpCode(
    method: Extract<MfaMethod, "SMS" | "EMAIL">,
    destination: string,
    code: string,
  ): Promise<void> {
    // TODO(production): replace with Twilio (SMS) / SES or Postmark (EMAIL).
    this.logger.warn(`[DEV OTP] ${method} to ${destination}: ${code}`);
  }
}
