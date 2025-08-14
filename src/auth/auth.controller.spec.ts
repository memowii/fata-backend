import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CurrentUserData } from './decorators/current-user.decorator';
import {
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockUser: CurrentUserData = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    name: 'Test User',
    emailVerified: true,
  };

  const mockTokens = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    tokenType: 'Bearer',
    expiresIn: '15m',
  };

  const mockAuthResponse = {
    user: {
      id: mockUser.id,
      email: mockUser.email,
      name: mockUser.name,
      emailVerified: mockUser.emailVerified,
    },
    ...mockTokens,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            logout: jest.fn(),
            refreshTokens: jest.fn(),
            verifyEmail: jest.fn(),
            forgotPassword: jest.fn(),
            resetPassword: jest.fn(),
            resendVerificationEmail: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'newuser@example.com',
      password: 'StrongPassword123!',
      name: 'New User',
    };

    it('should successfully register a new user', async () => {
      const expectedResponse = {
        ...mockAuthResponse,
        message: 'Registration successful. Please check your email to verify your account.',
      };
      
      jest.spyOn(authService, 'register').mockResolvedValue(expectedResponse);

      const result = await controller.register(registerDto);

      expect(result).toEqual(expectedResponse);
      expect(authService.register).toHaveBeenCalledWith(registerDto);
    });

    it('should handle duplicate email error', async () => {
      jest.spyOn(authService, 'register').mockRejectedValue(
        new ConflictException('User with this email already exists')
      );

      await expect(controller.register(registerDto)).rejects.toThrow(ConflictException);
    });

    it('should handle validation errors', async () => {
      const invalidDto = {
        email: 'invalid-email',
        password: 'weak',
        name: '',
      } as RegisterDto;

      jest.spyOn(authService, 'register').mockRejectedValue(
        new BadRequestException('Validation failed')
      );

      await expect(controller.register(invalidDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should successfully login a user', async () => {
      jest.spyOn(authService, 'login').mockResolvedValue(mockAuthResponse as any);

      const result = await controller.login(loginDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.login).toHaveBeenCalledWith(loginDto);
    });

    it('should handle invalid credentials', async () => {
      jest.spyOn(authService, 'login').mockRejectedValue(
        new UnauthorizedException('Invalid credentials')
      );

      await expect(controller.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should handle unverified email', async () => {
      jest.spyOn(authService, 'login').mockRejectedValue(
        new ForbiddenException('Please verify your email before logging in')
      );

      await expect(controller.login(loginDto)).rejects.toThrow(ForbiddenException);
    });

    it('should handle locked account', async () => {
      jest.spyOn(authService, 'login').mockRejectedValue(
        new ForbiddenException('Account is locked due to multiple failed login attempts')
      );

      await expect(controller.login(loginDto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('logout', () => {
    it('should successfully logout a user', async () => {
      const expectedResponse = { message: 'Logged out successfully' };
      
      jest.spyOn(authService, 'logout').mockResolvedValue(expectedResponse);

      const result = await controller.logout(mockUser);

      expect(result).toEqual(expectedResponse);
      expect(authService.logout).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('refreshTokens', () => {
    it('should successfully refresh tokens', async () => {
      const refreshUser = {
        sub: mockUser.id,
        refreshToken: 'old-refresh-token',
      };

      jest.spyOn(authService, 'refreshTokens').mockResolvedValue(mockTokens);

      const result = await controller.refreshTokens(refreshUser);

      expect(result).toEqual(mockTokens);
      expect(authService.refreshTokens).toHaveBeenCalledWith(
        refreshUser.sub,
        refreshUser.refreshToken
      );
    });

    it('should handle invalid refresh token', async () => {
      const refreshUser = {
        sub: mockUser.id,
        refreshToken: 'invalid-token',
      };

      jest.spyOn(authService, 'refreshTokens').mockRejectedValue(
        new ForbiddenException('Invalid refresh token')
      );

      await expect(controller.refreshTokens(refreshUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('verifyEmail', () => {
    const verifyEmailDto: VerifyEmailDto = {
      token: 'verification-token',
    };

    it('should successfully verify email', async () => {
      const expectedResponse = { message: 'Email verified successfully' };
      
      jest.spyOn(authService, 'verifyEmail').mockResolvedValue(expectedResponse);

      const result = await controller.verifyEmail(verifyEmailDto);

      expect(result).toEqual(expectedResponse);
      expect(authService.verifyEmail).toHaveBeenCalledWith(verifyEmailDto);
    });

    it('should handle invalid verification token', async () => {
      jest.spyOn(authService, 'verifyEmail').mockRejectedValue(
        new BadRequestException('Invalid or expired verification token')
      );

      await expect(controller.verifyEmail(verifyEmailDto)).rejects.toThrow(BadRequestException);
    });

    it('should handle already verified email', async () => {
      const expectedResponse = { message: 'Email already verified' };
      
      jest.spyOn(authService, 'verifyEmail').mockResolvedValue(expectedResponse);

      const result = await controller.verifyEmail(verifyEmailDto);

      expect(result).toEqual(expectedResponse);
    });
  });

  describe('forgotPassword', () => {
    const forgotPasswordDto: ForgotPasswordDto = {
      email: 'test@example.com',
    };

    it('should handle forgot password request', async () => {
      const expectedResponse = {
        message: 'If an account exists with this email, a password reset link has been sent.',
      };
      
      jest.spyOn(authService, 'forgotPassword').mockResolvedValue(expectedResponse);

      const result = await controller.forgotPassword(forgotPasswordDto);

      expect(result).toEqual(expectedResponse);
      expect(authService.forgotPassword).toHaveBeenCalledWith(forgotPasswordDto);
    });

    it('should return generic message for non-existent email', async () => {
      const expectedResponse = {
        message: 'If an account exists with this email, a password reset link has been sent.',
      };
      
      jest.spyOn(authService, 'forgotPassword').mockResolvedValue(expectedResponse);

      const result = await controller.forgotPassword({ email: 'nonexistent@example.com' });

      expect(result).toEqual(expectedResponse);
    });
  });

  describe('resetPassword', () => {
    const resetPasswordDto: ResetPasswordDto = {
      token: 'reset-token',
      newPassword: 'NewPassword123!',
    };

    it('should successfully reset password', async () => {
      const expectedResponse = { message: 'Password reset successfully' };
      
      jest.spyOn(authService, 'resetPassword').mockResolvedValue(expectedResponse);

      const result = await controller.resetPassword(resetPasswordDto);

      expect(result).toEqual(expectedResponse);
      expect(authService.resetPassword).toHaveBeenCalledWith(resetPasswordDto);
    });

    it('should handle invalid reset token', async () => {
      jest.spyOn(authService, 'resetPassword').mockRejectedValue(
        new BadRequestException('Invalid or expired reset token')
      );

      await expect(controller.resetPassword(resetPasswordDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('resendVerificationEmail', () => {
    const email = 'test@example.com';

    it('should resend verification email', async () => {
      const expectedResponse = { message: 'Verification email sent successfully' };
      
      jest.spyOn(authService, 'resendVerificationEmail').mockResolvedValue(expectedResponse);

      const result = await controller.resendVerificationEmail(email);

      expect(result).toEqual(expectedResponse);
      expect(authService.resendVerificationEmail).toHaveBeenCalledWith(email);
    });

    it('should handle non-existent user', async () => {
      jest.spyOn(authService, 'resendVerificationEmail').mockRejectedValue(
        new NotFoundException('User not found')
      );

      await expect(controller.resendVerificationEmail(email)).rejects.toThrow(NotFoundException);
    });

    it('should handle already verified email', async () => {
      const expectedResponse = { message: 'Email already verified' };
      
      jest.spyOn(authService, 'resendVerificationEmail').mockResolvedValue(expectedResponse);

      const result = await controller.resendVerificationEmail(email);

      expect(result).toEqual(expectedResponse);
    });
  });

  describe('getProfile', () => {
    it('should return current user profile', async () => {
      const result = await controller.getProfile(mockUser);

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        emailVerified: mockUser.emailVerified,
      });
    });
  });
});