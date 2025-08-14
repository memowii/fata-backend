import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

// Mock bcrypt
jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let emailService: EmailService;
  let prismaService: PrismaService;

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    name: 'Test User',
    passwordHash: 'hashedPassword',
    emailVerified: true,
    emailVerificationToken: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLogin: null,
    preferences: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSession = {
    id: 'session-123',
    userId: mockUser.id,
    refreshToken: 'valid-refresh-token',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    createdAt: new Date(),
  };

  const mockTokens = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    tokenType: 'Bearer',
    expiresIn: '15m',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            setEmailVerificationToken: jest.fn(),
            setEmailVerified: jest.fn(),
            setPasswordResetToken: jest.fn(),
            findByPasswordResetToken: jest.fn(),
            findByEmailVerificationToken: jest.fn(),
            updatePassword: jest.fn(),
            updateRefreshToken: jest.fn(),
            incrementLoginAttempts: jest.fn(),
            resetLoginAttempts: jest.fn(),
            isAccountLocked: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                JWT_SECRET: 'test-secret',
                JWT_REFRESH_SECRET: 'test-refresh-secret',
                JWT_EXPIRATION: '15m',
                JWT_REFRESH_EXPIRATION: '30d',
                PASSWORD_RESET_EXPIRY: '1h',
                BCRYPT_ROUNDS: '10',
              };
              return config[key] || defaultValue;
            }),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendVerificationEmail: jest.fn(),
            sendPasswordResetEmail: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            session: {
              findFirst: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
    emailService = module.get<EmailService>(EmailService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'newuser@example.com',
      password: 'StrongPassword123!',
      name: 'New User',
    };

    it('should successfully register a new user', async () => {
      const newUser = { ...mockUser, email: registerDto.email, emailVerified: false };
      
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(usersService, 'create').mockResolvedValue(newUser);
      jest.spyOn(usersService, 'setEmailVerificationToken').mockResolvedValue(undefined);
      jest.spyOn(emailService, 'sendVerificationEmail').mockResolvedValue({ jobId: '123', status: 'queued' });
      jest.spyOn(jwtService, 'signAsync')
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      jest.spyOn(usersService, 'updateRefreshToken').mockResolvedValue(undefined);

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.message).toBe('Registration successful. Please check your email to verify your account.');
      expect(usersService.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(usersService.create).toHaveBeenCalledWith({
        email: registerDto.email,
        password: registerDto.password,
        name: registerDto.name,
      });
      expect(emailService.sendVerificationEmail).toHaveBeenCalled();
    });

    it('should throw ConflictException if user already exists', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should successfully login a user with valid credentials', async () => {
      jest.spyOn(usersService, 'isAccountLocked').mockResolvedValue(false);
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jest.spyOn(usersService, 'resetLoginAttempts').mockResolvedValue(undefined);
      jest.spyOn(jwtService, 'signAsync')
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      jest.spyOn(usersService, 'updateRefreshToken').mockResolvedValue(undefined);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(usersService.resetLoginAttempts).toHaveBeenCalledWith(loginDto.email);
    });

    it('should throw ForbiddenException if account is locked', async () => {
      jest.spyOn(usersService, 'isAccountLocked').mockResolvedValue(true);

      await expect(service.login(loginDto)).rejects.toThrow(ForbiddenException);
      expect(usersService.findByEmail).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      jest.spyOn(usersService, 'isAccountLocked').mockResolvedValue(false);
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(usersService, 'incrementLoginAttempts').mockResolvedValue(undefined);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(usersService.incrementLoginAttempts).toHaveBeenCalledWith(loginDto.email);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      jest.spyOn(usersService, 'isAccountLocked').mockResolvedValue(false);
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      jest.spyOn(usersService, 'incrementLoginAttempts').mockResolvedValue(undefined);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(usersService.incrementLoginAttempts).toHaveBeenCalledWith(loginDto.email);
    });

    it('should throw ForbiddenException if email is not verified', async () => {
      const unverifiedUser = { ...mockUser, emailVerified: false };
      
      jest.spyOn(usersService, 'isAccountLocked').mockResolvedValue(false);
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(unverifiedUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jest.spyOn(usersService, 'resetLoginAttempts').mockResolvedValue(undefined);

      await expect(service.login(loginDto)).rejects.toThrow(ForbiddenException);
      expect(usersService.resetLoginAttempts).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should successfully logout a user', async () => {
      jest.spyOn(usersService, 'updateRefreshToken').mockResolvedValue(undefined);

      const result = await service.logout(mockUser.id);

      expect(result.message).toBe('Logged out successfully');
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(mockUser.id, null);
    });
  });

  describe('refreshTokens', () => {
    it('should successfully refresh tokens', async () => {
      jest.spyOn(usersService, 'findById').mockResolvedValue(mockUser);
      jest.spyOn(prismaService.session, 'findFirst').mockResolvedValue(mockSession);
      jest.spyOn(jwtService, 'signAsync')
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');
      jest.spyOn(prismaService.session, 'delete').mockResolvedValue(mockSession);
      jest.spyOn(usersService, 'updateRefreshToken').mockResolvedValue(undefined);

      const result = await service.refreshTokens(mockUser.id, 'valid-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(prismaService.session.delete).toHaveBeenCalledWith({ where: { id: mockSession.id } });
    });

    it('should throw ForbiddenException if user not found', async () => {
      jest.spyOn(usersService, 'findById').mockResolvedValue(null);

      await expect(service.refreshTokens('invalid-id', 'token')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for invalid refresh token', async () => {
      jest.spyOn(usersService, 'findById').mockResolvedValue(mockUser);
      jest.spyOn(prismaService.session, 'findFirst').mockResolvedValue(null);

      await expect(service.refreshTokens(mockUser.id, 'invalid-token')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('verifyEmail', () => {
    const verifyEmailDto: VerifyEmailDto = {
      token: 'verification-token',
    };

    it('should successfully verify email', async () => {
      const unverifiedUser = { ...mockUser, emailVerified: false };
      
      jest.spyOn(usersService, 'findByEmailVerificationToken').mockResolvedValue(unverifiedUser);
      jest.spyOn(usersService, 'setEmailVerified').mockResolvedValue(undefined);

      const result = await service.verifyEmail(verifyEmailDto);

      expect(result.message).toBe('Email verified successfully');
      expect(usersService.setEmailVerified).toHaveBeenCalledWith(unverifiedUser.id, true);
    });

    it('should return already verified message if email is already verified', async () => {
      jest.spyOn(usersService, 'findByEmailVerificationToken').mockResolvedValue(mockUser);

      const result = await service.verifyEmail(verifyEmailDto);

      expect(result.message).toBe('Email already verified');
      expect(usersService.setEmailVerified).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid token', async () => {
      jest.spyOn(usersService, 'findByEmailVerificationToken').mockResolvedValue(null);

      await expect(service.verifyEmail(verifyEmailDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('forgotPassword', () => {
    const forgotPasswordDto: ForgotPasswordDto = {
      email: 'test@example.com',
    };

    it('should send password reset email for existing user', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(usersService, 'setPasswordResetToken').mockResolvedValue(undefined);
      jest.spyOn(emailService, 'sendPasswordResetEmail').mockResolvedValue({ jobId: '123', status: 'queued' });

      const result = await service.forgotPassword(forgotPasswordDto);

      expect(result.message).toBe('If an account exists with this email, a password reset link has been sent.');
      expect(usersService.setPasswordResetToken).toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('should return generic message for non-existent user', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null);

      const result = await service.forgotPassword(forgotPasswordDto);

      expect(result.message).toBe('If an account exists with this email, a password reset link has been sent.');
      expect(usersService.setPasswordResetToken).not.toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const resetPasswordDto: ResetPasswordDto = {
      token: 'reset-token',
      newPassword: 'NewPassword123!',
    };

    it('should successfully reset password', async () => {
      jest.spyOn(usersService, 'findByPasswordResetToken').mockResolvedValue(mockUser);
      jest.spyOn(usersService, 'updatePassword').mockResolvedValue({ message: 'Password updated successfully' });

      const result = await service.resetPassword(resetPasswordDto);

      expect(result.message).toBe('Password reset successfully');
      expect(usersService.updatePassword).toHaveBeenCalledWith(mockUser.id, resetPasswordDto.newPassword);
    });

    it('should throw BadRequestException for invalid token', async () => {
      jest.spyOn(usersService, 'findByPasswordResetToken').mockResolvedValue(null);

      await expect(service.resetPassword(resetPasswordDto)).rejects.toThrow(BadRequestException);
      expect(usersService.updatePassword).not.toHaveBeenCalled();
    });
  });

  describe('resendVerificationEmail', () => {
    it('should resend verification email for unverified user', async () => {
      const unverifiedUser = { ...mockUser, emailVerified: false };
      
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(unverifiedUser);
      jest.spyOn(usersService, 'setEmailVerificationToken').mockResolvedValue(undefined);
      jest.spyOn(emailService, 'sendVerificationEmail').mockResolvedValue({ jobId: '123', status: 'queued' });

      const result = await service.resendVerificationEmail(unverifiedUser.email);

      expect(result.message).toBe('Verification email sent successfully');
      expect(usersService.setEmailVerificationToken).toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).toHaveBeenCalled();
    });

    it('should return already verified message for verified user', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser);

      const result = await service.resendVerificationEmail(mockUser.email);

      expect(result.message).toBe('Email already verified');
      expect(usersService.setEmailVerificationToken).not.toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent user', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null);

      await expect(service.resendVerificationEmail('nonexistent@example.com')).rejects.toThrow(NotFoundException);
    });
  });
});