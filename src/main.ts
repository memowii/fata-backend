import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get('PORT') || 5000;
  
  // Set global API prefix with version
  const apiVersion = configService.get('API_VERSION', 'v1');
  app.setGlobalPrefix(`api/${apiVersion}`);
  
  // Enable CORS
  app.enableCors({
    origin: configService.get('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true,
  });
  
  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  
  // Swagger documentation for v1
  const config = new DocumentBuilder()
    .setTitle('From Article to Audio API v1')
    .setDescription('API documentation for From Article to Audio backend - Version 1')
    .setVersion('1.0')
    .addBearerAuth()
    .addServer(`/api/${apiVersion}`)
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`api/${apiVersion}`, app, document);
  
  await app.listen(port);
  console.log(`API is running on: http://localhost:${port}`);
  console.log(`API endpoints: http://localhost:${port}/api/${apiVersion}`);
  console.log(`Swagger documentation: http://localhost:${port}/api/${apiVersion}`);
  console.log(`OpenAPI JSON: http://localhost:${port}/api/${apiVersion}-json`);
}
bootstrap();
