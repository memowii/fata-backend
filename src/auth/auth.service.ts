import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, name } = registerDto;

    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Create user
    const user = await this.usersService.create({
      email,
      password,
      name,
    });

    // Generate email verification token
    const verificationToken = this.generateToken();
    await this.usersService.setEmailVerificationToken(user.id, verificationToken);

    // Send verification email
    await this.emailService.sendVerificationEmail(user.email, user.name || '', verificationToken);

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.name || '');
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
      },
      ...tokens,
      message: 'Registration successful. Please check your email to verify your account.',
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Check if account is locked
    const isLocked = await this.usersService.isAccountLocked(email);
    if (isLocked) {
      throw new ForbiddenException('Account is locked due to multiple failed login attempts. Please try again later.');
    }

    // Find user
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      await this.usersService.incrementLoginAttempts(email);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await this.usersService.incrementLoginAttempts(email);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset login attempts on successful login
    await this.usersService.resetLoginAttempts(email);

    // Check if email is verified
    if (!user.emailVerified) {
      throw new ForbiddenException('Please verify your email before logging in');
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.name || '');
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
      },
      ...tokens,
    };
  }

  async logout(userId: string) {
    await this.updateRefreshToken(userId, null);
    return { message: 'Logged out successfully' };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    
    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    // Validate refresh token from session
    const session = await this.validateRefreshToken(userId, refreshToken);
    
    if (!session) {
      throw new ForbiddenException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.name || '');
    
    // Delete old session and create new one
    await this.prisma.session.delete({ where: { id: session.id } });
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  private async validateRefreshToken(userId: string, refreshToken: string) {
    const session = await this.prisma.session.findFirst({
      where: {
        userId,
        refreshToken,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    return session;
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const { token } = verifyEmailDto;

    const user = await this.usersService.findByEmailVerificationToken(token);
    
    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (user.emailVerified) {
      return { message: 'Email already verified' };
    }

    await this.usersService.setEmailVerified(user.id, true);

    return { message: 'Email verified successfully' };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const user = await this.usersService.findByEmail(email);
    
    if (!user) {
      // Don't reveal if user exists or not for security
      return { message: 'If an account exists with this email, a password reset link has been sent.' };
    }

    // Generate password reset token
    const resetToken = this.generateToken();
    const expiryHours = parseInt(this.configService.get<string>('PASSWORD_RESET_EXPIRY', '1h'));
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    await this.usersService.setPasswordResetToken(user.id, resetToken, expiresAt);

    // Send password reset email
    await this.emailService.sendPasswordResetEmail(
      user.email,
      user.name || '',
      user.email,
      resetToken,
    );

    return { message: 'If an account exists with this email, a password reset link has been sent.' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;

    const user = await this.usersService.findByPasswordResetToken(token);
    
    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    await this.usersService.updatePassword(user.id, newPassword);

    return { message: 'Password reset successfully' };
  }

  async resendVerificationEmail(email: string) {
    const user = await this.usersService.findByEmail(email);
    
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.emailVerified) {
      return { message: 'Email already verified' };
    }

    // Generate new verification token
    const verificationToken = this.generateToken();
    await this.usersService.setEmailVerificationToken(user.id, verificationToken);

    // Send verification email
    await this.emailService.sendVerificationEmail(user.email, user.name || '', verificationToken);

    return { message: 'Verification email sent successfully' };
  }

  private async generateTokens(userId: string, email: string, name: string) {
    const payload: JwtPayload = {
      sub: userId,
      email,
      name,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_EXPIRATION', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION', '30d'),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('JWT_EXPIRATION', '15m'),
    };
  }

  private async updateRefreshToken(userId: string, refreshToken: string | null) {
    await this.usersService.updateRefreshToken(userId, refreshToken);
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }
}