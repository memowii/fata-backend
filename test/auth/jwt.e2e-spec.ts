import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('JWT Authentication (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let jwtService: JwtService;
  
  const testUser = {
    email: 'jwt.test@example.com',
    password: 'TestPassword123!',
    name: 'JWT Test User',
  };

  let hashedPassword: string;
  let validAccessToken: string;
  let validRefreshToken: string;
  let expiredAccessToken: string;

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
    jwtService = app.get<JwtService>(JwtService);
    
    // Hash password for test user
    hashedPassword = await bcrypt.hash(testUser.password, 10);
    
    // Generate expired token for testing
    expiredAccessToken = await jwtService.signAsync(
      { sub: 'expired-user-id', email: 'expired@example.com' },
      { expiresIn: '0s', secret: process.env.JWT_SECRET || 'test-secret' }
    );
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

    // Login to get valid tokens
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    validAccessToken = loginResponse.body.accessToken;
    validRefreshToken = loginResponse.body.refreshToken;
  });

  describe('Protected Routes', () => {
    it('should allow access to protected route with valid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${validAccessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        email: testUser.email,
        name: testUser.name,
        emailVerified: true,
      });
      expect(response.body).toHaveProperty('id');
    });

    it('should reject access without token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
    });

    it('should reject access with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should reject access with expired token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredAccessToken}`)
        .expect(401);
    });

    it('should reject access with malformed authorization header', async () => {
      // Missing "Bearer" prefix
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', validAccessToken)
        .expect(401);

      // Wrong prefix
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Token ${validAccessToken}`)
        .expect(401);

      // Empty bearer
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer ')
        .expect(401);
    });

    it('should handle token from different secret', async () => {
      const wrongSecretToken = await jwtService.signAsync(
        { sub: 'user-id', email: 'user@example.com' },
        { expiresIn: '15m', secret: 'wrong-secret' }
      );

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${wrongSecretToken}`)
        .expect(401);
    });
  });

  describe('Token Refresh', () => {
    it('should successfully refresh tokens with valid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${validRefreshToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('tokenType', 'Bearer');
      expect(response.body).toHaveProperty('expiresIn');

      // New tokens should be different from old ones
      expect(response.body.accessToken).not.toBe(validAccessToken);
      expect(response.body.refreshToken).not.toBe(validRefreshToken);

      // New access token should work
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${response.body.accessToken}`)
        .expect(200);
    });

    it('should reject refresh with invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', 'Bearer invalid-refresh-token')
        .expect(403);
    });

    it('should reject refresh without token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .expect(401);
    });

    it('should reject refresh with access token instead of refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${validAccessToken}`)
        .expect(403);
    });

    it('should invalidate old refresh token after use', async () => {
      // First refresh should succeed
      const response1 = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${validRefreshToken}`)
        .expect(200);

      // Try to use old refresh token again - should fail
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${validRefreshToken}`)
        .expect(403);

      // New refresh token should work
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${response1.body.refreshToken}`)
        .expect(200);
    });

    it('should handle concurrent refresh attempts', async () => {
      // Send multiple concurrent refresh requests
      const requests = Array(5).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('Authorization', `Bearer ${validRefreshToken}`)
      );

      const responses = await Promise.all(requests);
      
      // Only one should succeed, others should fail
      const successCount = responses.filter(r => r.status === 200).length;
      const failureCount = responses.filter(r => r.status === 403).length;
      
      expect(successCount).toBe(1);
      expect(failureCount).toBe(4);
    });
  });

  describe('Logout', () => {
    it('should successfully logout and invalidate refresh token', async () => {
      // Logout
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${validAccessToken}`)
        .expect(200);

      // Refresh token should no longer work
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${validRefreshToken}`)
        .expect(403);

      // Access token should still work until it expires
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${validAccessToken}`)
        .expect(200);
    });

    it('should require authentication for logout', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(401);
    });

    it('should handle multiple logout attempts', async () => {
      // First logout
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${validAccessToken}`)
        .expect(200);

      // Second logout should also succeed (idempotent)
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${validAccessToken}`)
        .expect(200);
    });
  });

  describe('Token Security', () => {
    it('should not expose sensitive information in tokens', async () => {
      // Decode the access token (without verification)
      const [, payload] = validAccessToken.split('.');
      const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());

      // Should not contain password or sensitive data
      expect(decodedPayload).not.toHaveProperty('password');
      expect(decodedPayload).not.toHaveProperty('passwordHash');
      expect(decodedPayload).toHaveProperty('sub'); // User ID
      expect(decodedPayload).toHaveProperty('email');
    });

    it('should handle tampered tokens', async () => {
      // Tamper with the token by changing the payload
      const parts = validAccessToken.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      payload.email = 'hacker@example.com';
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64');
      const tamperedToken = parts.join('.');

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);
    });

    it('should handle tokens with invalid structure', async () => {
      const invalidTokens = [
        'not.a.token',
        'onlyonepart',
        'two.parts',
        'four.parts.in.token',
        '',
        'null',
        'undefined',
      ];

      for (const token of invalidTokens) {
        await request(app.getHttpServer())
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
      }
    });
  });

  describe('Session Management', () => {
    it('should create session on login', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      // Check that session was created
      const user = await prismaService.user.findUnique({
        where: { email: testUser.email },
      });

      const sessions = await prismaService.session.findMany({
        where: { userId: user!.id },
      });

      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0]).toHaveProperty('refreshToken');
      expect(sessions[0]).toHaveProperty('expiresAt');
    });

    it('should clean up expired sessions', async () => {
      // Create an expired session
      const user = await prismaService.user.findUnique({
        where: { email: testUser.email },
      });

      await prismaService.session.create({
        data: {
          userId: user!.id,
          refreshToken: 'expired-token',
          expiresAt: new Date(Date.now() - 1000), // Expired
        },
      });

      // Try to use expired refresh token
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', 'Bearer expired-token')
        .expect(403);
    });

    it('should handle multiple active sessions', async () => {
      // Login from "different devices" (multiple sessions)
      const sessions: Array<{ accessToken: string; refreshToken: string }> = [];
      
      for (let i = 0; i < 3; i++) {
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password,
          });
        
        sessions.push({
          accessToken: response.body.accessToken,
          refreshToken: response.body.refreshToken,
        });
      }

      // All sessions should work
      for (const session of sessions) {
        await request(app.getHttpServer())
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .expect(200);
      }

      // Logout from one session shouldn't affect others
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${sessions[0].accessToken}`)
        .expect(200);

      // First session refresh should fail
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${sessions[0].refreshToken}`)
        .expect(403);

      // Other sessions should still work
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${sessions[1].refreshToken}`)
        .expect(200);
    });
  });
});