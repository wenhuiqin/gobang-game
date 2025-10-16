import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import { WechatService } from '@/shared/wechat/wechat.service';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private wechatService: WechatService,
    private jwtService: JwtService,
  ) {}

  /**
   * 微信登录
   */
  async wechatLogin(code: string, userInfo: any) {
    // 1. 调用微信接口获取openid
    const {openid, unionid} = await this.wechatService.login(code);

    // 2. 查找或创建用户
    let user = await this.userService.findByOpenid(openid);
    
    if (!user) {
      // 创建新用户
      user = await this.userService.create({
        openid,
        unionid,
        nickname: userInfo.nickName || '游客',
        avatarUrl: userInfo.avatarUrl,
      });
    } else {
      // 更新最后登录时间
      await this.userService.updateLastLogin(user.id);
      
      // 更新用户信息
      if (userInfo.nickName && userInfo.nickName !== user.nickname) {
        await this.userService.update(user.id, {
          nickname: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
        });
        user = await this.userService.findById(user.id);
      }
    }

    // 3. 生成JWT token
    const token = this.jwtService.sign({
      id: user.id,
      openid: user.openid,
    });

    return {
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        level: user.level,
        totalGames: user.totalGames,
        winGames: user.winGames,
        winRate: user.totalGames > 0 
          ? Number((user.winGames / user.totalGames).toFixed(2)) 
          : 0,
      },
    };
  }

  /**
   * 游客登录（开发测试用）
   */
  async guestLogin(nickname?: string) {
    // 生成临时游客ID
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const guestNickname = nickname || `游客${Math.random().toString(36).substr(2, 5)}`;
    
    // 查找或创建游客用户
    let user = await this.userService.findByOpenid(guestId);
    
    if (!user) {
      user = await this.userService.create({
        openid: guestId,
        unionid: null,
        nickname: guestNickname,
        avatarUrl: 'https://via.placeholder.com/100?text=Guest',
      });
    }

    // 生成JWT token
    const token = this.jwtService.sign({
      id: user.id,
      openid: user.openid,
    });

    return {
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        level: user.level,
        totalGames: user.totalGames,
        winGames: user.winGames,
        winRate: user.totalGames > 0 
          ? Number((user.winGames / user.totalGames).toFixed(2)) 
          : 0,
      },
    };
  }

  /**
   * 验证JWT token
   */
  async validateToken(payload: any) {
    return this.userService.findById(payload.id);
  }
}

