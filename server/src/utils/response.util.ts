import { ERROR_CODES, ERROR_MESSAGES } from '@/common/constants/error-codes.constants';

/**
 * 统一响应格式
 */
export class ResponseUtil {
  /**
   * 成功响应
   */
  static success<T>(data?: T, message: string = '成功') {
    return {
      code: ERROR_CODES.SUCCESS,
      message,
      data,
    };
  }

  /**
   * 失败响应
   */
  static error(code: number, message?: string) {
    return {
      code,
      message: message || ERROR_MESSAGES[code] || '未知错误',
    };
  }
}

