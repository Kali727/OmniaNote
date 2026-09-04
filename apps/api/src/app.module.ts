import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.validation";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./common/redis/redis.module";
import { AuthModule } from "./auth/auth.module";
import { LocationsModule } from "./locations/locations.module";
import { ItemsModule } from "./items/items.module";
import { TeamModule } from "./team/team.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    RedisModule,
    AuthModule,
    LocationsModule,
    ItemsModule,
    TeamModule,
    HealthModule,
  ],
})
export class AppModule {}
