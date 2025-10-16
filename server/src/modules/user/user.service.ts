import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { ERROR_CODES } from '@/common/constants/error-codes.constants';
import { GAME_CONFIG } from '@/common/constants/game.constants';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * 根据openid查找用户
   */
  async findByOpenid(openid: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { openid } });
  }

  /**
   * 根据ID查找用户
   */
  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.USER_NOT_FOUND,
        message: '用户不存在',
      });
    }
    return user;
  }

  /**
   * 创建新用户
   */
  async create(data: {
    openid: string;
    unionid?: string;
    nickname: string;
    avatarUrl?: string;
  }): Promise<User> {
    const user = this.userRepository.create({
      ...data,
      lastLoginAt: new Date(),
    });
    return this.userRepository.save(user);
  }

  /**
   * 更新用户信息
   */
  async update(id: string, data: Partial<User>): Promise<User> {
    await this.userRepository.update(id, data);
    return this.findById(id);
  }

  /**
   * 更新最后登录时间
   */
  async updateLastLogin(id: string): Promise<void> {
    await this.userRepository.update(id, { lastLoginAt: new Date() });
  }

  /**
   * 更新用户战绩
   */
  async updateGameStats(
    userId: string,
    result: 'win' | 'lose' | 'draw',
    ratingChange: number,
  ): Promise<void> {
    const user = await this.findById(userId);

    const updates: Partial<User> = {
      totalGames: user.totalGames + 1,
      rating: user.rating + ratingChange,
    };

    if (result === 'win') {
      updates.winGames = user.winGames + 1;
      updates.winStreak = user.winStreak + 1;
      updates.maxWinStreak = Math.max(
        user.maxWinStreak,
        user.winStreak + 1,
      );
      updates.exp = user.exp + GAME_CONFIG.EXP_PER_WIN;
    } else if (result === 'lose') {
      updates.loseGames = user.loseGames + 1;
      updates.winStreak = 0;
      updates.exp = user.exp + GAME_CONFIG.EXP_PER_LOSE;
    } else {
      updates.drawGames = user.drawGames + 1;
      updates.exp = user.exp + GAME_CONFIG.EXP_PER_DRAW;
    }

    await this.userRepository.update(userId, updates);
  }

  /**
   * 获取用户战绩历史
   */
  async getHistory(userId: string, page: number, limit: number) {
    const [records, total] = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('game_records', 'gr', 
        'gr.black_player_id = user.id OR gr.white_player_id = user.id')
      .where('user.id = :userId', { userId })
      .orderBy('gr.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      total,
      page,
      limit,
      records,
    };
  }

  /**
   * 获取排行榜
   */
  async getLeaderboard(limit: number = 50) {
    const users = await this.userRepository.find({
      order: {
        rating: 'DESC',
        winGames: 'DESC',
        totalGames: 'ASC',
      },
      take: limit,
      select: [
        'id',
        'nickname',
        'avatarUrl',
        'rating',
        'level',
        'totalGames',
        'winGames',
        'loseGames',
        'drawGames',
        'winStreak',
        'maxWinStreak',
      ],
    });

    return users.map((user, index) => ({
      ...user,
      rank: index + 1,
      winRate: user.totalGames > 0
        ? parseFloat(((user.winGames / user.totalGames) * 100).toFixed(2))
        : 0,
    }));
  }
}

