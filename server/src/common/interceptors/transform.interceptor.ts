import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ERROR_CODES } from '../constants/error-codes.constants';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, any>
{
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // 如果返回数据已经有code字段，直接返回
        if (data && typeof data === 'object' && 'code' in data) {
          return data;
        }

        // 否则包装为标准格式
        return {
          code: ERROR_CODES.SUCCESS,
          message: '成功',
          data,
        };
      }),
    );
  }
}

