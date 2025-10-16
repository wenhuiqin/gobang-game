import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/user.decorator';
import { UserService } from './user.service';

@Controller('api/user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * 获取用户信息
   */
  @Get('profile')
  async getProfile(@CurrentUser() user: any) {
    return this.userService.findById(user.id);
  }

  /**
   * 获取用户战绩历史
   */
  @Get('history')
  async getHistory(
    @CurrentUser() user: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.userService.getHistory(user.id, page, limit);
  }

  /**
   * 获取排行榜
   */
  @Get('leaderboard')
  async getLeaderboard(@Query('limit') limit?: string) {
    // Query参数是字符串，需要转换为数字
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.userService.getLeaderboard(limitNum);
  }
}

