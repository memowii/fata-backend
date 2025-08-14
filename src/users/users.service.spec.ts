import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

// Mock bcrypt
jest.mock('bcrypt');

describe('UsersService', () => {
  let service: UsersService;
  let prismaService: PrismaService;
  let configService: ConfigService;

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
    refreshToken: 'refresh-token',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
            session: {
              create: jest.fn(),
              deleteMany: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                BCRYPT_ROUNDS: '10',
                MAX_LOGIN_ATTEMPTS: 5,
                LOCK_TIME: '15m',
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prismaService = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    const createUserData = {
      email: 'newuser@example.com',
      password: 'password123',
      name: 'New User',
    };

    it('should successfully create a new user', async () => {
      const expectedUser = {
        id: '123',
        email: createUserData.email.toLowerCase(),
        name: createUserData.name,
        passwordHash: 'hashedPassword',
        emailVerified: false,
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

      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      jest.spyOn(prismaService.user, 'create').mockResolvedValue(expectedUser);

      const result = await service.create(createUserData);

      expect(result).toEqual(expectedUser);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: createUserData.email.toLowerCase() },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(createUserData.password, 10);
      expect(prismaService.user.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if user already exists', async () => {
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser);

      await expect(service.create(createUserData)).rejects.toThrow(ConflictException);
      expect(prismaService.user.create).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      jest.spyOn(prismaService.user, 'create').mockRejectedValue(new Error('Database error'));

      await expect(service.create(createUserData)).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('findById', () => {
    it('should find a user by id', async () => {
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser);

      const result = await service.findById(mockUser.id);

      expect(result).toEqual(mockUser);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
    });

    it('should return null if user not found', async () => {
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);

      const result = await service.findById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      jest.spyOn(prismaService.user, 'findUnique').mockRejectedValue(new Error('Database error'));

      await expect(service.findById(mockUser.id)).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('findByEmail', () => {
    it('should find a user by email', async () => {
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser);

      const result = await service.findByEmail(mockUser.email);

      expect(result).toEqual(mockUser);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: mockUser.email.toLowerCase() },
      });
    });

    it('should return null if user not found', async () => {
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('should handle case-insensitive email search', async () => {
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser);

      await service.findByEmail('TEST@EXAMPLE.COM');

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });
  });

  describe('update', () => {
    const updateUserDto: UpdateUserDto = {
      name: 'Updated Name',
    };

    it('should successfully update a user', async () => {
      const updatedUser = { ...mockUser, name: updateUserDto.name };
      
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser);
      jest.spyOn(prismaService.user, 'update').mockResolvedValue({
        ...mockUser,
        name: updateUserDto.name || null,
        updatedAt: new Date(),
      });

      const result = await service.update(mockUser.id, updateUserDto);

      expect(result.name).toBe(updateUserDto.name);
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: expect.objectContaining(updateUserDto),
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);

      await expect(service.update('non-existent-id', updateUserDto)).rejects.toThrow(NotFoundException);
      expect(prismaService.user.update).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if email already in use', async () => {
      const updateWithEmail: UpdateUserDto = {
        email: 'existing@example.com',
      };
      
      jest.spyOn(prismaService.user, 'findUnique')
        .mockResolvedValueOnce(mockUser) // findById
        .mockResolvedValueOnce({ ...mockUser, id: 'different-id' }); // findByEmail

      await expect(service.update(mockUser.id, updateWithEmail)).rejects.toThrow(ConflictException);
      expect(prismaService.user.update).not.toHaveBeenCalled();
    });
  });

  describe('updatePassword', () => {
    it('should successfully update password', async () => {
      const newPassword = 'NewPassword123!';
      
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPassword');
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser);

      const result = await service.updatePassword(mockUser.id, newPassword);

      expect(result.message).toBe('Password updated successfully');
      expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 10);
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          passwordHash: 'newHashedPassword',
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      });
    });

    it('should handle database errors', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPassword');
      jest.spyOn(prismaService.user, 'update').mockRejectedValue(new Error('Database error'));

      await expect(service.updatePassword(mockUser.id, 'newPassword')).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('updateRefreshToken', () => {
    it('should store refresh token in session', async () => {
      const refreshToken = 'new-refresh-token';
      
      jest.spyOn(prismaService.session, 'create').mockResolvedValue(mockSession);

      await service.updateRefreshToken(mockUser.id, refreshToken);

      expect(prismaService.session.create).toHaveBeenCalledWith({
        data: {
          userId: mockUser.id,
          refreshToken,
          expiresAt: expect.any(Date),
        },
      });
    });

    it('should delete all sessions on logout (null refresh token)', async () => {
      jest.spyOn(prismaService.session, 'deleteMany').mockResolvedValue({ count: 1 });

      await service.updateRefreshToken(mockUser.id, null);

      expect(prismaService.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
      });
      expect(prismaService.session.create).not.toHaveBeenCalled();
    });
  });

  describe('setEmailVerified', () => {
    it('should set email verification status', async () => {
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser);

      await service.setEmailVerified(mockUser.id, true);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          emailVerified: true,
          emailVerificationToken: null,
        },
      });
    });
  });

  describe('setEmailVerificationToken', () => {
    it('should set email verification token', async () => {
      const token = 'verification-token';
      
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser);

      await service.setEmailVerificationToken(mockUser.id, token);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { emailVerificationToken: token },
      });
    });
  });

  describe('setPasswordResetToken', () => {
    it('should set password reset token with expiry', async () => {
      const token = 'reset-token';
      const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now
      
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser);

      await service.setPasswordResetToken(mockUser.id, token, expiresAt);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          passwordResetToken: token,
          passwordResetExpires: expiresAt,
        },
      });
    });
  });

  describe('findByPasswordResetToken', () => {
    it('should find user by valid reset token', async () => {
      const token = 'reset-token';
      const userWithToken = {
        ...mockUser,
        passwordResetToken: token,
        passwordResetExpires: new Date(Date.now() + 3600000),
      };
      
      jest.spyOn(prismaService.user, 'findFirst').mockResolvedValue(userWithToken);

      const result = await service.findByPasswordResetToken(token);

      expect(result).toEqual(userWithToken);
      expect(prismaService.user.findFirst).toHaveBeenCalledWith({
        where: {
          passwordResetToken: token,
          passwordResetExpires: {
            gt: expect.any(Date),
          },
        },
      });
    });

    it('should return null for expired token', async () => {
      jest.spyOn(prismaService.user, 'findFirst').mockResolvedValue(null);

      const result = await service.findByPasswordResetToken('expired-token');

      expect(result).toBeNull();
    });
  });

  describe('findByEmailVerificationToken', () => {
    it('should find user by verification token', async () => {
      const token = 'verification-token';
      const userWithToken = {
        ...mockUser,
        emailVerificationToken: token,
      };
      
      jest.spyOn(prismaService.user, 'findFirst').mockResolvedValue(userWithToken);

      const result = await service.findByEmailVerificationToken(token);

      expect(result).toEqual(userWithToken);
      expect(prismaService.user.findFirst).toHaveBeenCalledWith({
        where: {
          emailVerificationToken: token,
        },
      });
    });
  });

  describe('incrementLoginAttempts', () => {
    it('should increment login attempts', async () => {
      const userWithAttempts = { ...mockUser, failedLoginAttempts: 2 };
      
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(userWithAttempts);
      jest.spyOn(prismaService.user, 'update').mockResolvedValue({
        ...userWithAttempts,
        failedLoginAttempts: 3,
      });

      await service.incrementLoginAttempts(mockUser.email);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { email: mockUser.email.toLowerCase() },
        data: {
          failedLoginAttempts: 3,
          lockedUntil: null,
        },
      });
    });

    it('should lock account after max attempts', async () => {
      const userWithMaxAttempts = { ...mockUser, failedLoginAttempts: 4 };
      
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(userWithMaxAttempts);
      jest.spyOn(prismaService.user, 'update').mockResolvedValue({
        ...userWithMaxAttempts,
        failedLoginAttempts: 5,
        lockedUntil: expect.any(Date),
      });

      await service.incrementLoginAttempts(mockUser.email);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { email: mockUser.email.toLowerCase() },
        data: {
          failedLoginAttempts: 5,
          lockedUntil: expect.any(Date),
        },
      });
    });

    it('should handle non-existent user gracefully', async () => {
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);

      await service.incrementLoginAttempts('nonexistent@example.com');

      expect(prismaService.user.update).not.toHaveBeenCalled();
    });
  });

  describe('resetLoginAttempts', () => {
    it('should reset login attempts', async () => {
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser);

      await service.resetLoginAttempts(mockUser.email);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { email: mockUser.email.toLowerCase() },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    });
  });

  describe('isAccountLocked', () => {
    it('should return true for locked account', async () => {
      const lockedUser = {
        ...mockUser,
        lockedUntil: new Date(Date.now() + 3600000), // 1 hour from now
      };
      
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(lockedUser);

      const result = await service.isAccountLocked(mockUser.email);

      expect(result).toBe(true);
    });

    it('should return false and reset for expired lock', async () => {
      const expiredLockUser = {
        ...mockUser,
        lockedUntil: new Date(Date.now() - 3600000), // 1 hour ago
      };
      
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(expiredLockUser);
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser);

      const result = await service.isAccountLocked(mockUser.email);

      expect(result).toBe(false);
      expect(prismaService.user.update).toHaveBeenCalled();
    });

    it('should return false for unlocked account', async () => {
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser);

      const result = await service.isAccountLocked(mockUser.email);

      expect(result).toBe(false);
    });

    it('should return false for non-existent user', async () => {
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);

      const result = await service.isAccountLocked('nonexistent@example.com');

      expect(result).toBe(false);
    });
  });
});