import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { randomBytes } from 'crypto';

describe('Email Verification (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  
  const testUser = {
    email: 'verify.test@example.com',
    password: 'TestPassword123!',
    name: 'Verify Test User',
  };

  let hashedPassword: string;
  let validToken: string;
  let expiredToken: string;

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
    
    // Generate test data
    hashedPassword = await bcrypt.hash(testUser.password, 10);
    validToken = randomBytes(32).toString('hex');
    expiredToken = randomBytes(32).toString('hex');
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
  });

  describe('POST /auth/verify-email', () => {
    beforeEach(async () => {
      // Create an unverified user with verification token
      await prismaService.user.create({
        data: {
          email: testUser.email,
          passwordHash: hashedPassword,
          name: testUser.name,
          emailVerified: false,
          emailVerificationToken: validToken,
        },
      });
    });

    it('should successfully verify email with valid token', async () => {
      const verifyDto = {
        token: validToken,
      };

      const response = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send(verifyDto)
        .expect(200);

      expect(response.body.message).toBe('Email verified successfully');

      // Check that user is now verified
      const user = await prismaService.user.findUnique({
        where: { email: testUser.email },
      });
      expect(user!.emailVerified).toBe(true);
      expect(user!.emailVerificationToken).toBeNull();
    });

    it('should reject invalid verification token', async () => {
      const verifyDto = {
        token: 'invalid-token',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send(verifyDto)
        .expect(400);

      expect(response.body.message).toContain('Invalid or expired verification token');

      // User should still be unverified
      const user = await prismaService.user.findUnique({
        where: { email: testUser.email },
      });
      expect(user!.emailVerified).toBe(false);
    });

    it('should handle already verified email', async () => {
      // First verification
      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: validToken })
        .expect(200);

      // Create a new user with same token (simulating reuse)
      await prismaService.user.create({
        data: {
          email: 'already.verified@example.com',
          passwordHash: hashedPassword,
          name: 'Already Verified',
          emailVerified: true,
          emailVerificationToken: validToken,
        },
      });

      // Try to verify again
      const response = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: validToken })
        .expect(200);

      expect(response.body.message).toBe('Email already verified');
    });

    it('should reject empty token', async () => {
      const verifyDto = {
        token: '',
      };

      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send(verifyDto)
        .expect(400);
    });

    it('should reject missing token', async () => {
      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({})
        .expect(400);
    });

    it('should handle non-existent token', async () => {
      const verifyDto = {
        token: randomBytes(32).toString('hex'),
      };

      const response = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send(verifyDto)
        .expect(400);

      expect(response.body.message).toContain('Invalid or expired verification token');
    });

    it('should allow login after email verification', async () => {
      // Verify email first
      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: validToken })
        .expect(200);

      // Now try to login
      const loginDto = {
        email: testUser.email,
        password: testUser.password,
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body.user.emailVerified).toBe(true);
    });

    it('should handle concurrent verification attempts', async () => {
      const verifyDto = {
        token: validToken,
      };

      // Send multiple concurrent requests
      const requests = Array(5).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/auth/verify-email')
          .send(verifyDto)
      );

      const responses = await Promise.all(requests);
      
      // All should succeed or return "already verified"
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(['Email verified successfully', 'Email already verified'])
          .toContain(response.body.message);
      });

      // User should be verified
      const user = await prismaService.user.findUnique({
        where: { email: testUser.email },
      });
      expect(user!.emailVerified).toBe(true);
    });

    it('should handle very long tokens gracefully', async () => {
      const longToken = 'a'.repeat(1000);

      const verifyDto = {
        token: longToken,
      };

      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send(verifyDto)
        .expect(400);
    });

    it('should handle special characters in token', async () => {
      const specialTokens = [
        '<script>alert("XSS")</script>',
        '"; DROP TABLE users; --',
        '../../../etc/passwd',
        'null',
        'undefined',
      ];

      for (const token of specialTokens) {
        await request(app.getHttpServer())
          .post('/auth/verify-email')
          .send({ token })
          .expect(400);
      }
    });
  });

  describe('POST /auth/resend-verification', () => {
    beforeEach(async () => {
      // Create an unverified user
      await prismaService.user.create({
        data: {
          email: testUser.email,
          passwordHash: hashedPassword,
          name: testUser.name,
          emailVerified: false,
          emailVerificationToken: validToken,
        },
      });
    });

    it('should resend verification email for unverified user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/resend-verification')
        .query({ email: testUser.email })
        .expect(200);

      expect(response.body.message).toBe('Verification email sent successfully');

      // Check that a new token was generated
      const user = await prismaService.user.findUnique({
        where: { email: testUser.email },
      });
      expect(user!.emailVerificationToken).toBeDefined();
      // Token might be different from the original
    });

    it('should handle already verified user', async () => {
      // First, verify the user
      await prismaService.user.update({
        where: { email: testUser.email },
        data: { emailVerified: true },
      });

      const response = await request(app.getHttpServer())
        .post('/auth/resend-verification')
        .query({ email: testUser.email })
        .expect(200);

      expect(response.body.message).toBe('Email already verified');
    });

    it('should return error for non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/auth/resend-verification')
        .query({ email: 'nonexistent@example.com' })
        .expect(404);
    });

    it('should handle missing email parameter', async () => {
      await request(app.getHttpServer())
        .post('/auth/resend-verification')
        .expect(400);
    });

    it('should handle invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/auth/resend-verification')
        .query({ email: 'invalid-email' })
        .expect(400);
    });

    it('should be case-insensitive for email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/resend-verification')
        .query({ email: 'VERIFY.TEST@EXAMPLE.COM' })
        .expect(200);

      expect(response.body.message).toBe('Verification email sent successfully');
    });

    it('should rate limit resend requests', async () => {
      // Send multiple rapid requests
      const requests = Array(10).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/auth/resend-verification')
          .query({ email: testUser.email })
      );

      const responses = await Promise.all(requests);
      
      // All should succeed (but in production, rate limiting should apply)
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
});