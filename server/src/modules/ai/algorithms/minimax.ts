import { PieceColor, GAME_CONFIG } from '@/common/constants/game.constants';
import { Evaluator } from './evaluator';

export interface Move {
  x: number;
  y: number;
}

export interface MinimaxResult {
  score: number;
  move: Move | null;
}

/**
 * Minimax算法（带Alpha-Beta剪枝）
 */
export class MinimaxAI {
  /**
   * 检查游戏是否结束
   */
  private static isGameOver(board: number[][]): boolean {
    // 检查是否有五连
    for (let i = 0; i < GAME_CONFIG.BOARD_SIZE; i++) {
      for (let j = 0; j < GAME_CONFIG.BOARD_SIZE; j++) {
        if (board[i][j] !== PieceColor.EMPTY) {
          if (this.checkWin(board, i, j, board[i][j])) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * 检查某个位置是否形成五连
   */
  static checkWin(board: number[][], x: number, y: number, color: number): boolean {
    const directions = [
      [[0, 1], [0, -1]],   // 水平
      [[1, 0], [-1, 0]],   // 垂直
      [[1, 1], [-1, -1]],  // 主对角线
      [[1, -1], [-1, 1]],  // 副对角线
    ];

    for (const [dir1, dir2] of directions) {
      let count = 1;
      count += this.countDirection(board, x, y, dir1[0], dir1[1], color);
      count += this.countDirection(board, x, y, dir2[0], dir2[1], color);

      if (count >= GAME_CONFIG.WIN_COUNT) {
        return true;
      }
    }

    return false;
  }

  /**
   * 统计某方向连续棋子数
   */
  private static countDirection(
    board: number[][],
    x: number,
    y: number,
    dx: number,
    dy: number,
    color: number,
  ): number {
    let count = 0;
    let nx = x + dx;
    let ny = y + dy;

    while (
      nx >= 0 &&
      nx < GAME_CONFIG.BOARD_SIZE &&
      ny >= 0 &&
      ny < GAME_CONFIG.BOARD_SIZE &&
      board[nx][ny] === color
    ) {
      count++;
      nx += dx;
      ny += dy;
    }

    return count;
  }

  /**
   * 获取候选落子点（启发式搜索优化）
   */
  private static getCandidateMoves(board: number[][], aiColor: PieceColor): Move[] {
    const moves: Move[] = [];
    const visited = new Set<string>();

    // 只考虑已有棋子周围2格内的空位
    for (let i = 0; i < GAME_CONFIG.BOARD_SIZE; i++) {
      for (let j = 0; j < GAME_CONFIG.BOARD_SIZE; j++) {
        if (board[i][j] !== PieceColor.EMPTY) {
          // 检查周围2格
          for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
              const x = i + dx;
              const y = j + dy;
              const key = `${x},${y}`;

              if (
                x >= 0 &&
                x < GAME_CONFIG.BOARD_SIZE &&
                y >= 0 &&
                y < GAME_CONFIG.BOARD_SIZE &&
                board[x][y] === PieceColor.EMPTY &&
                !visited.has(key)
              ) {
                moves.push({ x, y });
                visited.add(key);
              }
            }
          }
        }
      }
    }

    // 如果是第一步，返回中心点
    if (moves.length === 0) {
      const center = Math.floor(GAME_CONFIG.BOARD_SIZE / 2);
      return [{ x: center, y: center }];
    }

    // 按评分排序（攻守平衡优化）
    return moves.sort((a, b) => {
      // 评估A位置的进攻价值
      board[a.x][a.y] = aiColor;
      const attackScoreA = Evaluator.evaluatePosition(board, a.x, a.y, aiColor);
      board[a.x][a.y] = PieceColor.EMPTY;
      
      // 评估A位置的防守价值
      const opponentColor = aiColor === PieceColor.BLACK ? PieceColor.WHITE : PieceColor.BLACK;
      board[a.x][a.y] = opponentColor;
      const defendScoreA = Evaluator.evaluatePosition(board, a.x, a.y, opponentColor);
      board[a.x][a.y] = PieceColor.EMPTY;
      
      // 综合评分：进攻权重1.2，防守权重0.8（鼓励进攻）
      const totalScoreA = attackScoreA * 1.2 + defendScoreA * 0.8;

      // 评估B位置
      board[b.x][b.y] = aiColor;
      const attackScoreB = Evaluator.evaluatePosition(board, b.x, b.y, aiColor);
      board[b.x][b.y] = PieceColor.EMPTY;
      
      board[b.x][b.y] = opponentColor;
      const defendScoreB = Evaluator.evaluatePosition(board, b.x, b.y, opponentColor);
      board[b.x][b.y] = PieceColor.EMPTY;
      
      const totalScoreB = attackScoreB * 1.2 + defendScoreB * 0.8;

      return totalScoreB - totalScoreA;
    }).slice(0, GAME_CONFIG.AI_MAX_CANDIDATES);
  }

  /**
   * Minimax算法主函数
   */
  static minimax(
    board: number[][],
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
    aiColor: PieceColor,
  ): MinimaxResult {
    // 终止条件
    if (depth === 0 || this.isGameOver(board)) {
      return {
        score: Evaluator.evaluate(board, aiColor),
        move: null,
      };
    }

    const moves = this.getCandidateMoves(board, aiColor);
    let bestMove: Move | null = null;

    if (isMaximizing) {
      let maxScore = -Infinity;

      for (const move of moves) {
        // 落子
        board[move.x][move.y] = aiColor;

        const result = this.minimax(board, depth - 1, alpha, beta, false, aiColor);

        // 撤销
        board[move.x][move.y] = PieceColor.EMPTY;

        if (result.score > maxScore) {
          maxScore = result.score;
          bestMove = move;
        }

        alpha = Math.max(alpha, maxScore);
        if (beta <= alpha) {
          break; // Beta剪枝
        }
      }

      return { score: maxScore, move: bestMove };
    } else {
      let minScore = Infinity;
      const opponentColor =
        aiColor === PieceColor.BLACK ? PieceColor.WHITE : PieceColor.BLACK;

      for (const move of moves) {
        // 落子
        board[move.x][move.y] = opponentColor;

        const result = this.minimax(board, depth - 1, alpha, beta, true, aiColor);

        // 撤销
        board[move.x][move.y] = PieceColor.EMPTY;

        if (result.score < minScore) {
          minScore = result.score;
          bestMove = move;
        }

        beta = Math.min(beta, minScore);
        if (beta <= alpha) {
          break; // Alpha剪枝
        }
      }

      return { score: minScore, move: bestMove };
    }
  }

  /**
   * 获取所有候选位置（不限制数量，用于必杀检测）
   */
  private static getAllCandidateMoves(board: number[][]): Move[] {
    const moves: Move[] = [];
    const visited = new Set<string>();

    // 遍历所有已有棋子周围2格内的空位（不做数量限制）
    for (let i = 0; i < GAME_CONFIG.BOARD_SIZE; i++) {
      for (let j = 0; j < GAME_CONFIG.BOARD_SIZE; j++) {
        if (board[i][j] !== PieceColor.EMPTY) {
          // 检查周围2格
          for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
              const x = i + dx;
              const y = j + dy;
              const key = `${x},${y}`;

              if (
                x >= 0 &&
                x < GAME_CONFIG.BOARD_SIZE &&
                y >= 0 &&
                y < GAME_CONFIG.BOARD_SIZE &&
                board[x][y] === PieceColor.EMPTY &&
                !visited.has(key)
              ) {
                moves.push({ x, y });
                visited.add(key);
              }
            }
          }
        }
      }
    }

    // 如果是第一步，返回中心点
    if (moves.length === 0) {
      const center = Math.floor(GAME_CONFIG.BOARD_SIZE / 2);
      return [{ x: center, y: center }];
    }

    return moves;
  }

  /**
   * 检查是否有必杀位置（能立即获胜的位置）
   */
  private static findWinningMove(board: number[][], color: PieceColor): Move | null {
    // 使用不限制数量的候选位置列表
    const moves = this.getAllCandidateMoves(board);
    
    console.log(`🔍 检查${color === PieceColor.BLACK ? '黑方' : '白方'}的必杀位置，候选数: ${moves.length}`);
    
    for (const move of moves) {
      // 尝试下这一步
      board[move.x][move.y] = color;
      
      // 检查是否获胜
      if (this.checkWin(board, move.x, move.y, color)) {
        board[move.x][move.y] = PieceColor.EMPTY;
        console.log(`✅ 找到必杀位置: (${move.x}, ${move.y})`);
        return move;
      }
      
      // 撤销
      board[move.x][move.y] = PieceColor.EMPTY;
    }
    
    console.log(`❌ 未找到必杀位置`);
    return null;
  }

  /**
   * 检查是否能形成活四（两步必杀）
   */
  private static findLiveFourMove(board: number[][], color: PieceColor): Move | null {
    const moves = this.getAllCandidateMoves(board);
    
    console.log(`🔍 检查${color === PieceColor.BLACK ? '黑方' : '白方'}的活四位置，候选数: ${moves.length}`);
    
    for (const move of moves) {
      // 尝试下这一步
      board[move.x][move.y] = color;
      
      // 检查下完后，是否有两个以上的位置可以赢
      let winCount = 0;
      const testMoves = this.getAllCandidateMoves(board);
      
      for (const testMove of testMoves) {
        board[testMove.x][testMove.y] = color;
        if (this.checkWin(board, testMove.x, testMove.y, color)) {
          winCount++;
          if (winCount >= 2) {
            // 找到活四！撤销所有尝试
            board[testMove.x][testMove.y] = PieceColor.EMPTY;
            board[move.x][move.y] = PieceColor.EMPTY;
            console.log(`⚡ 找到活四位置: (${move.x}, ${move.y}) - 形成${winCount}个必杀点`);
            return move;
          }
        }
        board[testMove.x][testMove.y] = PieceColor.EMPTY;
      }
      
      // 撤销
      board[move.x][move.y] = PieceColor.EMPTY;
    }
    
    console.log(`❌ 未找到活四位置`);
    return null;
  }

  /**
   * 获取AI落子（带迭代加深和时间控制）
   */
  static getBestMove(board: number[][], depth: number, aiColor: PieceColor): Move | null {
    const opponentColor = aiColor === PieceColor.BLACK ? PieceColor.WHITE : PieceColor.BLACK;
    
    console.log(`🤖 AI开始思考，目标深度: ${depth}`);
    const startTime = Date.now();
    
    // 1. 优先检查AI是否有必杀位置（能立即获胜）
    const winningMove = this.findWinningMove(board, aiColor);
    if (winningMove) {
      console.log(`🎯 发现必杀位置！用时: ${Date.now() - startTime}ms`, winningMove);
      return winningMove;
    }
    
    // 2. 检查对手是否有必杀位置（必须防守）
    const defendMove = this.findWinningMove(board, opponentColor);
    if (defendMove) {
      console.log(`🛡️ 防守对手必杀位置！用时: ${Date.now() - startTime}ms`, defendMove);
      return defendMove;
    }
    
    // 3. 检查AI是否能形成活四（两步必杀）
    const liveFourMove = this.findLiveFourMove(board, aiColor);
    if (liveFourMove) {
      console.log(`⚡ 发现活四机会！用时: ${Date.now() - startTime}ms`, liveFourMove);
      return liveFourMove;
    }
    
    // 4. 检查对手是否能形成活四（必须防守）
    const defendLiveFourMove = this.findLiveFourMove(board, opponentColor);
    if (defendLiveFourMove) {
      console.log(`🛡️ 防守对手活四！用时: ${Date.now() - startTime}ms`, defendLiveFourMove);
      return defendLiveFourMove;
    }
    
    // 5. 使用迭代加深搜索（逐步增加深度，带时间控制）
    let bestMove: Move | null = null;
    const timeout = GAME_CONFIG.AI_TIMEOUT;
    
    // 从深度1开始逐步加深
    for (let currentDepth = 1; currentDepth <= depth; currentDepth++) {
      const elapsed = Date.now() - startTime;
      
      // 检查是否超时
      if (elapsed > timeout * 0.9) {
        console.log(`⏱️ 接近超时，停止在深度 ${currentDepth - 1}，用时: ${elapsed}ms`);
        break;
      }
      
      try {
        const result = this.minimax(board, currentDepth, -Infinity, Infinity, true, aiColor);
        if (result.move) {
          bestMove = result.move;
          console.log(`✅ 深度 ${currentDepth} 完成，当前最佳: (${bestMove.x}, ${bestMove.y}), 用时: ${Date.now() - startTime}ms`);
        }
      } catch (error) {
        console.error(`❌ 深度 ${currentDepth} 搜索出错:`, error);
        break;
      }
      
      // 如果已经达到目标深度，退出
      if (currentDepth >= depth) {
        break;
      }
    }
    
    const totalTime = Date.now() - startTime;
    console.log(`🏁 AI思考完成，总用时: ${totalTime}ms，最终选择: (${bestMove?.x}, ${bestMove?.y})`);
    
    return bestMove;
  }
}

