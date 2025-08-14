import {
  Injectable,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async create(data: {
    email: string;
    password: string;
    name: string;
  }) {
    try {
      const existingUser = await this.findByEmail(data.email);
      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      const bcryptRounds = parseInt(this.configService.get<string>('BCRYPT_ROUNDS', '10'), 10);
      const hashedPassword = await bcrypt.hash(data.password, bcryptRounds);

      const user = await this.prisma.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash: hashedPassword,
          name: data.name,
          emailVerified: false,
        },
        select: {
          id: true,
          email: true,
          name: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return user;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      console.error('Failed to create user:', error);
      throw new InternalServerErrorException('Failed to create user');
    }
  }

  async findById(id: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        return null;
      }

      return user;
    } catch (error) {
      throw new InternalServerErrorException('Failed to find user');
    }
  }

  async findByEmail(email: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      return user;
    } catch (error) {
      throw new InternalServerErrorException('Failed to find user');
    }
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    try {
      const user = await this.findById(id);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (updateUserDto.email && updateUserDto.email !== user.email) {
        const existingUser = await this.findByEmail(updateUserDto.email);
        if (existingUser) {
          throw new ConflictException('Email already in use');
        }
      }

      const updatedUser = await this.prisma.user.update({
        where: { id },
        data: {
          ...updateUserDto,
          email: updateUserDto.email?.toLowerCase(),
        },
        select: {
          id: true,
          email: true,
          name: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return updatedUser;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update user');
    }
  }

  async updatePassword(id: string, newPassword: string) {
    try {
      const bcryptRounds = parseInt(this.configService.get<string>('BCRYPT_ROUNDS', '10'), 10);
      const hashedPassword = await bcrypt.hash(newPassword, bcryptRounds);

      await this.prisma.user.update({
        where: { id },
        data: {
          passwordHash: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      });

      return { message: 'Password updated successfully' };
    } catch (error) {
      throw new InternalServerErrorException('Failed to update password');
    }
  }

  async updateRefreshToken(id: string, refreshToken: string | null) {
    try {
      if (refreshToken) {
        // Store refresh token in session table
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry
        
        await this.prisma.session.create({
          data: {
            userId: id,
            refreshToken,
            expiresAt,
          },
        });
      } else {
        // Remove all sessions for user on logout
        await this.prisma.session.deleteMany({
          where: { userId: id },
        });
      }
    } catch (error) {
      throw new InternalServerErrorException('Failed to update refresh token');
    }
  }

  async setEmailVerified(id: string, verified: boolean) {
    try {
      await this.prisma.user.update({
        where: { id },
        data: { 
          emailVerified: verified,
          emailVerificationToken: null,
        },
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to update email verification status');
    }
  }

  async setEmailVerificationToken(id: string, token: string) {
    try {
      await this.prisma.user.update({
        where: { id },
        data: { emailVerificationToken: token },
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to set email verification token');
    }
  }

  async setPasswordResetToken(id: string, token: string, expiresAt: Date) {
    try {
      await this.prisma.user.update({
        where: { id },
        data: {
          passwordResetToken: token,
          passwordResetExpires: expiresAt,
        },
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to set password reset token');
    }
  }

  async findByPasswordResetToken(token: string) {
    try {
      const user = await this.prisma.user.findFirst({
        where: {
          passwordResetToken: token,
          passwordResetExpires: {
            gt: new Date(),
          },
        },
      });

      return user;
    } catch (error) {
      throw new InternalServerErrorException('Failed to find user by reset token');
    }
  }

  async findByEmailVerificationToken(token: string) {
    try {
      const user = await this.prisma.user.findFirst({
        where: {
          emailVerificationToken: token,
        },
      });

      return user;
    } catch (error) {
      throw new InternalServerErrorException('Failed to find user by verification token');
    }
  }

  async incrementLoginAttempts(email: string) {
    try {
      const user = await this.findByEmail(email);
      if (!user) return;

      const maxAttempts = this.configService.get<number>('MAX_LOGIN_ATTEMPTS', 5);
      const lockTimeMinutes = parseInt(this.configService.get<string>('LOCK_TIME', '15m'));
      
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const lockedUntil = attempts >= maxAttempts
        ? new Date(Date.now() + lockTimeMinutes * 60 * 1000)
        : null;

      await this.prisma.user.update({
        where: { email: email.toLowerCase() },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil,
        },
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to update login attempts');
    }
  }

  async resetLoginAttempts(email: string) {
    try {
      await this.prisma.user.update({
        where: { email: email.toLowerCase() },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to reset login attempts');
    }
  }

  async isAccountLocked(email: string): Promise<boolean> {
    try {
      const user = await this.findByEmail(email);
      if (!user) return false;

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return true;
      }

      if (user.lockedUntil && user.lockedUntil <= new Date()) {
        await this.resetLoginAttempts(email);
        return false;
      }

      return false;
    } catch (error) {
      throw new InternalServerErrorException('Failed to check account lock status');
    }
  }
}