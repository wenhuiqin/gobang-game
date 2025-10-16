import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET') || 'your_jwt_secret_key_change_this_in_production',
    });
  }

  async validate(payload: any) {
    // 确保id是字符串类型（数据库bigint在TypeORM中是string）
    return { 
      id: String(payload.id), 
      openid: payload.openid 
    };
  }
}

