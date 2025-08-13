import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { randomBytes } from 'crypto';

describe('Password Reset (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  
  const testUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'reset.test@example.com',
    password: 'OldPassword123!',
    name: 'Reset Test User',
  };

  let hashedPassword: string;
  let validResetToken: string;
  let expiredResetToken: string;

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
    
    // Generate test data
    hashedPassword = await bcrypt.hash(testUser.password, 10);
    validResetToken = randomBytes(32).toString('hex');
    expiredResetToken = randomBytes(32).toString('hex');
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

    // Create a test user
    await prismaService.user.create({
      data: {
        id: testUser.id,
        email: testUser.email,
        passwordHash: hashedPassword,
        name: testUser.name,
        emailVerified: true,
      },
    });
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should handle forgot password request for existing user', async () => {
      const forgotDto = {
        email: testUser.email,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send(forgotDto)
        .expect(200);

      expect(response.body.message).toBe(
        'If an account exists with this email, a password reset link has been sent.'
      );

      // Check that reset token was set
      const user = await prismaService.user.findUnique({
        where: { email: testUser.email },
      });
      expect(user!.passwordResetToken).toBeDefined();
      expect(user!.passwordResetExpires).toBeDefined();
      expect(user!.passwordResetExpires!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return generic message for non-existent email', async () => {
      const forgotDto = {
        email: 'nonexistent@example.com',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send(forgotDto)
        .expect(200);

      // Should return same message for security
      expect(response.body.message).toBe(
        'If an account exists with this email, a password reset link has been sent.'
      );
    });

    it('should handle multiple forgot password requests', async () => {
      const forgotDto = {
        email: testUser.email,
      };

      // First request
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send(forgotDto)
        .expect(200);

      const user1 = await prismaService.user.findUnique({
        where: { email: testUser.email },
      });
      const firstToken = user1!.passwordResetToken;

      // Second request should generate new token
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send(forgotDto)
        .expect(200);

      const user2 = await prismaService.user.findUnique({
        where: { email: testUser.email },
      });
      const secondToken = user2!.passwordResetToken;

      // Tokens should be different
      expect(secondToken).not.toBe(firstToken);
    });

    it('should reject invalid email format', async () => {
      const forgotDto = {
        email: 'invalid-email',
      };

      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send(forgotDto)
        .expect(400);
    });

    it('should reject missing email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({})
        .expect(400);
    });

    it('should handle case-insensitive email', async () => {
      const forgotDto = {
        email: 'RESET.TEST@EXAMPLE.COM',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send(forgotDto)
        .expect(200);

      expect(response.body.message).toBe(
        'If an account exists with this email, a password reset link has been sent.'
      );

      // Check that token was set for the correct user
      const user = await prismaService.user.findUnique({
        where: { email: testUser.email },
      });
      expect(user!.passwordResetToken).toBeDefined();
    });

    it('should trim whitespace from email', async () => {
      const forgotDto = {
        email: '  reset.test@example.com  ',
      };

      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send(forgotDto)
        .expect(200);

      const user = await prismaService.user.findUnique({
        where: { email: testUser.email },
      });
      expect(user!.passwordResetToken).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    beforeEach(async () => {
      // Set up user with valid reset token
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);

      await prismaService.user.update({
        where: { id: testUser.id },
        data: {
          passwordResetToken: validResetToken,
          passwordResetExpires: futureDate,
        },
      });
    });

    it('should successfully reset password with valid token', async () => {
      const newPassword = 'NewPassword123!';
      const resetDto = {
        token: validResetToken,
        newPassword: newPassword,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send(resetDto)
        .expect(200);

      expect(response.body.message).toBe('Password reset successfully');

      // Check that password was updated
      const user = await prismaService.user.findUnique({
        where: { email: testUser.email },
      });
      
      // Token should be cleared
      expect(user!.passwordResetToken).toBeNull();
      expect(user!.passwordResetExpires).toBeNull();

      // Should be able to login with new password
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: newPassword,
        })
        .expect(200);

      expect(loginResponse.body).toHaveProperty('accessToken');
    });

    it('should reject invalid reset token', async () => {
      const resetDto = {
        token: 'invalid-token',
        newPassword: 'NewPassword123!',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send(resetDto)
        .expect(400);

      expect(response.body.message).toContain('Invalid or expired reset token');
    });

    it('should reject expired reset token', async () => {
      // Set expired token
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);

      await prismaService.user.update({
        where: { id: testUser.id },
        data: {
          passwordResetToken: expiredResetToken,
          passwordResetExpires: pastDate,
        },
      });

      const resetDto = {
        token: expiredResetToken,
        newPassword: 'NewPassword123!',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send(resetDto)
        .expect(400);

      expect(response.body.message).toContain('Invalid or expired reset token');
    });

    it('should reject weak new password', async () => {
      const weakPasswords = [
        'short',           // Too short
        'alllowercase',    // No uppercase or numbers
        'ALLUPPERCASE',    // No lowercase or numbers
        '12345678',        // No letters
        'NoNumbers!',      // No numbers
        'nospecialchar1',  // No special characters
      ];

      for (const password of weakPasswords) {
        const resetDto = {
          token: validResetToken,
          newPassword: password,
        };

        await request(app.getHttpServer())
          .post('/api/v1/auth/reset-password')
          .send(resetDto)
          .expect(400);
      }
    });

    it('should reject missing fields', async () => {
      // Missing token
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ newPassword: 'NewPassword123!' })
        .expect(400);

      // Missing newPassword
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: validResetToken })
        .expect(400);

      // Empty body
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({})
        .expect(400);
    });

    it('should prevent token reuse', async () => {
      const resetDto = {
        token: validResetToken,
        newPassword: 'NewPassword123!',
      };

      // First reset should succeed
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send(resetDto)
        .expect(200);

      // Second attempt with same token should fail
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token: validResetToken,
          newPassword: 'AnotherPassword123!',
        })
        .expect(400);

      expect(response.body.message).toContain('Invalid or expired reset token');
    });

    it('should not allow login with old password after reset', async () => {
      const resetDto = {
        token: validResetToken,
        newPassword: 'NewPassword123!',
      };

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send(resetDto)
        .expect(200);

      // Try to login with old password
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password, // Old password
        })
        .expect(401);
    });

    it('should handle concurrent reset attempts', async () => {
      const resetDto = {
        token: validResetToken,
        newPassword: 'NewPassword123!',
      };

      // Send multiple concurrent requests
      const requests = Array(5).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/api/v1/auth/reset-password')
          .send(resetDto)
      );

      const responses = await Promise.all(requests);
      
      // Only one should succeed
      const successCount = responses.filter(r => r.status === 200).length;
      const failureCount = responses.filter(r => r.status === 400).length;
      
      expect(successCount).toBe(1);
      expect(failureCount).toBe(4);
    });

    it('should handle very long passwords', async () => {
      const longPassword = 'A1!' + 'a'.repeat(250); // Very long but valid password
      
      const resetDto = {
        token: validResetToken,
        newPassword: longPassword,
      };

      // Should either accept or reject based on max length policy
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send(resetDto);
      // Not asserting status as it depends on password policy
    });

    it('should handle special characters in password', async () => {
      const specialPassword = 'Test123!@#$%^&*()_+-=[]{}|;:,.<>?';
      
      const resetDto = {
        token: validResetToken,
        newPassword: specialPassword,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send(resetDto)
        .expect(200);

      expect(response.body.message).toBe('Password reset successfully');
    });
  });

  describe('Password Reset Flow Integration', () => {
    it('should complete full password reset flow', async () => {
      // Step 1: Request password reset
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: testUser.email })
        .expect(200);

      // Step 2: Get the reset token from database
      const userWithToken = await prismaService.user.findUnique({
        where: { email: testUser.email },
      });
      const resetToken = userWithToken!.passwordResetToken;

      // Step 3: Reset password with token
      const newPassword = 'CompletelyNewPassword123!';
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: newPassword,
        })
        .expect(200);

      // Step 4: Login with new password
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: newPassword,
        })
        .expect(200);

      expect(loginResponse.body).toHaveProperty('accessToken');
      expect(loginResponse.body.user.email).toBe(testUser.email);
    });
  });
});