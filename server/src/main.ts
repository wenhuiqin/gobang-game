import 'dotenv/config'; // 确保环境变量在应用启动前加载
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 全局管道 - 数据验证
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  // 全局异常过滤器
  app.useGlobalFilters(new AllExceptionsFilter());

  // 全局响应拦截器
  app.useGlobalInterceptors(new TransformInterceptor());

  // CORS配置
  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0'); // 监听所有网卡，支持真机访问

  console.log(`🚀 Server is running on: http://localhost:${port}`);
  console.log(`🌐 LAN access: http://192.168.0.199:${port}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database: ${process.env.DB_DATABASE} @ ${process.env.DB_HOST}`);
}

bootstrap();

