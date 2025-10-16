import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebSocketService } from './websocket.service';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { GameRecord } from './entities/game-record.entity';
import { AIModule } from '../ai/ai.module';
import { UserModule } from '../user/user.module';
import { RedisModule } from '@/shared/redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameRecord]),
    AIModule,
    UserModule,
    RedisModule,
  ],
  controllers: [GameController],
  providers: [WebSocketService, GameService],
  exports: [GameService],
})
export class GameModule {}

