import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { ZodValidationPipe } from "nestjs-zod";
import { AppModule } from "./app.module";
import { EnvConfig } from "./config/env.validation";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<EnvConfig, true>);

  app.use(helmet());
  app.enableCors({ origin: config.get("CORS_ORIGIN", { infer: true }) });
  app.useGlobalPipes(new ZodValidationPipe());
  app.setGlobalPrefix("api/v1");

  const port = config.get("PORT", { infer: true });
  await app.listen(port);
}
bootstrap();
