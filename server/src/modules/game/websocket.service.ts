import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { WebSocketServer, WebSocket } from 'ws';
import { RedisService } from '@/shared/redis/redis.service';
import { REDIS_KEYS } from '@/common/constants/redis-keys.constants';
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

  constructor(private readonly redisService: RedisService) {}

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
      default:
        this.logger.warn(`未知事件: ${event}`);
    }
  }

  /**
   * 加入匹配队列
   */
  private async handleJoinMatch(ws: WebSocketClient, data: any) {
    const { userId, rating } = data;

    this.logger.log(`用户加入匹配: userId=${userId}, rating=${rating}`);

    // 检查是否已在队列中，如果在则先移除（避免重复）
    const queueData = await this.redisService.lrange(REDIS_KEYS.MATCH_QUEUE, 0, -1);
    for (const item of queueData) {
      try {
        const parsed = JSON.parse(item);
        if (parsed.userId === userId) {
          await this.redisService.lrem(REDIS_KEYS.MATCH_QUEUE, 1, item);
          this.logger.log(`移除用户的旧匹配请求: userId=${userId}`);
          break;
        }
      } catch (err) {
        this.logger.error('解析队列数据错误:', err);
      }
    }

    // 加入队列
    await this.redisService.rpush(
      REDIS_KEYS.MATCH_QUEUE,
      JSON.stringify({ userId, rating, timestamp: Date.now() })
    );

    this.send(ws, 'matchJoined', { message: '已加入匹配队列' });

    // 尝试匹配
    this.tryMatch();
  }

  /**
   * 取消匹配
   */
  private async handleCancelMatch(ws: WebSocketClient, data: any) {
    const { userId } = data;

    this.logger.log(`用户取消匹配: userId=${userId}`);

    const queueData = await this.redisService.lrange(REDIS_KEYS.MATCH_QUEUE, 0, -1);
    for (const item of queueData) {
      const parsed = JSON.parse(item);
      if (parsed.userId === userId) {
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
    const queueData = await this.redisService.lrange(REDIS_KEYS.MATCH_QUEUE, 0, -1);

    if (queueData.length < 2) {
      return;
    }

    const players = queueData.map(item => JSON.parse(item));
    const player1 = players[0];
    const player2 = players[1];

    this.logger.log(`匹配成功: ${player1.userId} vs ${player2.userId}`);

    // 从队列中移除
    await this.redisService.lpop(REDIS_KEYS.MATCH_QUEUE);
    await this.redisService.lpop(REDIS_KEYS.MATCH_QUEUE);

    // 生成房间ID
    const roomId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 保存房间信息到Redis
    await this.redisService.set(
      REDIS_KEYS.GAME_ROOM(roomId),
      JSON.stringify({
        roomId,
        player1: player1.userId,
        player2: player2.userId,
        status: 'playing',
        board: Array(15).fill(null).map(() => Array(15).fill(0)),
        currentPlayer: 1,
        createdAt: new Date().toISOString(),
      }),
      7200
    );

    // 通知两个玩家
    const client1 = this.clients.get(player1.userId);
    const client2 = this.clients.get(player2.userId);

    if (client1) {
      this.send(client1, 'matchFound', {
        roomId,
        opponent: player2.userId,
        yourColor: 1,
      });
    }

    if (client2) {
      this.send(client2, 'matchFound', {
        roomId,
        opponent: player1.userId,
        yourColor: 2,
      });
    }
  }

  /**
   * 下棋
   */
  private async handleMakeMove(ws: WebSocketClient, data: any) {
    const { roomId, userId, x, y } = data;

    this.logger.log(`下棋: roomId=${roomId}, userId=${userId}, x=${x}, y=${y}`);

    const roomData = await this.redisService.get(REDIS_KEYS.GAME_ROOM(roomId));
    if (!roomData) {
      this.send(ws, 'error', { message: '房间不存在' });
      return;
    }

    const room = JSON.parse(roomData);
    const playerColor = room.player1 === userId ? 1 : 2;

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

    // 更新Redis
    await this.redisService.set(REDIS_KEYS.GAME_ROOM(roomId), JSON.stringify(room), 7200);

    // 广播给两个玩家
    const client1 = this.clients.get(room.player1);
    const client2 = this.clients.get(room.player2);

    const moveData = { x, y, color: playerColor, nextPlayer: room.currentPlayer };

    if (client1) {
      this.send(client1, 'moveMade', moveData);
    }
    if (client2) {
      this.send(client2, 'moveMade', moveData);
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
    const winnerColor = room.player1 === userId ? 2 : 1;
    const winnerId = winnerColor === 1 ? room.player1 : room.player2;

    await this.redisService.del(REDIS_KEYS.GAME_ROOM(roomId));

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
  }

  /**
   * 发送消息
   */
  private send(ws: WebSocket, event: string, data: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, data }));
    }
  }
}

