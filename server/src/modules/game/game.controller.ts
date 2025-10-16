import { Controller, Post, Body } from '@nestjs/common';
import { AIService } from '../ai/ai.service';
import { PieceColor } from '@/common/constants/game.constants';

@Controller('api/game')
export class GameController {
  constructor(private readonly aiService: AIService) {}

  /**
   * AI落子（用于人机对战）
   */
  @Post('ai-move')
  async getAIMove(
    @Body() body: { board: number[][]; difficulty: number; aiColor?: number },
  ) {
    const { board, difficulty, aiColor } = body;

    // 验证参数
    if (!board || !Array.isArray(board) || !difficulty) {
      return {
        code: 400,
        message: '参数错误',
      };
    }

    try {
      // 打印接收到的棋盘
      console.log('=== AI Move Request ===');
      console.log('难度:', difficulty);
      console.log('棋盘大小:', board.length, 'x', board[0]?.length);
      
      // 统计棋盘上的棋子
      let blackCount = 0;
      let whiteCount = 0;
      const pieces: string[] = [];
      for (let i = 0; i < board.length; i++) {
        for (let j = 0; j < board[i].length; j++) {
          if (board[i][j] === 1) {
            blackCount++;
            pieces.push(`(${i},${j})=黑`);
          } else if (board[i][j] === 2) {
            whiteCount++;
            pieces.push(`(${i},${j})=白`);
          }
        }
      }
      console.log('黑子数量:', blackCount);
      console.log('白子数量:', whiteCount);
      console.log('棋子位置:', pieces.join(', '));
      
      // AI颜色：使用传入的aiColor，如果未传入则默认为白方（向后兼容）
      const aiPieceColor = aiColor || PieceColor.WHITE;
      console.log('AI颜色:', aiPieceColor === PieceColor.BLACK ? '黑' : '白');
      
      // 调用AI服务获取最佳落子位置
      const move = this.aiService.getAIMove(
        board,
        difficulty,
        aiPieceColor,
      );
      
      console.log('AI决定:', move);
      console.log('======================');

      if (!move) {
        return {
          code: 500,
          message: 'AI无法找到合适的落子位置',
        };
      }

      return {
        code: 0,
        message: '成功',
        data: {
          position: move,
        },
      };
    } catch (error) {
      console.error('AI移动错误:', error);
      return {
        code: 500,
        message: 'AI计算失败',
      };
    }
  }
}

