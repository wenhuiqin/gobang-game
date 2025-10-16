import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ERROR_CODES } from '@/common/constants/error-codes.constants';

@Injectable()
export class WechatService {
  constructor(private configService: ConfigService) {}

  /**
   * 微信登录 - 获取session_key和openid
   */
  async login(code: string): Promise<{
    openid: string;
    sessionKey: string;
    unionid?: string;
  }> {
    try {
      const appId = this.configService.get('wechat.appId');
      const appSecret = this.configService.get('wechat.appSecret');
      const loginUrl = this.configService.get('wechat.loginUrl');

      const response = await axios.get(loginUrl, {
        params: {
          appid: appId,
          secret: appSecret,
          js_code: code,
          grant_type: 'authorization_code',
        },
      });

      const { openid, session_key, unionid, errcode, errmsg } = response.data;

      if (errcode) {
        throw new HttpException(
          {
            code: ERROR_CODES.AUTH_WECHAT_LOGIN_FAILED,
            message: `微信登录失败: ${errmsg}`,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      return {
        openid,
        sessionKey: session_key,
        unionid,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          code: ERROR_CODES.AUTH_WECHAT_LOGIN_FAILED,
          message: '微信登录失败',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

