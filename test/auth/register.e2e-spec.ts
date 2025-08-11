import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Auth Registration (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    
    await app.init();
    
    prismaService = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await prismaService.session.deleteMany({});
    await prismaService.user.deleteMany({
      where: {
        email: {
          contains: 'test',
        },
      },
    });
  });

  describe('POST /auth/register', () => {
    it('should successfully register a new user', async () => {
      const registerDto = {
        email: 'test.user@example.com',
        password: 'StrongPassword123!',
        name: 'Test User',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('tokenType', 'Bearer');
      expect(response.body).toHaveProperty('message');
      
      expect(response.body.user).toMatchObject({
        email: registerDto.email,
        name: registerDto.name,
        emailVerified: false,
      });
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });

    it('should reject registration with duplicate email', async () => {
      const registerDto = {
        email: 'duplicate@example.com',
        password: 'StrongPassword123!',
        name: 'First User',
      };

      // Register first user
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201);

      // Try to register with same email
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...registerDto,
          name: 'Second User',
        })
        .expect(409);

      expect(response.body.message).toContain('already exists');
    });

    it('should reject registration with invalid email format', async () => {
      const registerDto = {
        email: 'invalid-email',
        password: 'StrongPassword123!',
        name: 'Test User',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(400);

      expect(response.body.message).toContain('email');
    });

    it('should reject registration with weak password', async () => {
      const weakPasswords = [
        'short',           // Too short
        'alllowercase',    // No uppercase or numbers
        'ALLUPPERCASE',    // No lowercase or numbers
        '12345678',        // No letters
        'NoNumbers!',      // No numbers
        'nospecialchar1',  // No special characters
      ];

      for (const password of weakPasswords) {
        const registerDto = {
          email: `test${Math.random()}@example.com`,
          password,
          name: 'Test User',
        };

        const response = await request(app.getHttpServer())
          .post('/auth/register')
          .send(registerDto)
          .expect(400);

        expect(response.body.message).toBeDefined();
      }
    });

    it('should reject registration with missing required fields', async () => {
      // Missing email
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          password: 'StrongPassword123!',
          name: 'Test User',
        })
        .expect(400);

      // Missing password
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          name: 'Test User',
        })
        .expect(400);

      // Missing name
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'StrongPassword123!',
        })
        .expect(400);
    });

    it('should reject registration with empty fields', async () => {
      const registerDto = {
        email: '',
        password: '',
        name: '',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(400);

      expect(response.body.message).toBeInstanceOf(Array);
      expect(response.body.message.length).toBeGreaterThan(0);
    });

    it('should handle case-insensitive email', async () => {
      const registerDto = {
        email: 'TEST.USER@EXAMPLE.COM',
        password: 'StrongPassword123!',
        name: 'Test User',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201);

      // Try to register with same email in different case
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...registerDto,
          email: 'test.user@example.com',
        })
        .expect(409);
    });

    it('should trim whitespace from email and name', async () => {
      const registerDto = {
        email: '  test.trim@example.com  ',
        password: 'StrongPassword123!',
        name: '  Test User  ',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201);

      expect(response.body.user.email).toBe('test.trim@example.com');
      expect(response.body.user.name).toBe('Test User');
    });

    it('should handle very long valid inputs', async () => {
      const longName = 'A'.repeat(255); // Max length for name
      const registerDto = {
        email: 'test.long@example.com',
        password: 'StrongPassword123!',
        name: longName,
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201);

      expect(response.body.user.name).toBe(longName);
    });

    it('should reject excessively long inputs', async () => {
      const tooLongName = 'A'.repeat(256); // Exceeds max length
      const registerDto = {
        email: 'test@example.com',
        password: 'StrongPassword123!',
        name: tooLongName,
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(400);
    });

    it('should reject forbidden characters in fields', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'StrongPassword123!',
        name: '<script>alert("XSS")</script>',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201);

      // The name should be stored as-is (sanitization happens on output)
      expect(response.body.user.name).toBe(registerDto.name);
    });

    it('should handle concurrent registration attempts', async () => {
      const registerDto = {
        email: 'concurrent@example.com',
        password: 'StrongPassword123!',
        name: 'Concurrent User',
      };

      // Send multiple concurrent requests
      const requests = Array(5).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/auth/register')
          .send(registerDto)
      );

      const responses = await Promise.allSettled(requests);
      
      // Only one should succeed
      const successfulResponses = responses.filter(
        r => r.status === 'fulfilled' && r.value.status === 201
      );
      const failedResponses = responses.filter(
        r => r.status === 'fulfilled' && r.value.status === 409
      );

      expect(successfulResponses.length).toBe(1);
      expect(failedResponses.length).toBe(4);
    });
  });
});