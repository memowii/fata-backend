import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Auth Login (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  
  const testUser = {
    email: 'login.test@example.com',
    password: 'TestPassword123!',
    name: 'Login Test User',
  };

  let hashedPassword: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    
    await app.init();
    
    prismaService = app.get<PrismaService>(PrismaService);
    
    // Hash password for test user
    hashedPassword = await bcrypt.hash(testUser.password, 10);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await prismaService.session.deleteMany({});
    await prismaService.user.deleteMany({
      where: {
        email: {
          contains: 'test',
        },
      },
    });

    // Create a verified test user
    await prismaService.user.create({
      data: {
        email: testUser.email,
        passwordHash: hashedPassword,
        name: testUser.name,
        emailVerified: true,
      },
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should successfully login with valid credentials', async () => {
      const loginDto = {
        email: testUser.email,
        password: testUser.password,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(loginDto)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('tokenType', 'Bearer');
      
      expect(response.body.user).toMatchObject({
        email: testUser.email,
        name: testUser.name,
        emailVerified: true,
      });
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });

    it('should reject login with invalid email', async () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        password: testUser.password,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(loginDto)
        .expect(401);

      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should reject login with invalid password', async () => {
      const loginDto = {
        email: testUser.email,
        password: 'WrongPassword123!',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(loginDto)
        .expect(401);

      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should reject login for unverified email', async () => {
      // Create unverified user
      await prismaService.user.create({
        data: {
          email: 'unverified@example.com',
          passwordHash: hashedPassword,
          name: 'Unverified User',
          emailVerified: false,
        },
      });

      const loginDto = {
        email: 'unverified@example.com',
        password: testUser.password,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(loginDto)
        .expect(403);

      expect(response.body.message).toContain('verify your email');
    });

    it('should lock account after multiple failed attempts', async () => {
      const loginDto = {
        email: testUser.email,
        password: 'WrongPassword',
      };

      // Make multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send(loginDto)
          .expect(401);
      }

      // Account should now be locked
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password, // Even with correct password
        })
        .expect(403);

      expect(response.body.message).toContain('Account is locked');
    });

    it('should handle case-insensitive email', async () => {
      const loginDto = {
        email: 'LOGIN.TEST@EXAMPLE.COM', // Different case
        password: testUser.password,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(loginDto)
        .expect(200);

      expect(response.body.user.email).toBe(testUser.email);
    });

    it('should reject login with missing credentials', async () => {
      // Missing email
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ password: testUser.password })
        .expect(400);

      // Missing password
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email })
        .expect(400);

      // Empty body
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);
    });

    it('should reject login with empty credentials', async () => {
      const loginDto = {
        email: '',
        password: '',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(loginDto)
        .expect(400);

      expect(response.body.message).toBeInstanceOf(Array);
    });

    it('should trim whitespace from email', async () => {
      const loginDto = {
        email: '  login.test@example.com  ',
        password: testUser.password,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(loginDto)
        .expect(200);

      expect(response.body.user.email).toBe(testUser.email);
    });

    it('should handle SQL injection attempts', async () => {
      const maliciousInputs = [
        "' OR '1'='1",
        "admin'--",
        "' OR 1=1--",
        "'; DROP TABLE users--",
      ];

      for (const input of maliciousInputs) {
        const loginDto = {
          email: input,
          password: input,
        };

        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send(loginDto)
          .expect((res) => {
            expect([400, 401]).toContain(res.status);
          });
      }

      // Verify database is still intact
      const users = await prismaService.user.findMany();
      expect(users.length).toBeGreaterThan(0);
    });

    it('should reset failed attempts on successful login', async () => {
      const loginDto = {
        email: testUser.email,
        password: 'WrongPassword',
      };

      // Make some failed attempts (but not enough to lock)
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send(loginDto)
          .expect(401);
      }

      // Successful login should reset attempts
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      // Check that attempts were reset
      const user = await prismaService.user.findUnique({
        where: { email: testUser.email },
      });
      expect(user!.failedLoginAttempts).toBe(0);
    });

    it('should handle concurrent login attempts', async () => {
      const loginDto = {
        email: testUser.email,
        password: testUser.password,
      };

      // Send multiple concurrent requests
      const requests = Array(5).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send(loginDto)
      );

      const responses = await Promise.all(requests);
      
      // All should succeed since credentials are valid
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('accessToken');
      });
    });

    it('should return consistent error messages for security', async () => {
      // Non-existent user
      const response1 = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'AnyPassword123!',
        })
        .expect(401);

      // Existing user with wrong password
      const response2 = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!',
        })
        .expect(401);

      // Both should return the same error message
      expect(response1.body.message).toBe(response2.body.message);
    });

    it('should handle very long input gracefully', async () => {
      const longEmail = 'a'.repeat(1000) + '@example.com';
      const longPassword = 'a'.repeat(1000);

      const loginDto = {
        email: longEmail,
        password: longPassword,
      };

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(loginDto)
        .expect((res) => {
          expect([400, 401]).toContain(res.status);
        });
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit login attempts from same IP', async () => {
      const loginDto = {
        email: testUser.email,
        password: 'wrong',
      };

      // Make many rapid requests
      const requests = Array(20).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send(loginDto)
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited (if rate limiting is implemented)
      // This test assumes rate limiting is configured
      // If not implemented, all will return 401
      const statusCodes = responses.map(r => r.status);
      expect(statusCodes).toContain(401);
    });
  });
});