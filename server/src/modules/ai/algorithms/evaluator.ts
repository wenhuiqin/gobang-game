import { PieceColor, GAME_CONFIG } from '@/common/constants/game.constants';

/**
 * 棋型评分
 */
const PATTERN_SCORES = {
  FIVE: 100000,       // 五连 - 必胜
  LIVE_FOUR: 50000,   // 活四 - 下一步必胜
  RUSH_FOUR: 10000,   // 冲四 - 连4待补，提高权重！
  LIVE_THREE: 5000,   // 活三 - 两步成五
  SLEEP_THREE: 1000,  // 眠三
  LIVE_TWO: 500,      // 活二
  SLEEP_TWO: 100,     // 眠二
};

/**
 * 评估函数
 */
export class Evaluator {
  /**
   * 评估棋盘状态
   */
  static evaluate(board: number[][], color: PieceColor): number {
    let score = 0;
    const opponent = color === PieceColor.BLACK ? PieceColor.WHITE : PieceColor.BLACK;

    // 评估所有位置
    for (let i = 0; i < GAME_CONFIG.BOARD_SIZE; i++) {
      for (let j = 0; j < GAME_CONFIG.BOARD_SIZE; j++) {
        if (board[i][j] === color) {
          score += this.evaluatePosition(board, i, j, color);
        } else if (board[i][j] === opponent) {
          score -= this.evaluatePosition(board, i, j, opponent);
        }
      }
    }

    return score;
  }

  /**
   * 评估单个位置
   */
  static evaluatePosition(board: number[][], x: number, y: number, color: PieceColor): number {
    let score = 0;

    // 四个方向：横、竖、主对角、副对角
    const directions = [
      [0, 1],   // 横
      [1, 0],   // 竖
      [1, 1],   // 主对角
      [1, -1],  // 副对角
    ];

    for (const [dx, dy] of directions) {
      const pattern = this.getPattern(board, x, y, dx, dy, color);
      score += this.scorePattern(pattern);
    }

    return score;
  }

  /**
   * 获取某方向的棋型
   */
  static getPattern(
    board: number[][],
    x: number,
    y: number,
    dx: number,
    dy: number,
    color: PieceColor,
  ): string {
    let pattern = '';
    
    // 向负方向延伸4个位置
    for (let i = -4; i <= 4; i++) {
      const nx = x + dx * i;
      const ny = y + dy * i;
      
      if (nx < 0 || nx >= GAME_CONFIG.BOARD_SIZE || 
          ny < 0 || ny >= GAME_CONFIG.BOARD_SIZE) {
        pattern += 'X'; // 边界
      } else if (board[nx][ny] === color) {
        pattern += '1';
      } else if (board[nx][ny] === PieceColor.EMPTY) {
        pattern += '0';
      } else {
        pattern += 'X'; // 对方棋子
      }
    }

    return pattern;
  }

  /**
   * 根据棋型打分
   */
  static scorePattern(pattern: string): number {
    // 五连
    if (pattern.includes('11111')) {
      return PATTERN_SCORES.FIVE;
    }

    // 活四: 011110
    if (pattern.includes('011110')) {
      return PATTERN_SCORES.LIVE_FOUR;
    }

    // 冲四: 连4待补（只有一端可补或被挡住）
    // 包括所有4个棋子+1个空位的组合
    if (
      pattern.includes('11110') || pattern.includes('01111') ||  // 标准冲四
      pattern.includes('11011') || pattern.includes('10111') || pattern.includes('11101') ||  // 跳冲四
      pattern.includes('X1111') || pattern.includes('1111X')  // 被挡冲四（边界或对方）
    ) {
      return PATTERN_SCORES.RUSH_FOUR;
    }

    // 活三
    if (pattern.includes('01110') || pattern.includes('011010') || pattern.includes('010110')) {
      return PATTERN_SCORES.LIVE_THREE;
    }

    // 眠三
    if (pattern.includes('11100') || pattern.includes('00111') ||
        pattern.includes('10110') || pattern.includes('01101') ||
        pattern.includes('11010') || pattern.includes('01011')) {
      return PATTERN_SCORES.SLEEP_THREE;
    }

    // 活二
    if (pattern.includes('01100') || pattern.includes('00110') || pattern.includes('01010')) {
      return PATTERN_SCORES.LIVE_TWO;
    }

    // 眠二
    if (pattern.includes('11000') || pattern.includes('00011') ||
        pattern.includes('10100') || pattern.includes('00101') ||
        pattern.includes('10010') || pattern.includes('01001')) {
      return PATTERN_SCORES.SLEEP_TWO;
    }

    return 0;
  }
}

