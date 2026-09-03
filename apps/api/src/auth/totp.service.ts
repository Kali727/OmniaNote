import { Injectable } from "@nestjs/common";
import { authenticator } from "otplib";
import * as QRCode from "qrcode";
import { EncryptionService } from "../common/crypto/encryption.service";

const ISSUER = "OmniaNote";

@Injectable()
export class TotpService {
  constructor(private readonly encryption: EncryptionService) {}

  generateSecret(): string {
    return authenticator.generateSecret();
  }

  encryptSecret(secret: string): string {
    return this.encryption.encrypt(secret);
  }

  decryptSecret(encryptedSecret: string): string {
    return this.encryption.decrypt(encryptedSecret);
  }

  async buildQrCodeDataUrl(accountEmail: string, secret: string): Promise<string> {
    const otpauthUrl = authenticator.keyuri(accountEmail, ISSUER, secret);
    return QRCode.toDataURL(otpauthUrl);
  }

  verify(code: string, secret: string): boolean {
    return authenticator.verify({ token: code, secret });
  }
}
