import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';
import { Room } from './entities/room.entity';
import { RedisModule } from '@/shared/redis/redis.module';
import { UserModule } from '@/modules/user/user.module';
import { GameModule } from '@/modules/game/game.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Room]),
    RedisModule,
    UserModule,
    forwardRef(() => GameModule), // 避免循环依赖
  ],
  controllers: [RoomController],
  providers: [RoomService],
  exports: [RoomService],
})
export class RoomModule {}

