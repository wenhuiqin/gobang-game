/**
 * 游戏配置常量
 * 禁止在代码中直接使用数字，必须使用此处定义的常量
 */
export const GAME_CONFIG = {
  // 棋盘配置
  BOARD_SIZE: 15,                    // 棋盘大小 15x15
  WIN_COUNT: 5,                      // 胜利所需连子数
  
  // 时间配置（毫秒）
  TURN_TIMEOUT: 30 * 1000,           // 每步超时时间 30秒
  TURN_WARNING_TIME: 10 * 1000,      // 超时警告时间 10秒
  MATCH_TIMEOUT: 30 * 1000,          // 匹配超时时间 30秒
  ROOM_EXPIRE_TIME: 30 * 60 * 1000,  // 房间过期时间 30分钟
  
  // 匹配配置
  MATCH_RATING_DIFF_BASE: 100,       // 基础评分差
  MATCH_RATING_DIFF_INCREMENT: 10,   // 每秒增加的评分差
  
  // AI配置
  AI_DEPTH_EASY: 2,                  // 简单AI深度（快速响应，新手友好）
  AI_DEPTH_MEDIUM: 4,                // 中等AI深度（平衡性能，适合大多数玩家）
  AI_DEPTH_HARD: 6,                  // 困难AI深度（有挑战性，高手对决）
  AI_MAX_CANDIDATES: 12,             // 候选位置最大数量（优化搜索速度）
  
  // 评分配置
  RATING_DEFAULT: 1000,              // 默认评分
  RATING_K_FACTOR: 32,               // ELO K因子
  
  // 经验配置
  EXP_PER_WIN: 50,                   // 胜利经验
  EXP_PER_LOSE: 20,                  // 失败经验
  EXP_PER_DRAW: 30,                  // 平局经验
} as const;

/**
 * 游戏类型枚举
 */
export enum GameType {
  RANDOM_MATCH = 1,  // 随机匹配
  AI_GAME = 2,       // 人机对战
  FRIEND_GAME = 3,   // 好友对战
}

/**
 * 游戏结果枚举
 */
export enum GameResult {
  BLACK_WIN = 1,      // 黑方胜
  WHITE_WIN = 2,      // 白方胜
  DRAW = 3,           // 平局
  BLACK_TIMEOUT = 4,  // 黑方超时
  WHITE_TIMEOUT = 5,  // 白方超时
}

/**
 * 棋子颜色枚举
 */
export enum PieceColor {
  EMPTY = 0,   // 空位
  BLACK = 1,   // 黑子
  WHITE = 2,   // 白子
}

/**
 * 房间状态枚举
 */
export enum RoomStatus {
  WAITING = 1,    // 等待中
  PLAYING = 2,    // 进行中
  FINISHED = 3,   // 已结束
}

/**
 * AI难度枚举
 */
export enum AIDifficulty {
  EASY = 1,    // 简单
  MEDIUM = 2,  // 中等
  HARD = 3,    // 困难
}

