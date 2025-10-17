/**
 * 游戏配置
 * 严格遵循禁止硬编码原则
 */

module.exports = {
  // 版本信息
  VERSION: '1.0.30', // 版本号，每次发布更新
  
  // 微信小游戏配置
  WECHAT_APP_ID: 'wx4379feb1257bd826',
  
  // 服务器配置
  API_BASE_URL: 'https://gobang.ai-image-tools.top',
  WS_BASE_URL: 'wss://gobang.ai-image-tools.top/game',
  
  // 游戏配置
  BOARD_SIZE: 15,           // 棋盘大小
  CELL_SIZE: 25,            // 单元格大小
  PIECE_RADIUS: 11,         // 棋子半径
  WIN_COUNT: 5,             // 获胜连子数
  
  // 颜色配置
  COLORS: {
    BOARD: '#D4A76A',       // 棋盘颜色
    LINE: '#000000',        // 线条颜色
    BLACK_PIECE: '#000000', // 黑子
    WHITE_PIECE: '#FFFFFF', // 白子
    BACKGROUND: '#F5F5F5',  // 背景色
  },
  
  // 棋子类型
  PIECE: {
    EMPTY: 0,
    BLACK: 1,
    WHITE: 2,
  },
  
  // 游戏类型
  GAME_TYPE: {
    AI: 2,
    FRIEND: 3,
  },
  
  // AI难度
  AI_DIFFICULTY: {
    EASY: 1,
    MEDIUM: 2,
    HARD: 3,
  },
};

