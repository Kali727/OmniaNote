import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { MfaMethod } from "@omnianote/shared";
import { EnvConfig } from "../config/env.validation";

/**
 * Sends an out-of-band OTP code to the user. SMS is deliberately not implemented — it
 * costs money per message, and MFA was scoped to TOTP (free, primary) + email (free,
 * fallback) instead. Without RESEND_API_KEY set, email codes log to stdout rather than
 * sending — convenient for local dev, but this must be set in any real deployment.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly resend: Resend | null;
  private readonly fromEmail: string;

  constructor(config: ConfigService<EnvConfig, true>) {
    const apiKey = config.get("RESEND_API_KEY", { infer: true });
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.fromEmail = config.get("RESEND_FROM_EMAIL", { infer: true });
  }

  async sendOtpCode(
    method: Extract<MfaMethod, "SMS" | "EMAIL">,
    destination: string,
    code: string,
  ): Promise<void> {
    if (method === "SMS") {
      this.logger.warn(`SMS delivery isn't implemented — code for ${destination} was NOT sent: ${code}`);
      return;
    }

    if (!this.resend) {
      this.logger.warn(`[RESEND_API_KEY not set — logging instead of sending] Email OTP to ${destination}: ${code}`);
      return;
    }

    const { error } = await this.resend.emails.send({
      from: this.fromEmail,
      to: destination,
      subject: "Your OmniaNote verification code",
      html: `<p>Your verification code is <strong>${code}</strong>.</p><p>It expires in 5 minutes. If you didn't request this, you can ignore this email.</p>`,
    });

    if (error) {
      this.logger.error(`Resend failed to send OTP to ${destination}: ${error.message}`);
      throw new Error("Failed to send verification email");
    }
  }
}
