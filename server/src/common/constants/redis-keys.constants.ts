/**
 * Redis Key 命名规范
 * 格式：模块:功能:参数
 */
export const REDIS_KEYS = {
  // 在线用户
  ONLINE_USERS: 'online:users',
  
  // 匹配队列
  MATCH_QUEUE: 'match:queue',
  
  // 房间信息
  ROOM_INFO: (roomId: string) => `room:${roomId}:info`,
  
  // 用户Socket映射
  USER_SOCKET: (userId: string) => `user:${userId}:socket`,
  
  // 排行榜缓存
  LEADERBOARD: (type: string, period: string) => `leaderboard:${type}:${period}`,
  
  // 游戏房间映射
  GAME_ROOM: (gameId: string) => `game:${gameId}:room`,
  
  // 用户当前游戏
  USER_CURRENT_GAME: (userId: string) => `user:${userId}:current_game`,
} as const;

