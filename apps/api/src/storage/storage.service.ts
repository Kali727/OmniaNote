import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { EnvConfig } from "../config/env.validation";

const PRESIGNED_URL_TTL_SECONDS = 5 * 60;

// Thin wrapper around the S3 client so the rest of the app never imports the AWS SDK
// directly. Points at MinIO today; swapping to real S3 later is a config change only.
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.bucket = this.config.get("S3_BUCKET", { infer: true });
    this.client = new S3Client({
      endpoint: this.config.get("S3_ENDPOINT", { infer: true }),
      region: this.config.get("S3_REGION", { infer: true }),
      forcePathStyle: this.config.get("S3_FORCE_PATH_STYLE", { infer: true }),
      credentials: {
        accessKeyId: this.config.get("S3_ACCESS_KEY_ID", { infer: true }),
        secretAccessKey: this.config.get("S3_SECRET_ACCESS_KEY", { infer: true }),
      },
    });
  }

  buildObjectKey(accountId: string, kind: "original" | "thumbnail", ext: string): string {
    return `accounts/${accountId}/${kind}/${randomUUID()}.${ext}`;
  }

  /** Client uploads the original directly to storage with this URL — the file never transits the API process. */
  async getUploadUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    return getSignedUrl(this.client, command, { expiresIn: PRESIGNED_URL_TTL_SECONDS });
  }

  async getDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: PRESIGNED_URL_TTL_SECONDS });
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** For the admin health check — confirms the bucket is actually reachable, not just configured. */
  async checkConnection(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
