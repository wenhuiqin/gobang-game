import { registerAs } from '@nestjs/config';

export default registerAs('wechat', () => ({
  appId: process.env.WECHAT_APP_ID || '',
  appSecret: process.env.WECHAT_APP_SECRET || '',
  loginUrl: 'https://api.weixin.qq.com/sns/jscode2session',
}));

