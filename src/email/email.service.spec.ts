import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';
import { Logger } from '@nestjs/common';
import { EmailService } from './email.service';
import { SendEmailDto } from './dto/send-email.dto';

// Mock logger to prevent console output during tests
jest.spyOn(Logger.prototype, 'log').mockImplementation();
jest.spyOn(Logger.prototype, 'error').mockImplementation();
jest.spyOn(Logger.prototype, 'warn').mockImplementation();
jest.spyOn(Logger.prototype, 'debug').mockImplementation();

describe('EmailService', () => {
  let service: EmailService;
  let emailQueue: Queue;
  let configService: ConfigService;

  const mockJob = {
    id: '123',
    data: {},
    progress: jest.fn().mockReturnValue(0),
    timestamp: Date.now(),
    processedOn: null,
    finishedOn: null,
    failedReason: null,
    getState: jest.fn().mockResolvedValue('waiting'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: getQueueToken('email'),
          useValue: {
            add: jest.fn(),
            getJob: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                FRONTEND_URL: 'http://localhost:3000',
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    emailQueue = module.get<Queue>(getQueueToken('email'));
    configService = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
  });

  describe('sendEmail', () => {
    it('should successfully queue an email', async () => {
      const sendEmailDto: SendEmailDto = {
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
      };

      jest.spyOn(emailQueue, 'add').mockResolvedValue(mockJob as any);

      const result = await service.sendEmail(sendEmailDto);

      expect(result).toEqual({
        jobId: mockJob.id,
        status: 'queued',
      });
      expect(emailQueue.add).toHaveBeenCalledWith('send', sendEmailDto, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });
    });

    it('should handle queue errors', async () => {
      const sendEmailDto: SendEmailDto = {
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
      };

      const error = new Error('Queue error');
      jest.spyOn(emailQueue, 'add').mockRejectedValue(error);

      await expect(service.sendEmail(sendEmailDto)).rejects.toThrow(error);
    });
  });

  describe('sendVerificationEmail', () => {
    it('should successfully queue a verification email', async () => {
      const to = 'test@example.com';
      const name = 'Test User';
      const token = 'verification-token';

      jest.spyOn(emailQueue, 'add').mockResolvedValue(mockJob as any);

      const result = await service.sendVerificationEmail(to, name, token);

      expect(result).toEqual({
        jobId: mockJob.id,
        status: 'queued',
      });
      expect(emailQueue.add).toHaveBeenCalledWith(
        'verify-email',
        {
          to,
          name,
          verificationUrl: `http://localhost:3000/verify-email?token=${token}`,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );
    });

    it('should use custom frontend URL from config', async () => {
      const to = 'test@example.com';
      const name = 'Test User';
      const token = 'verification-token';
      const customUrl = 'https://app.example.com';

      jest.spyOn(configService, 'get').mockReturnValue(customUrl);
      jest.spyOn(emailQueue, 'add').mockResolvedValue(mockJob as any);

      await service.sendVerificationEmail(to, name, token);

      expect(emailQueue.add).toHaveBeenCalledWith(
        'verify-email',
        expect.objectContaining({
          verificationUrl: `${customUrl}/verify-email?token=${token}`,
        }),
        expect.any(Object),
      );
    });

    it('should handle queue errors', async () => {
      const error = new Error('Queue error');
      jest.spyOn(emailQueue, 'add').mockRejectedValue(error);

      await expect(
        service.sendVerificationEmail('test@example.com', 'Test User', 'token'),
      ).rejects.toThrow(error);
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should successfully queue a password reset email', async () => {
      const to = 'test@example.com';
      const name = 'Test User';
      const email = 'test@example.com';
      const token = 'reset-token';

      jest.spyOn(emailQueue, 'add').mockResolvedValue(mockJob as any);

      const result = await service.sendPasswordResetEmail(to, name, email, token);

      expect(result).toEqual({
        jobId: mockJob.id,
        status: 'queued',
      });
      expect(emailQueue.add).toHaveBeenCalledWith(
        'reset-password',
        {
          to,
          name,
          email,
          resetUrl: `http://localhost:3000/reset-password?token=${token}`,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );
    });

    it('should use custom frontend URL from config', async () => {
      const to = 'test@example.com';
      const name = 'Test User';
      const email = 'test@example.com';
      const token = 'reset-token';
      const customUrl = 'https://app.example.com';

      jest.spyOn(configService, 'get').mockReturnValue(customUrl);
      jest.spyOn(emailQueue, 'add').mockResolvedValue(mockJob as any);

      await service.sendPasswordResetEmail(to, name, email, token);

      expect(emailQueue.add).toHaveBeenCalledWith(
        'reset-password',
        expect.objectContaining({
          resetUrl: `${customUrl}/reset-password?token=${token}`,
        }),
        expect.any(Object),
      );
    });

    it('should handle queue errors', async () => {
      const error = new Error('Queue error');
      jest.spyOn(emailQueue, 'add').mockRejectedValue(error);

      await expect(
        service.sendPasswordResetEmail('test@example.com', 'Test User', 'test@example.com', 'token'),
      ).rejects.toThrow(error);
    });
  });

  describe('getJobStatus', () => {
    it('should get job status successfully', async () => {
      const jobId = '123';
      const mockJobWithState = {
        ...mockJob,
        state: 'completed',
        progress: jest.fn().mockReturnValue(100),
      };

      jest.spyOn(emailQueue, 'getJob').mockResolvedValue(mockJobWithState as any);

      const result = await service.getJobStatus(jobId);

      expect(result).toEqual({
        id: mockJob.id,
        state: 'waiting',
        progress: 100,
        data: mockJob.data,
        failedReason: mockJob.failedReason,
        timestamp: mockJob.timestamp,
        processedOn: mockJob.processedOn,
        finishedOn: mockJob.finishedOn,
      });
      expect(emailQueue.getJob).toHaveBeenCalledWith(jobId);
    });

    it('should return null for non-existent job', async () => {
      jest.spyOn(emailQueue, 'getJob').mockResolvedValue(null);

      const result = await service.getJobStatus('non-existent');

      expect(result).toBeNull();
    });

    it('should handle different job states', async () => {
      const states = ['waiting', 'active', 'completed', 'failed', 'delayed'];
      
      for (const state of states) {
        const mockJobWithState = {
          ...mockJob,
          progress: jest.fn().mockReturnValue(0),
          getState: jest.fn().mockResolvedValue(state),
        };
        
        jest.spyOn(emailQueue, 'getJob').mockResolvedValue(mockJobWithState as any);

        const result = await service.getJobStatus('123');

        expect(result!.state).toBe(state);
      }
    });

    it('should handle failed jobs with reason', async () => {
      const failedJob = {
        ...mockJob,
        progress: jest.fn().mockReturnValue(0),
        getState: jest.fn().mockResolvedValue('failed'),
        failedReason: 'Connection timeout',
      };

      jest.spyOn(emailQueue, 'getJob').mockResolvedValue(failedJob as any);

      const result = await service.getJobStatus('123');

      expect(result!.state).toBe('failed');
      expect(result!.failedReason).toBe('Connection timeout');
    });

    it('should handle errors when getting job status', async () => {
      const error = new Error('Database error');
      jest.spyOn(emailQueue, 'getJob').mockRejectedValue(error);

      await expect(service.getJobStatus('123')).rejects.toThrow(error);
    });
  });
});