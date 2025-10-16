import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from './common/config/database.config';
import redisConfig from './common/config/redis.config';
import wechatConfig from './common/config/wechat.config';
import { RedisModule } from './shared/redis/redis.module';
import { WechatModule } from './shared/wechat/wechat.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { GameModule } from './modules/game/game.module';
import { AIModule } from './modules/ai/ai.module';
import { RoomModule } from './modules/room/room.module';
import { User } from './modules/user/entities/user.entity';
import { GameRecord } from './modules/game/entities/game-record.entity';
import { Room } from './modules/room/entities/room.entity';

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, wechatConfig],
    }),
    
    // 数据库模块
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql' as const,
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get<string>('DB_USERNAME', 'root'),
        password: configService.get<string>('DB_PASSWORD', ''),
        database: configService.get<string>('DB_DATABASE', 'gomoku_game'),
        entities: [User, GameRecord, Room],
        synchronize: configService.get<string>('NODE_ENV') === 'development',
        logging: configService.get<string>('NODE_ENV') === 'development',
        timezone: '+08:00',
      }),
    }),

    // 共享模块
    RedisModule,
    WechatModule,

    // 业务模块
    AuthModule,
    UserModule,
    GameModule,
    AIModule,
    RoomModule,
  ],
})
export class AppModule {}

