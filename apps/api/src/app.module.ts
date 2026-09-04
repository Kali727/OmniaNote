import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { validateEnv } from "./config/env.validation";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./common/redis/redis.module";
import { AuthModule } from "./auth/auth.module";
import { LocationsModule } from "./locations/locations.module";
import { ItemsModule } from "./items/items.module";
import { TeamModule } from "./team/team.module";
import { AdminModule } from "./admin/admin.module";
import { HealthModule } from "./health/health.module";
import { ErrorLoggingFilter } from "./common/filters/error-logging.filter";
import { ActivityInterceptor } from "./common/interceptors/activity.interceptor";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    RedisModule,
    AuthModule,
    LocationsModule,
    ItemsModule,
    TeamModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ErrorLoggingFilter },
    { provide: APP_INTERCEPTOR, useClass: ActivityInterceptor },
  ],
})
export class AppModule {}
