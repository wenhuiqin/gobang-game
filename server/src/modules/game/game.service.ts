import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameRecord } from './entities/game-record.entity';
import { AIService } from '../ai/ai.service';
import { UserService } from '../user/user.service';
import { RedisService } from '@/shared/redis/redis.service';
import { 
  GAME_CONFIG, 
  GameType, 
  GameResult, 
  PieceColor,
  AIDifficulty 
} from '@/common/constants/game.constants';
import { REDIS_KEYS } from '@/common/constants/redis-keys.constants';

export interface GameState {
  roomId: string;
  gameType: GameType;
  board: number[][];
  blackPlayerId: string;
  whitePlayerId: string;
  currentTurn: PieceColor;
  turnStartTime: number;
  moves: Array<{ x: number; y: number; color: PieceColor; timestamp: number }>;
  aiDifficulty?: AIDifficulty;
}

@Injectable()
export class GameService {
  constructor(
    @InjectRepository(GameRecord)
    private gameRecordRepository: Repository<GameRecord>,
    private aiService: AIService,
    private userService: UserService,
    private redisService: RedisService,
  ) {}

  /**
   * 创建新游戏
   */
  async createGame(
    roomId: string,
    gameType: GameType,
    blackPlayerId: string,
    whitePlayerId: string,
    aiDifficulty?: AIDifficulty,
  ): Promise<GameState> {
    const board = Array(GAME_CONFIG.BOARD_SIZE)
      .fill(null)
      .map(() => Array(GAME_CONFIG.BOARD_SIZE).fill(PieceColor.EMPTY));

    const gameState: GameState = {
      roomId,
      gameType,
      board,
      blackPlayerId,
      whitePlayerId,
      currentTurn: PieceColor.BLACK,
      turnStartTime: Date.now(),
      moves: [],
      aiDifficulty,
    };

    // 保存到Redis
    await this.saveGameState(roomId, gameState);

    return gameState;
  }

  /**
   * 落子
   */
  async makeMove(
    roomId: string,
    userId: string,
    x: number,
    y: number,
  ): Promise<{
    success: boolean;
    gameState: GameState;
    isWin: boolean;
    winner?: string;
  }> {
    const gameState = await this.getGameState(roomId);

    // 验证是否轮到该玩家
    const playerColor =
      userId === gameState.blackPlayerId ? PieceColor.BLACK : PieceColor.WHITE;
    
    if (playerColor !== gameState.currentTurn) {
      throw new Error('Not your turn');
    }

    // 验证位置是否为空
    if (gameState.board[x][y] !== PieceColor.EMPTY) {
      throw new Error('Position occupied');
    }

    // 落子
    gameState.board[x][y] = playerColor;
    gameState.moves.push({
      x,
      y,
      color: playerColor,
      timestamp: Date.now(),
    });

    // 检查是否获胜
    const isWin = this.aiService.checkWin(gameState.board, x, y, playerColor);

    if (isWin) {
      // 游戏结束
      await this.finishGame(roomId, userId, GameResult.BLACK_WIN);
      return {
        success: true,
        gameState,
        isWin: true,
        winner: userId,
      };
    }

    // 切换回合
    gameState.currentTurn =
      playerColor === PieceColor.BLACK ? PieceColor.WHITE : PieceColor.BLACK;
    gameState.turnStartTime = Date.now();

    // 保存状态
    await this.saveGameState(roomId, gameState);

    return {
      success: true,
      gameState,
      isWin: false,
    };
  }

  /**
   * AI落子
   */
  async aiMove(roomId: string): Promise<{ x: number; y: number } | null> {
    const gameState = await this.getGameState(roomId);

    if (!gameState.aiDifficulty) {
      return null;
    }

    const move = this.aiService.getAIMove(
      gameState.board,
      gameState.aiDifficulty,
      gameState.currentTurn,
    );

    if (!move) {
      return null;
    }

    // AI落子
    gameState.board[move.x][move.y] = gameState.currentTurn;
    gameState.moves.push({
      x: move.x,
      y: move.y,
      color: gameState.currentTurn,
      timestamp: Date.now(),
    });

    // 检查是否获胜
    const isWin = this.aiService.checkWin(
      gameState.board,
      move.x,
      move.y,
      gameState.currentTurn,
    );

    if (isWin) {
      const winnerId = gameState.currentTurn === PieceColor.BLACK 
        ? gameState.blackPlayerId 
        : gameState.whitePlayerId;
      await this.finishGame(roomId, winnerId, GameResult.BLACK_WIN);
    } else {
      // 切换回合
      gameState.currentTurn =
        gameState.currentTurn === PieceColor.BLACK
          ? PieceColor.WHITE
          : PieceColor.BLACK;
      gameState.turnStartTime = Date.now();
    }

    await this.saveGameState(roomId, gameState);

    return move;
  }

  /**
   * 结束游戏
   */
  async finishGame(
    roomId: string,
    winnerId: string,
    result: GameResult,
  ): Promise<void> {
    const gameState = await this.getGameState(roomId);
    
    const startedAt = new Date(gameState.moves[0]?.timestamp || Date.now());
    const endedAt = new Date();
    const duration = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);

    // 保存游戏记录
    const gameRecord = this.gameRecordRepository.create({
      roomId,
      gameType: gameState.gameType,
      blackPlayerId: gameState.blackPlayerId,
      whitePlayerId: gameState.whitePlayerId,
      winnerId,
      gameResult: result,
      totalSteps: gameState.moves.length,
      duration,
      gameData: JSON.stringify(gameState.moves),
      aiDifficulty: gameState.aiDifficulty,
      startedAt,
      endedAt,
    });

    await this.gameRecordRepository.save(gameRecord);

    // 更新用户战绩
    if (gameState.gameType !== GameType.AI_GAME) {
      // 玩家对战才更新战绩
      const isBlackWin = winnerId === gameState.blackPlayerId;
      
      await this.userService.updateGameStats(
        gameState.blackPlayerId,
        isBlackWin ? 'win' : 'lose',
        isBlackWin ? 20 : -10,
      );

      await this.userService.updateGameStats(
        gameState.whitePlayerId,
        isBlackWin ? 'lose' : 'win',
        isBlackWin ? -10 : 20,
      );
    }

    // 删除Redis中的游戏状态
    await this.redisService.del(REDIS_KEYS.ROOM_INFO(roomId));
  }

  /**
   * 保存游戏状态到Redis
   */
  private async saveGameState(roomId: string, gameState: GameState): Promise<void> {
    const key = REDIS_KEYS.ROOM_INFO(roomId);
    await this.redisService.set(
      key,
      JSON.stringify(gameState),
      GAME_CONFIG.ROOM_EXPIRE_TIME / 1000,
    );
  }

  /**
   * 从Redis获取游戏状态
   */
  private async getGameState(roomId: string): Promise<GameState> {
    const key = REDIS_KEYS.ROOM_INFO(roomId);
    const data = await this.redisService.get(key);
    
    if (!data) {
      throw new Error('Game not found');
    }

    return JSON.parse(data);
  }

  /**
   * 记录人机对战结果
   */
  async recordAIGame(
    userId: number,
    playerWon: boolean,
    difficulty: number,
    playerColor: number,
    totalSteps: number,
  ): Promise<void> {
    const roomId = `ai-${userId}-${Date.now()}`;
    const startedAt = new Date(Date.now() - totalSteps * 1000); // 估算开始时间
    const endedAt = new Date();
    
    // 确定黑白双方
    const isPlayerBlack = playerColor === PieceColor.BLACK;
    const blackPlayerId = isPlayerBlack ? String(userId) : null;
    const whitePlayerId = isPlayerBlack ? null : String(userId);
    
    // 确定获胜者
    const winnerId = playerWon ? String(userId) : null;
    
    // 确定游戏结果
    let gameResult: GameResult;
    if (playerWon) {
      gameResult = isPlayerBlack ? GameResult.BLACK_WIN : GameResult.WHITE_WIN;
    } else {
      gameResult = isPlayerBlack ? GameResult.WHITE_WIN : GameResult.BLACK_WIN;
    }
    
    // 保存游戏记录
    const gameRecord = this.gameRecordRepository.create({
      roomId,
      gameType: GameType.AI_GAME,
      blackPlayerId,
      whitePlayerId,
      winnerId,
      gameResult,
      totalSteps,
      duration: Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
      gameData: null,
      aiDifficulty: difficulty as AIDifficulty,
      startedAt,
      endedAt,
    });

    await this.gameRecordRepository.save(gameRecord);

    // 更新用户统计数据（不更新rating）
    await this.userService.updateGameStats(
      String(userId),
      playerWon ? 'win' : 'lose',
      0, // 不再更新rating
    );
    
    console.log(`✅ 人机对战结果已记录: 用户${userId} ${playerWon ? '胜利' : '失败'}`);
  }
}

