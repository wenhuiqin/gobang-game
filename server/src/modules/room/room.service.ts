import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from './entities/room.entity';
import { RedisService } from '@/shared/redis/redis.service';
import { REDIS_KEYS } from '@/common/constants/redis-keys.constants';

@Injectable()
export class RoomService {
  constructor(
    @InjectRepository(Room)
    private roomRepository: Repository<Room>,
    private redisService: RedisService,
  ) {}

  /**
   * 生成6位房间号
   */
  private generateRoomCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * 创建房间
   */
  async createRoom(userId: string, nickname: string): Promise<{ roomCode: string; room: Room }> {
    // 生成唯一房间号
    let roomCode = this.generateRoomCode();
    let exists = await this.roomRepository.findOne({ where: { roomCode } });
    
    while (exists) {
      roomCode = this.generateRoomCode();
      exists = await this.roomRepository.findOne({ where: { roomCode } });
    }

    // 设置房间过期时间（1小时后）
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // 创建房间记录
    const room = this.roomRepository.create({
      roomCode,
      creatorId: userId,
      creatorNickname: nickname,
      status: 'waiting',
      expiresAt,
    });

    await this.roomRepository.save(room);

    // 在Redis中存储房间信息（用于快速查询）
    const roomKey = REDIS_KEYS.ROOM_INFO(roomCode);
    await this.redisService.set(roomKey, JSON.stringify({
      roomCode,
      creatorId: userId,
      creatorNickname: nickname,
      status: 'waiting',
      createdAt: new Date().toISOString(),
    }), 3600); // 1小时过期

    return { roomCode, room };
  }

  /**
   * 加入房间
   */
  async joinRoom(roomCode: string, userId: string, nickname: string): Promise<Room> {
    const room = await this.roomRepository.findOne({ where: { roomCode } });

    if (!room) {
      throw new NotFoundException('房间不存在或已过期');
    }

    if (room.status !== 'waiting') {
      throw new BadRequestException('房间已满或游戏已开始');
    }

    if (room.creatorId === userId) {
      throw new BadRequestException('不能加入自己创建的房间');
    }

    // 更新房间状态
    room.joinerId = userId;
    room.joinerNickname = nickname;
    room.status = 'playing';
    room.startedAt = new Date();

    await this.roomRepository.save(room);

    // 更新Redis中的房间信息
    const roomKey = REDIS_KEYS.ROOM_INFO(roomCode);
    await this.redisService.set(roomKey, JSON.stringify({
      roomCode,
      creatorId: room.creatorId,
      creatorNickname: room.creatorNickname,
      joinerId: userId,
      joinerNickname: nickname,
      status: 'playing',
      startedAt: room.startedAt.toISOString(),
    }), 7200); // 2小时过期

    return room;
  }

  /**
   * 获取房间信息
   */
  async getRoomInfo(roomCode: string): Promise<Room | null> {
    // 先从Redis获取
    const roomKey = REDIS_KEYS.ROOM_INFO(roomCode);
    const cached = await this.redisService.get(roomKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Redis没有则从数据库获取
    const room = await this.roomRepository.findOne({ where: { roomCode } });
    
    if (room && room.status !== 'finished') {
      // 重新缓存到Redis
      await this.redisService.set(roomKey, JSON.stringify(room), 3600);
    }

    return room;
  }

  /**
   * 结束房间
   */
  async finishRoom(roomCode: string, winnerId?: string): Promise<void> {
    const room = await this.roomRepository.findOne({ where: { roomCode } });

    if (!room) {
      throw new NotFoundException('房间不存在');
    }

    room.status = 'finished';
    room.winnerId = winnerId;
    room.finishedAt = new Date();

    await this.roomRepository.save(room);

    // 删除Redis缓存
    const roomKey = REDIS_KEYS.ROOM_INFO(roomCode);
    await this.redisService.del(roomKey);
  }

  /**
   * 离开房间（未开始的房间可以取消）
   */
  async leaveRoom(roomCode: string, userId: string): Promise<void> {
    const room = await this.roomRepository.findOne({ where: { roomCode } });

    if (!room) {
      throw new NotFoundException('房间不存在');
    }

    if (room.creatorId === userId && room.status === 'waiting') {
      // 创建者离开且游戏未开始，删除房间
      await this.roomRepository.delete(room.id);
      const roomKey = REDIS_KEYS.ROOM_INFO(roomCode);
      await this.redisService.del(roomKey);
    } else if (room.joinerId === userId && room.status === 'playing') {
      // 加入者离开，房间恢复等待状态
      room.joinerId = null;
      room.joinerNickname = null;
      room.status = 'waiting';
      room.startedAt = null;
      await this.roomRepository.save(room);

      // 更新Redis
      const roomKey = REDIS_KEYS.ROOM_INFO(roomCode);
      await this.redisService.set(roomKey, JSON.stringify({
        roomCode,
        creatorId: room.creatorId,
        creatorNickname: room.creatorNickname,
        status: 'waiting',
      }), 3600);
    }
  }
}

