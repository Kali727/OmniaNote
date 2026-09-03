import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { EnvConfig } from "../../config/env.validation";

const ALGO = "aes-256-gcm";

// Symmetric encryption for values that must be readable by the app later (TOTP secrets),
// as opposed to passwords/OTP codes which are one-way hashed and never decrypted.
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService<EnvConfig, true>) {
    // Derive a 32-byte key regardless of the raw secret's length/encoding.
    this.key = createHash("sha256").update(config.get("MFA_TOTP_ENCRYPTION_KEY", { infer: true })).digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(".");
  }

  decrypt(payload: string): string {
    const [ivB64, authTagB64, ciphertextB64] = payload.split(".");
    const decipher = createDecipheriv(ALGO, this.key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  }
}
