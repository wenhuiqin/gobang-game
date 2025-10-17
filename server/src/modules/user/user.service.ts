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
   * @param limit 返回数量
   * @param type 排行榜类型: online | ai-easy | ai-medium | ai-hard
   */
  async getLeaderboard(limit: number = 50, type: string = 'online') {
    const { gameType, aiDifficulty } = this.parseRankType(type);
    
    // 从game_records表中统计战绩
    const query = this.userRepository
      .createQueryBuilder('user')
      .leftJoin(
        'game_records',
        'gr',
        'gr.black_player_id = user.id OR gr.white_player_id = user.id',
      )
      .where('gr.game_type = :gameType', { gameType });
    
    // 如果是人机对战，添加难度筛选
    if (aiDifficulty) {
      query.andWhere('gr.ai_difficulty = :aiDifficulty', { aiDifficulty });
    }
    
    const users = await query
      .select([
        'user.id',
        'user.nickname',
        'user.avatarUrl',
        'COUNT(gr.id) as total_games',
        'SUM(CASE WHEN gr.winner_id = user.id THEN 1 ELSE 0 END) as win_games',
      ])
      .groupBy('user.id')
      .having('total_games > 0')
      .orderBy('win_games', 'DESC')
      .addOrderBy('total_games', 'ASC')
      .limit(limit)
      .getRawMany();
    
    // 计算连胜和胜率
    const enrichedUsers = await Promise.all(
      users.map(async (user, index) => {
        const totalGames = parseInt(user.total_games);
        const winGames = parseInt(user.win_games);
        const loseGames = totalGames - winGames;
        
        // 计算最高连胜
        const maxWinStreak = await this.calculateMaxWinStreak(
          user.user_id,
          gameType,
          aiDifficulty,
        );
        
        return {
          id: user.user_id,
          nickname: user.user_nickname,
          avatarUrl: user.user_avatarUrl,
          totalGames,
          winGames,
          loseGames,
          drawGames: 0,
          maxWinStreak,
          rank: index + 1,
          winRate: totalGames > 0
            ? parseFloat(((winGames / totalGames) * 100).toFixed(2))
            : 0,
        };
      }),
    );
    
    return enrichedUsers;
  }

  /**
   * 解析排行榜类型
   */
  private parseRankType(type: string): { gameType: number; aiDifficulty?: number } {
    switch (type) {
      case 'online':
        return { gameType: 1 }; // 随机匹配/在线对战
      case 'ai-easy':
        return { gameType: 2, aiDifficulty: 1 };
      case 'ai-medium':
        return { gameType: 2, aiDifficulty: 2 };
      case 'ai-hard':
        return { gameType: 2, aiDifficulty: 3 };
      default:
        return { gameType: 1 };
    }
  }

  /**
   * 计算最高连胜
   */
  private async calculateMaxWinStreak(
    userId: string,
    gameType: number,
    aiDifficulty?: number,
  ): Promise<number> {
    // TODO: 实现连胜计算逻辑
    // 这里暂时返回0，后续可以优化
    return 0;
  }
}

