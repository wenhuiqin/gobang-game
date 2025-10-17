import { Controller, Post, Get, Delete, Body, Param, UseGuards, Inject, forwardRef } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/user.decorator';
import { RoomService } from './room.service';
import { UserService } from '@/modules/user/user.service';
import { WebSocketService } from '@/modules/game/websocket.service';

@Controller('room')
@UseGuards(JwtAuthGuard)
export class RoomController {
  constructor(
    private readonly roomService: RoomService,
    private readonly userService: UserService,
    @Inject(forwardRef(() => WebSocketService))
    private readonly websocketService: WebSocketService,
  ) {}

  /**
   * 创建房间
   */
  @Post('create')
  async createRoom(@CurrentUser() user: any) {
    // 获取完整用户信息
    const userInfo = await this.userService.findById(user.id);
    const result = await this.roomService.createRoom(user.id, userInfo.nickname);
    return {
      code: 0,
      message: '房间创建成功',
      data: result,
    };
  }

  /**
   * 加入房间
   */
  @Post('join')
  async joinRoom(
    @CurrentUser() user: any,
    @Body('roomCode') roomCode: string,
  ) {
    if (!roomCode) {
      return {
        code: 400,
        message: '房间号不能为空',
      };
    }

    try {
      // 获取完整用户信息
      const userInfo = await this.userService.findById(user.id);
      const room = await this.roomService.joinRoom(roomCode, user.id, userInfo.nickname);
      
      // 获取房间创建者信息
      const creatorInfo = await this.userService.findById(room.creatorId);
      
      // 创建游戏房间到Redis（用于棋盘同步）
      await this.websocketService.createFriendGameRoom(roomCode, {
        creatorId: room.creatorId,
        creatorInfo: {
          id: creatorInfo.id,
          nickname: creatorInfo.nickname,
          avatarUrl: creatorInfo.avatarUrl,
        },
        joinerId: userInfo.id,
        joinerInfo: {
          id: userInfo.id,
          nickname: userInfo.nickname,
          avatarUrl: userInfo.avatarUrl,
        },
      });
      
      // 通过WebSocket通知房间创建者：有人加入了
      console.log(`🔔 准备通知创建者: creatorId=${room.creatorId}, type=${typeof room.creatorId}`);
      console.log(`🔔 加入者信息: userId=${userInfo.id}, nickname=${userInfo.nickname}`);
      
      this.websocketService.notifyPlayerJoined(room.creatorId, {
        roomCode: room.roomCode,
        opponent: {
          id: userInfo.id,
          nickname: userInfo.nickname,
          avatarUrl: userInfo.avatarUrl,
        },
        yourColor: 1, // 创建者为黑方
      });
      
      // 返回房间信息和玩家颜色（加入者为白方）
      return {
        code: 0,
        message: '加入房间成功',
        data: {
          room,
          yourColor: 2, // 加入者为白方
          opponentId: room.creatorId,
          opponent: {
            id: creatorInfo.id,
            nickname: creatorInfo.nickname,
            avatarUrl: creatorInfo.avatarUrl,
          },
        },
      };
    } catch (error) {
      return {
        code: 400,
        message: error.message || '加入房间失败',
      };
    }
  }

  /**
   * 获取房间信息
   */
  @Get(':roomCode')
  async getRoomInfo(@Param('roomCode') roomCode: string) {
    const room = await this.roomService.getRoomInfo(roomCode);
    
    if (!room) {
      return {
        code: 404,
        message: '房间不存在',
      };
    }

    return {
      code: 0,
      message: '获取成功',
      data: room,
    };
  }

  /**
   * 离开房间
   */
  @Delete(':roomCode/leave')
  async leaveRoom(
    @Param('roomCode') roomCode: string,
    @CurrentUser() user: any,
  ) {
    try {
      await this.roomService.leaveRoom(roomCode, user.id);
      return {
        code: 0,
        message: '已离开房间',
      };
    } catch (error) {
      return {
        code: 400,
        message: error.message || '离开房间失败',
      };
    }
  }
}

