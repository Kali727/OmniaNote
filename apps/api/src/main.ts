import { join } from "path";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { ZodValidationPipe } from "nestjs-zod";
import { AppModule } from "./app.module";
import { EnvConfig } from "./config/env.validation";

// Prisma represents BigInt columns (Item.storageBytes, Account.storageUsedBytes) as JS
// BigInt, which JSON.stringify can't serialize natively. Byte counts here stay far below
// Number.MAX_SAFE_INTEGER (9 PB) even at the CORPORATE tier, so a plain Number is safe.
(BigInt.prototype as unknown as { toJSON(): number }).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<EnvConfig, true>);

  app.use(helmet());
  app.enableCors({ origin: config.get("CORS_ORIGIN", { infer: true }) });
  app.useGlobalPipes(new ZodValidationPipe());
  app.setGlobalPrefix("api/v1");

  // The admin panel: a static page outside the /api/v1 prefix (it's not a JSON API
  // route — it's the operator-facing dashboard, calling the /api/v1/admin/* endpoints
  // above from its own JS). Not part of the Capacitor mobile app bundle on purpose —
  // this is for whoever runs the service, not for any logged-in end user.
  app.useStaticAssets(join(__dirname, "..", "public"));

  const port = config.get("PORT", { infer: true });
  await app.listen(port);
}
bootstrap();
