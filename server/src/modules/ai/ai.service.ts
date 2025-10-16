import { Injectable } from '@nestjs/common';
import { MinimaxAI } from './algorithms/minimax';
import { PieceColor, AIDifficulty, GAME_CONFIG } from '@/common/constants/game.constants';

@Injectable()
export class AIService {
  /**
   * 获取AI落子位置
   */
  getAIMove(board: number[][], difficulty: AIDifficulty, aiColor: PieceColor) {
    let depth: number;

    switch (difficulty) {
      case AIDifficulty.EASY:
        depth = GAME_CONFIG.AI_DEPTH_EASY;
        break;
      case AIDifficulty.MEDIUM:
        depth = GAME_CONFIG.AI_DEPTH_MEDIUM;
        break;
      case AIDifficulty.HARD:
        depth = GAME_CONFIG.AI_DEPTH_HARD;
        break;
      default:
        depth = GAME_CONFIG.AI_DEPTH_MEDIUM;
    }

    return MinimaxAI.getBestMove(board, depth, aiColor);
  }

  /**
   * 检查是否获胜
   */
  checkWin(board: number[][], x: number, y: number, color: number): boolean {
    return MinimaxAI.checkWin(board, x, y, color);
  }
}

