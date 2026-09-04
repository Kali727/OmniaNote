import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { MfaMethod } from "@omnianote/shared";
import { EnvConfig } from "../config/env.validation";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

    await this.sendEmail(
      destination,
      "Your OmniaNote verification code",
      `<p>Your verification code is <strong>${code}</strong>.</p><p>It expires in 5 minutes. If you didn't request this, you can ignore this email.</p>`,
    );
  }

  async sendTeamInvite(
    destination: string,
    accountName: string,
    inviterName: string,
    acceptUrl: string,
  ): Promise<void> {
    // accountName and inviterName are user-controlled (a team's chosen display name,
    // someone's username) — escape before they land in HTML, or a name containing "&"
    // (plausible: "Smith & Sons Hotels") breaks the markup, and one containing an actual
    // <tag> injects it into the recipient's email client.
    const safeAccountName = escapeHtml(accountName);
    const safeInviterName = escapeHtml(inviterName);
    await this.sendEmail(
      destination,
      `${inviterName} invited you to join ${accountName} on OmniaNote`,
      `<p><strong>${safeInviterName}</strong> invited you to join <strong>${safeAccountName}</strong> on OmniaNote.</p>` +
        `<p><a href="${acceptUrl}">Accept the invite</a> to set up your account. This link expires in 7 days.</p>` +
        `<p>If you weren't expecting this, you can ignore this email.</p>`,
    );
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`[RESEND_API_KEY not set — logging instead of sending] To ${to}: ${subject}\n${html}`);
      return;
    }

    const { error } = await this.resend.emails.send({ from: this.fromEmail, to, subject, html });
    if (error) {
      this.logger.error(`Resend failed to send "${subject}" to ${to}: ${error.message}`);
      throw new Error("Failed to send email");
    }
  }
}
