import { PieceColor, GAME_CONFIG } from '@/common/constants/game.constants';

/**
 * 棋型评分（优化权重）
 */
const PATTERN_SCORES = {
  FIVE: 100000,       // 五连 - 必胜
  LIVE_FOUR: 50000,   // 活四 - 下一步必胜
  RUSH_FOUR: 8000,    // 冲四 - 必须防守
  LIVE_THREE: 3000,   // 活三 - 两步成五
  SLEEP_THREE: 800,   // 眠三
  LIVE_TWO: 300,      // 活二
  SLEEP_TWO: 50,      // 眠二
  
  // 组合棋型加分
  DOUBLE_LIVE_THREE: 20000,  // 双活三 - 必胜
  LIVE_THREE_RUSH_FOUR: 15000, // 活三+冲四 - 必胜
};

/**
 * 位置价值矩阵（中心位置更有价值）
 */
const POSITION_VALUE: number[][] = (() => {
  const size = 15;
  const board: number[][] = Array(size).fill(0).map(() => Array(size).fill(0));
  const center = Math.floor(size / 2);
  
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      // 距离中心越近，价值越高
      const distX = Math.abs(i - center);
      const distY = Math.abs(j - center);
      const dist = Math.max(distX, distY);
      board[i][j] = (center - dist) * 10;
    }
  }
  
  return board;
})();

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
          score += POSITION_VALUE[i][j]; // 位置价值
        } else if (board[i][j] === opponent) {
          score -= this.evaluatePosition(board, i, j, opponent);
          score -= POSITION_VALUE[i][j] * 0.8; // 对手位置价值稍微降低权重
        }
      }
    }

    // 检测组合棋型（双活三、活三冲四等必胜组合）
    score += this.evaluateComboPatterns(board, color);
    score -= this.evaluateComboPatterns(board, opponent) * 1.2; // 对手的威胁更危险

    return score;
  }
  
  /**
   * 评估组合棋型（双活三、活三+冲四等）
   * 优化：只检查已有棋子周围的关键位置
   */
  static evaluateComboPatterns(board: number[][], color: PieceColor): number {
    let score = 0;
    const checked = new Set<string>();
    
    // 只检查已有己方棋子周围2格内的空位
    for (let i = 0; i < GAME_CONFIG.BOARD_SIZE; i++) {
      for (let j = 0; j < GAME_CONFIG.BOARD_SIZE; j++) {
        if (board[i][j] === color) {
          // 检查周围2格
          for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
              const x = i + dx;
              const y = j + dy;
              const key = `${x},${y}`;
              
              if (
                x >= 0 && x < GAME_CONFIG.BOARD_SIZE &&
                y >= 0 && y < GAME_CONFIG.BOARD_SIZE &&
                board[x][y] === PieceColor.EMPTY &&
                !checked.has(key)
              ) {
                checked.add(key);
                
                // 尝试在这个位置放棋子
                board[x][y] = color;
                
                const liveThrees = this.countPattern(board, x, y, color, 'LIVE_THREE');
                const rushFours = this.countPattern(board, x, y, color, 'RUSH_FOUR');
                
                // 双活三或更多 = 必胜
                if (liveThrees >= 2) {
                  score += PATTERN_SCORES.DOUBLE_LIVE_THREE;
                }
                // 活三 + 冲四 = 必胜
                else if (liveThrees >= 1 && rushFours >= 1) {
                  score += PATTERN_SCORES.LIVE_THREE_RUSH_FOUR;
                }
                
                // 恢复
                board[x][y] = PieceColor.EMPTY;
              }
            }
          }
        }
      }
    }
    
    return score;
  }
  
  /**
   * 统计某个位置形成特定棋型的数量
   */
  static countPattern(board: number[][], x: number, y: number, color: PieceColor, patternType: string): number {
    let count = 0;
    const directions = [
      [0, 1],   // 横
      [1, 0],   // 竖
      [1, 1],   // 主对角
      [1, -1],  // 副对角
    ];

    for (const [dx, dy] of directions) {
      const pattern = this.getPattern(board, x, y, dx, dy, color);
      
      if (patternType === 'LIVE_THREE') {
        if (pattern.includes('01110') || pattern.includes('011010') || pattern.includes('010110')) {
          count++;
        }
      } else if (patternType === 'RUSH_FOUR') {
        if (
          pattern.includes('11110') || pattern.includes('01111') ||
          pattern.includes('11011') || pattern.includes('10111') || pattern.includes('11101')
        ) {
          count++;
        }
      }
    }
    
    return count;
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
   * 检查某个位置是否已经被有效防守
   * （如果对手的威胁已经被堵住一端，就不需要再堵另一端）
   */
  static isThreatenedLineBlocked(
    board: number[][],
    x: number,
    y: number,
    dx: number,
    dy: number,
    opponentColor: PieceColor
  ): boolean {
    // 检查这个方向是否有对手的连子
    let opponentCount = 0;
    let emptyCount = 0;
    let ourCount = 0;
    const myColor = opponentColor === PieceColor.BLACK ? PieceColor.WHITE : PieceColor.BLACK;
    
    // 检查这个方向的9个位置（-4到+4）
    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue;
      const nx = x + dx * i;
      const ny = y + dy * i;
      
      if (nx < 0 || nx >= GAME_CONFIG.BOARD_SIZE || ny < 0 || ny >= GAME_CONFIG.BOARD_SIZE) {
        continue;
      }
      
      if (board[nx][ny] === opponentColor) {
        opponentCount++;
      } else if (board[nx][ny] === myColor) {
        ourCount++;
      } else {
        emptyCount++;
      }
    }
    
    // 如果这个方向已经有我方棋子，说明已经有防守
    return ourCount > 0 && opponentCount >= 2;
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

