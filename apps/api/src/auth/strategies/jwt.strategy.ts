import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { EnvConfig } from "../../config/env.validation";

export interface JwtPayload {
  sub: string; // userId
  accountId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<EnvConfig, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get("JWT_ACCESS_SECRET", { infer: true }),
      ignoreExpiration: false,
    });
  }

  // Whatever this returns becomes `request.user`.
  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
