import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { WebSocketServer, WebSocket } from 'ws';
import { RedisService } from '@/shared/redis/redis.service';
import { UserService } from '../user/user.service';
import { GameService } from './game.service';
import { REDIS_KEYS } from '@/common/constants/redis-keys.constants';
import { GameType, GameResult } from '@/common/constants/game.constants';
import * as url from 'url';

interface WebSocketClient extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

@Injectable()
export class WebSocketService implements OnModuleInit {
  private wss: WebSocketServer;
  private readonly logger = new Logger(WebSocketService.name);
  private clients: Map<string, WebSocketClient> = new Map();

  constructor(
    private readonly redisService: RedisService,
    private readonly userService: UserService,
    private readonly gameService: GameService,
  ) {}

  onModuleInit() {
    this.wss = new WebSocketServer({ port: 3001, path: '/game' });
    this.logger.log('🔌 WebSocket服务启动在端口 3001');

    this.wss.on('connection', (ws: WebSocketClient, req) => {
      const params = url.parse(req.url, true).query;
      const userId = params.userId as string;

      if (!userId) {
        this.logger.warn('客户端连接缺少userId');
        ws.close();
        return;
      }

      ws.userId = userId;
      ws.isAlive = true;
      this.clients.set(userId, ws);

      this.logger.log(`用户连接: userId=${userId}`);

      // 保存用户Socket映射到Redis
      this.redisService.set(REDIS_KEYS.USER_SOCKET(userId), userId, 3600);
      this.redisService.sadd(REDIS_KEYS.ONLINE_USERS, userId);

      // 发送连接成功消息
      this.send(ws, 'connected', { userId });

      // 监听消息
      ws.on('message', async (data: string) => {
        try {
          const message = JSON.parse(data);
          this.logger.log(`收到消息: ${message.event} from ${userId}`);
          await this.handleMessage(ws, message);
        } catch (err) {
          this.logger.error('消息解析错误:', err);
        }
      });

      // 监听心跳
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // 监听断开
      ws.on('close', () => {
        this.handleDisconnect(userId);
      });
    });

    // 心跳检测
    setInterval(() => {
      this.wss.clients.forEach((ws: WebSocketClient) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
    
    // 定期清理匹配队列中的断线用户（每10秒一次）
    setInterval(async () => {
      try {
        const queueData = await this.redisService.lrange(REDIS_KEYS.MATCH_QUEUE, 0, -1);
        let cleanedCount = 0;
        
        for (const item of queueData) {
          try {
            const player = JSON.parse(item);
            const userId = String(player.userId);
            const client = this.clients.get(userId);
            
            // 如果用户不在线或连接已断开，从队列中移除
            if (!client || client.readyState !== 1) {
              await this.redisService.lrem(REDIS_KEYS.MATCH_QUEUE, 1, item);
              cleanedCount++;
            }
          } catch (err) {
            // 数据格式错误，直接移除
            await this.redisService.lrem(REDIS_KEYS.MATCH_QUEUE, 1, item);
            cleanedCount++;
          }
        }
        
        if (cleanedCount > 0) {
          this.logger.log(`🧹 清理了 ${cleanedCount} 个断线用户，当前队列长度: ${queueData.length - cleanedCount}`);
        }
      } catch (err) {
        this.logger.error('清理匹配队列错误:', err);
      }
    }, 10000);
  }

  /**
   * 处理消息
   */
  private async handleMessage(ws: WebSocketClient, message: any) {
    const { event, data } = message;

    switch (event) {
      case 'joinMatch':
        await this.handleJoinMatch(ws, data);
        break;
      case 'cancelMatch':
        await this.handleCancelMatch(ws, data);
        break;
      case 'makeMove':
        await this.handleMakeMove(ws, data);
        break;
      case 'surrender':
        await this.handleSurrender(ws, data);
        break;
      case 'requestBoardSync':
        await this.handleBoardSync(ws, data);
        break;
      case 'restartGame':
        await this.handleRestartGame(ws, data);
        break;
      case 'restartGameResponse':
        await this.handleRestartGameResponse(ws, data);
        break;
      default:
        this.logger.warn(`未知事件: ${event}`);
    }
  }

  /**
   * 加入匹配队列
   */
  private async handleJoinMatch(ws: WebSocketClient, data: any) {
    const { userId, rating } = data;
    
    // 确保 userId 是字符串类型
    const userIdStr = String(userId);

    this.logger.log(`📥 收到加入匹配请求: userId=${userIdStr}, rating=${rating}`);

    // 检查是否已在队列中，如果在则先移除（避免重复）
    const queueData = await this.redisService.lrange(REDIS_KEYS.MATCH_QUEUE, 0, -1);
    for (const item of queueData) {
      try {
        const parsed = JSON.parse(item);
        // 比较时也转换为字符串
        if (String(parsed.userId) === userIdStr) {
          await this.redisService.lrem(REDIS_KEYS.MATCH_QUEUE, 1, item);
          this.logger.log(`移除用户的旧匹配请求: userId=${userIdStr}`);
          break;
        }
      } catch (err) {
        this.logger.error('解析队列数据错误:', err);
      }
    }

    // 加入队列（使用字符串类型的 userId）
    await this.redisService.rpush(
      REDIS_KEYS.MATCH_QUEUE,
      JSON.stringify({ userId: userIdStr, rating, timestamp: Date.now() })
    );

    this.send(ws, 'matchJoined', { message: '已加入匹配队列' });

    // 延迟50ms后尝试匹配（减少等待时间）
    setTimeout(() => {
      this.tryMatch();
    }, 50);
  }

  /**
   * 取消匹配
   */
  private async handleCancelMatch(ws: WebSocketClient, data: any) {
    const { userId } = data;
    
    // 确保 userId 是字符串类型
    const userIdStr = String(userId);

    this.logger.log(`用户取消匹配: userId=${userIdStr}`);

    const queueData = await this.redisService.lrange(REDIS_KEYS.MATCH_QUEUE, 0, -1);
    for (const item of queueData) {
      const parsed = JSON.parse(item);
      // 比较时也转换为字符串
      if (String(parsed.userId) === userIdStr) {
        await this.redisService.lrem(REDIS_KEYS.MATCH_QUEUE, 1, item);
        break;
      }
    }

    this.send(ws, 'matchCancelled', { message: '已取消匹配' });
  }

  /**
   * 尝试匹配
   */
  private async tryMatch() {
    const queueData = await this.redisService.lrange(REDIS_KEYS.MATCH_QUEUE, 0, 1);

    if (queueData.length < 2) {
      return;
    }
    
    // 解析前两个玩家
    let player1, player2;
    try {
      player1 = JSON.parse(queueData[0]);
      player2 = JSON.parse(queueData[1]);
      
      player1.userId = String(player1.userId);
      player2.userId = String(player2.userId);
    } catch (err) {
      this.logger.error('解析队列数据错误:', err);
      await this.redisService.lpop(REDIS_KEYS.MATCH_QUEUE);
      setTimeout(() => this.tryMatch(), 100);
      return;
    }
    
    this.logger.log(`🎯 尝试匹配: ${player1.userId} vs ${player2.userId}`);

    // 检查两个玩家的连接状态
    const client1 = this.clients.get(player1.userId);
    const client2 = this.clients.get(player2.userId);
    
    const isClient1Ok = client1 && client1.readyState === 1;
    const isClient2Ok = client2 && client2.readyState === 1;
    
    this.logger.log(`🔍 连接检查: player1=${isClient1Ok}, player2=${isClient2Ok}`);
    
    // 如果有玩家断线，从队列移除断线玩家，保留在线玩家
    if (!isClient1Ok || !isClient2Ok) {
      if (!isClient1Ok) {
        await this.redisService.lpop(REDIS_KEYS.MATCH_QUEUE);
        this.logger.log(`🗑️ 移除断线玩家: ${player1.userId}`);
        if (isClient2Ok) {
          this.send(client2, 'matchError', { message: '对手连接异常，正在重新匹配...' });
        }
      } else {
        // player2断线，先移除player1，再移除player2，然后把player1加回去
        await this.redisService.lpop(REDIS_KEYS.MATCH_QUEUE);
        await this.redisService.lpop(REDIS_KEYS.MATCH_QUEUE);
        await this.redisService.lpush(
          REDIS_KEYS.MATCH_QUEUE,
          JSON.stringify({ userId: player1.userId, rating: player1.rating, timestamp: Date.now() })
        );
        this.logger.log(`🗑️ 移除断线玩家: ${player2.userId}，player1重新入队`);
        this.send(client1, 'matchError', { message: '对手连接异常，正在重新匹配...' });
      }
      
      setTimeout(() => this.tryMatch(), 100);
      return;
    }
    
    this.logger.log(`✅ 连接验证通过，开始创建房间`);
    
    // 从队列中移除这两个玩家
    await this.redisService.lpop(REDIS_KEYS.MATCH_QUEUE);
    await this.redisService.lpop(REDIS_KEYS.MATCH_QUEUE);
    
    this.logger.log(`✅ 匹配成功: ${player1.userId} vs ${player2.userId}`);

    // 获取双方用户信息
    const [user1Info, user2Info] = await Promise.all([
      this.userService.findById(player1.userId).catch(() => null),
      this.userService.findById(player2.userId).catch(() => null),
    ]);

    // 生成房间ID
    const roomId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 保存房间信息到Redis
    await this.redisService.set(
      REDIS_KEYS.GAME_ROOM(roomId),
      JSON.stringify({
        roomId,
        player1: player1.userId,
        player2: player2.userId,
        startedAt: new Date().toISOString(),  // 记录游戏开始时间
        player1Info: user1Info ? {
          id: user1Info.id,
          nickname: user1Info.nickname,
          avatarUrl: user1Info.avatarUrl,
        } : null,
        player2Info: user2Info ? {
          id: user2Info.id,
          nickname: user2Info.nickname,
          avatarUrl: user2Info.avatarUrl,
        } : null,
        status: 'playing',
        board: Array(15).fill(null).map(() => Array(15).fill(0)),
        currentPlayer: 1,
        lastMove: null,
        createdAt: new Date().toISOString(),
      }),
      7200
    );

    // 两个玩家都已在线（前面已检查），通知匹配成功
    this.logger.log(`📤 通知玩家1 (${player1.userId}): 匹配成功，yourColor=1`);
    this.send(client1, 'matchFound', {
      roomId,
      opponent: user2Info ? {
        id: user2Info.id,
        nickname: user2Info.nickname,
        avatarUrl: user2Info.avatarUrl,
      } : { id: player2.userId, nickname: '对手' },
      yourColor: 1,
    });

    this.logger.log(`📤 通知玩家2 (${player2.userId}): 匹配成功，yourColor=2`);
    this.send(client2, 'matchFound', {
      roomId,
      opponent: user1Info ? {
        id: user1Info.id,
        nickname: user1Info.nickname,
        avatarUrl: user1Info.avatarUrl,
      } : { id: player1.userId, nickname: '对手' },
      yourColor: 2,
    });
  }

  /**
   * 下棋
   */
  private async handleMakeMove(ws: WebSocketClient, data: any) {
    const { roomId, userId, x, y } = data;

    this.logger.log(`🎯 下棋请求: roomId=${roomId}, userId=${userId}, x=${x}, y=${y}`);
    this.logger.log(`🔍 查找Redis key: ${REDIS_KEYS.GAME_ROOM(roomId)}`);

    const roomData = await this.redisService.get(REDIS_KEYS.GAME_ROOM(roomId));
    if (!roomData) {
      this.logger.error(`❌ 房间不存在: ${REDIS_KEYS.GAME_ROOM(roomId)}`);
      
      // 调试：列出所有 game: 开头的 key
      const allKeys = await this.redisService.keys('game:*');
      this.logger.error(`📋 现有的游戏房间: ${allKeys.join(', ')}`);
      
      this.send(ws, 'error', { message: '房间不存在' });
      return;
    }

    const room = JSON.parse(roomData);
    this.logger.log(`🏠 找到房间: player1=${room.player1}(${typeof room.player1}), player2=${room.player2}(${typeof room.player2})`);
    this.logger.log(`👤 当前用户: userId=${userId}(${typeof userId})`);
    
    // 🔧 关键修复：确保类型一致（string vs number）
    const userIdStr = String(userId);
    const player1Str = String(room.player1);
    const player2Str = String(room.player2);
    
    const playerColor = player1Str === userIdStr ? 1 : 2;
    this.logger.log(`🎨 玩家颜色: ${playerColor} (player1=${player1Str}, player2=${player2Str}, userId=${userIdStr})`);

    if (room.currentPlayer !== playerColor) {
      this.send(ws, 'error', { message: '还没轮到你' });
      return;
    }

    if (room.board[x][y] !== 0) {
      this.send(ws, 'error', { message: '该位置已有棋子' });
      return;
    }

    // 放置棋子
    room.board[x][y] = playerColor;
    room.currentPlayer = playerColor === 1 ? 2 : 1;
    room.lastMove = { x, y }; // 保存最后一步

    // 更新Redis
    await this.redisService.set(REDIS_KEYS.GAME_ROOM(roomId), JSON.stringify(room), 7200);

    // 广播给两个玩家（确保类型一致）
    const player1Id = String(room.player1);
    const player2Id = String(room.player2);
    
    this.logger.log(`📢 准备广播moveMade: player1=${player1Id}(${typeof player1Id}), player2=${player2Id}(${typeof player2Id})`);
    this.logger.log(`📋 当前在线客户端: ${Array.from(this.clients.keys()).join(', ')}`);
    
    const client1 = this.clients.get(player1Id);
    const client2 = this.clients.get(player2Id);
    
    this.logger.log(`🔍 查找结果: client1=${!!client1}, client2=${!!client2}`);

    const moveData = { x, y, color: playerColor, nextPlayer: room.currentPlayer };

    if (client1) {
      this.logger.log(`📤 发送moveMade给玩家1 (${player1Id}):`, moveData);
      this.send(client1, 'moveMade', moveData);
    } else {
      this.logger.error(`❌ 玩家1 (${player1Id}) WebSocket未找到`);
    }
    
    if (client2) {
      this.logger.log(`📤 发送moveMade给玩家2 (${player2Id}):`, moveData);
      this.send(client2, 'moveMade', moveData);
    } else {
      this.logger.error(`❌ 玩家2 (${player2Id}) WebSocket未找到`);
    }

    // 检查是否获胜
    if (this.checkWin(room.board, x, y, playerColor)) {
      const winnerId = userIdStr;
      this.logger.log(`🏆 玩家 ${winnerId} 获胜！`);
      
      // 保存游戏记录和战绩
      await this.saveGameResult(roomId, room, winnerId, 'win');
      
      // 通知双方游戏结束
      const gameOverData = { winner: winnerId, reason: 'win' };
      if (client1) {
        this.send(client1, 'gameOver', gameOverData);
      }
      if (client2) {
        this.send(client2, 'gameOver', gameOverData);
      }
    }
  }

  /**
   * 认输
   */
  private async handleSurrender(ws: WebSocketClient, data: any) {
    const { roomId, userId } = data;

    this.logger.log(`认输: roomId=${roomId}, userId=${userId}`);

    const roomData = await this.redisService.get(REDIS_KEYS.GAME_ROOM(roomId));
    if (!roomData) {
      return;
    }

    const room = JSON.parse(roomData);
    
    // 🔧 关键修复：确保类型一致
    const userIdStr = String(userId);
    const player1Str = String(room.player1);
    
    const winnerColor = player1Str === userIdStr ? 2 : 1;
    const winnerId = winnerColor === 1 ? room.player1 : room.player2;
    
    this.logger.log(`🏳️ 用户 ${userId} 认输，获胜者: ${winnerId}`);

    // 保存游戏记录和战绩
    await this.saveGameResult(roomId, room, String(winnerId), 'surrender');

    const client1 = this.clients.get(room.player1);
    const client2 = this.clients.get(room.player2);

    const gameOverData = { winner: winnerId, reason: 'surrender' };

    if (client1) {
      this.send(client1, 'gameOver', gameOverData);
    }
    if (client2) {
      this.send(client2, 'gameOver', gameOverData);
    }
  }

  /**
   * 处理棋盘同步
   */
  private async handleBoardSync(ws: WebSocketClient, data: any) {
    const { roomId } = data;

    this.logger.log(`棋盘同步请求: roomId=${roomId}`);

    const roomData = await this.redisService.get(REDIS_KEYS.GAME_ROOM(roomId));
    if (!roomData) {
      this.send(ws, 'error', { message: '房间不存在' });
      return;
    }

    const room = JSON.parse(roomData);

    // 返回当前房间状态
    this.send(ws, 'boardSync', {
      board: room.board,
      currentPlayer: room.currentPlayer,
      lastMove: room.lastMove,
    });

    this.logger.log(`棋盘同步成功: roomId=${roomId}`);
  }

  /**
   * 处理断开连接
   */
  private async handleDisconnect(userId: string) {
    this.logger.log(`用户断开: userId=${userId}`);

    this.clients.delete(userId);
    await this.redisService.del(REDIS_KEYS.USER_SOCKET(userId));
    await this.redisService.srem(REDIS_KEYS.ONLINE_USERS, userId);
    
    // 从匹配队列中移除
    const queueData = await this.redisService.lrange(REDIS_KEYS.MATCH_QUEUE, 0, -1);
    for (const item of queueData) {
      try {
        const parsed = JSON.parse(item);
        if (parsed.userId === userId) {
          await this.redisService.lrem(REDIS_KEYS.MATCH_QUEUE, 1, item);
          this.logger.log(`从匹配队列移除用户: ${userId}`);
          break;
        }
      } catch (err) {
        this.logger.error('解析队列数据错误:', err);
      }
    }
    
    // 查找该用户所在的游戏房间，通知对方
    await this.notifyOpponentOnDisconnect(userId);
  }
  
  /**
   * 通知对方玩家：对手已断线
   */
  private async notifyOpponentOnDisconnect(userId: string) {
    try {
      this.logger.log(`🔍 查找用户 ${userId} 的游戏房间`);
      
      // 遍历所有游戏房间，查找包含该userId的房间
      // 修复：正确的Redis key模式是 game:*:room，而不是 game_room:*
      const keys = await this.redisService.keys('game:*:room');
      this.logger.log(`📋 找到 ${keys.length} 个游戏房间:`, keys);
      
      for (const key of keys) {
        const roomData = await this.redisService.get(key);
        if (!roomData) continue;
        
        const room = JSON.parse(roomData);
        this.logger.log(`🔍 检查房间 ${room.roomId}: player1=${room.player1}, player2=${room.player2}, 断线用户=${userId}`);
        
        let opponentId = null;
        let winnerId = null;
        
        // 判断断线的是哪一方（确保类型一致）
        const userIdStr = String(userId);
        const player1Str = String(room.player1);
        const player2Str = String(room.player2);
        
        if (player1Str === userIdStr) {
          opponentId = room.player2;
          winnerId = room.player2; // 对方获胜
          this.logger.log(`✅ 匹配成功: ${userId} 是 player1，对手是 ${opponentId}`);
        } else if (player2Str === userIdStr) {
          opponentId = room.player1;
          winnerId = room.player1; // 对方获胜
          this.logger.log(`✅ 匹配成功: ${userId} 是 player2，对手是 ${opponentId}`);
        }
        
        // 如果找到对手，通知对手
        if (opponentId) {
          this.logger.log(`📢 通知对手 ${opponentId}: 对方 ${userId} 已断线`);
          
          const opponentWs = this.clients.get(opponentId);
          if (opponentWs) {
            this.send(opponentWs, 'gameOver', {
              winner: winnerId,
              reason: 'disconnect',
            });
          }
          
          // 删除房间
          await this.redisService.del(key);
          this.logger.log(`🗑️  删除房间: ${key}`);
          break;
        }
      }
    } catch (err) {
      this.logger.error('通知对方断线失败:', err);
    }
  }

  /**
   * 发送消息
   */
  private send(ws: WebSocket, event: string, data: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, data }));
    }
  }

  /**
   * 创建好友对战游戏房间（到Redis）
   */
  public async createFriendGameRoom(roomCode: string, roomData: any) {
    this.logger.log(`创建好友游戏房间: roomCode=${roomCode}`);
    
    // 保存游戏房间信息到Redis（与在线匹配一致的结构）
    await this.redisService.set(
      REDIS_KEYS.GAME_ROOM(roomCode),
      JSON.stringify({
        roomId: roomCode,
        player1: roomData.creatorId,
        player2: roomData.joinerId,
        player1Info: roomData.creatorInfo,
        player2Info: roomData.joinerInfo,
        status: 'playing',
        board: Array(15).fill(null).map(() => Array(15).fill(0)),
        currentPlayer: 1, // 黑方先手（创建者）
        lastMove: null,
        createdAt: new Date().toISOString(),
      }),
      7200 // 2小时过期
    );
    
    this.logger.log(`✅ 好友游戏房间已创建: ${roomCode}`);
  }

  /**
   * 通知玩家有人加入房间（用于好友对战）
   */
  public notifyPlayerJoined(creatorId: string, data: any) {
    this.logger.log(`📢 notifyPlayerJoined调用: creatorId=${creatorId}, type=${typeof creatorId}`);
    this.logger.log(`📢 当前连接的客户端列表: ${Array.from(this.clients.keys()).join(', ')}`);
    
    const creatorWs = this.clients.get(creatorId);
    
    if (creatorWs) {
      this.logger.log(`✅ 找到创建者WebSocket连接 ${creatorId}`);
      this.logger.log(`📤 发送playerJoined事件:`, JSON.stringify(data));
      this.send(creatorWs, 'playerJoined', data);
    } else {
      this.logger.error(`❌ 创建者 ${creatorId} 未连接WebSocket`);
      this.logger.error(`❌ 可用的连接ID: ${Array.from(this.clients.keys()).join(', ')}`);
    }
  }

  /**
   * 检查是否获胜（五子连珠）
   */
  private checkWin(board: number[][], x: number, y: number, color: number): boolean {
    const BOARD_SIZE = 15;
    const WIN_COUNT = 5;
    
    // 四个方向：横、竖、左斜、右斜
    const directions = [
      [[0, 1], [0, -1]], // 横向
      [[1, 0], [-1, 0]], // 纵向
      [[1, 1], [-1, -1]], // 左斜
      [[1, -1], [-1, 1]], // 右斜
    ];

    for (const [dir1, dir2] of directions) {
      let count = 1; // 当前棋子

      // 正方向
      for (let i = 1; i < WIN_COUNT; i++) {
        const nx = x + dir1[0] * i;
        const ny = y + dir1[1] * i;
        if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
        if (board[nx][ny] !== color) break;
        count++;
      }

      // 反方向
      for (let i = 1; i < WIN_COUNT; i++) {
        const nx = x + dir2[0] * i;
        const ny = y + dir2[1] * i;
        if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
        if (board[nx][ny] !== color) break;
        count++;
      }

      if (count >= WIN_COUNT) {
        return true;
      }
    }

    return false;
  }

  /**
   * 保存游戏结果
   */
  private async saveGameResult(
    roomId: string,
    room: any,
    winnerId: string,
    reason: string,
  ): Promise<void> {
    try {
      const player1Id = String(room.player1);
      const player2Id = String(room.player2);
      const isBlackWin = winnerId === player1Id;
      
      this.logger.log(`💾 保存游戏记录: roomId=${roomId}, winner=${winnerId}, reason=${reason}`);
      
      // 计算步数
      const totalSteps = room.board
        ? room.board.flat().filter((cell: number) => cell !== 0).length
        : 0;
      
      // 确定游戏结果
      const gameResult = isBlackWin ? GameResult.BLACK_WIN : GameResult.WHITE_WIN;
      
      // 更新用户战绩
      await this.userService.updateGameStats(
        player1Id,
        isBlackWin ? 'win' : 'lose',
        isBlackWin ? 20 : -10,
      );

      await this.userService.updateGameStats(
        player2Id,
        isBlackWin ? 'lose' : 'win',
        isBlackWin ? -10 : 20,
      );
      
      this.logger.log(`✅ 用户战绩已更新: ${player1Id}(${isBlackWin ? 'WIN' : 'LOSE'}), ${player2Id}(${isBlackWin ? 'LOSE' : 'WIN'})`);
      
      // 保存游戏记录到 game_records 表
      const startedAt = room.startedAt ? new Date(room.startedAt) : undefined;
      await this.gameService.recordOnlineGame(
        roomId,
        player1Id,
        player2Id,
        winnerId,
        room.board,
        startedAt,
      );
      
      // 删除Redis中的房间数据
      await this.redisService.del(REDIS_KEYS.GAME_ROOM(roomId));
    } catch (error) {
      this.logger.error(`❌ 保存游戏记录失败:`, error);
    }
  }

  /**
   * 处理重新开始游戏请求（好友对战）
   */
  private async handleRestartGame(ws: WebSocketClient, data: any) {
    const { roomId, userId } = data;
    const userIdStr = String(userId);

    this.logger.log(`🔄 收到重新开始请求: roomId=${roomId}, userId=${userIdStr}`);

    // 获取房间信息
    const roomData = await this.redisService.get(REDIS_KEYS.GAME_ROOM(roomId));
    if (!roomData) {
      this.logger.error(`❌ 房间不存在: ${roomId}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          event: 'error', 
          data: { message: '房间不存在' } 
        }));
      }
      return;
    }

    const room = JSON.parse(roomData);
    const player1Id = String(room.player1);
    const player2Id = String(room.player2);

    // 确定对手ID
    const opponentId = userIdStr === player1Id ? player2Id : player1Id;

    // 通知对手
    const opponentClient = this.clients.get(opponentId);
    if (opponentClient && opponentClient.readyState === WebSocket.OPEN) {
      opponentClient.send(JSON.stringify({
        event: 'restartGameRequest',
        data: {
          roomId,
          requesterId: userIdStr,
        }
      }));
      this.logger.log(`✅ 已通知对手: ${opponentId}`);
    } else {
      this.logger.error(`❌ 对手不在线: ${opponentId}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          event: 'error', 
          data: { message: '对手已离线' } 
        }));
      }
    }
  }

  /**
   * 处理重新开始游戏的响应
   */
  private async handleRestartGameResponse(ws: WebSocketClient, data: any) {
    const { roomId, userId, accepted } = data;
    const userIdStr = String(userId);

    this.logger.log(`📨 收到重新开始响应: roomId=${roomId}, userId=${userIdStr}, accepted=${accepted}`);

    // 获取房间信息
    const roomData = await this.redisService.get(REDIS_KEYS.GAME_ROOM(roomId));
    if (!roomData) {
      this.logger.error(`❌ 房间不存在: ${roomId}`);
      return;
    }

    const room = JSON.parse(roomData);
    const player1Id = String(room.player1);
    const player2Id = String(room.player2);

    // 确定对手ID（发起请求的人）
    const requesterId = userIdStr === player1Id ? player2Id : player1Id;

    // 通知发起请求的玩家
    const requesterClient = this.clients.get(requesterId);
    if (requesterClient && requesterClient.readyState === WebSocket.OPEN) {
      requesterClient.send(JSON.stringify({
        event: 'gameRestarted',
        data: {
          roomId,
          accepted,
        }
      }));
    }

    // 也通知响应方（确认已处理）
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        event: 'gameRestarted',
        data: {
          roomId,
          accepted,
        }
      }));
      this.logger.log(`✅ 已通知响应方: ${userIdStr}`);
    }

    if (accepted && requesterClient) {
        this.logger.log(`✅ 双方同意重新开始，重置房间: ${roomId}`);

        // 重置房间状态
        room.board = Array(15)
          .fill(null)
          .map(() => Array(15).fill(0));
        room.currentPlayer = 1; // 黑方先手
        room.lastMove = null;

        // 保存重置后的房间
        await this.redisService.set(
          REDIS_KEYS.GAME_ROOM(roomId),
          JSON.stringify(room),
          3600,
        );

        // 通知双方棋盘已重置（可选，前端已经自己重置了）
        this.logger.log(`🎮 房间 ${roomId} 已重置`);
      } else {
        this.logger.log(`❌ 对手拒绝重新开始: ${roomId}`);
      }
    }
  }
}

