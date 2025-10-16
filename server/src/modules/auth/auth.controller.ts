import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 微信登录
   */
  @Post('login')
  async login(@Body() body: { code: string; userInfo: any }) {
    return this.authService.wechatLogin(body.code, body.userInfo);
  }

  /**
   * 游客登录（开发测试用）
   */
  @Post('guest-login')
  async guestLogin(@Body() body: { nickname?: string }) {
    return this.authService.guestLogin(body.nickname);
  }
}

