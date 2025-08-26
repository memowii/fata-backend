import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { SendEmailDto } from './dto/send-email.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @InjectQueue('email') private readonly emailQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async sendEmail(sendEmailDto: SendEmailDto) {
    try {
      const job = await this.emailQueue.add('send', sendEmailDto, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });

      this.logger.log(`Email job queued with ID: ${job.id}`);
      return { jobId: job.id, status: 'queued' };
    } catch (error) {
      this.logger.error('Failed to queue email:', error);
      throw error;
    }
  }

  async sendVerificationEmail(to: string, name: string, token: string) {
    try {
      const baseUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
      const verificationUrl = `${baseUrl}/verify-email?token=${token}`;

      const job = await this.emailQueue.add(
        'verify-email',
        {
          to,
          name,
          verificationUrl,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      this.logger.log(`Verification email job queued with ID: ${job.id}`);
      return { jobId: job.id, status: 'queued' };
    } catch (error) {
      this.logger.error('Failed to queue verification email:', error);
      throw error;
    }
  }

  async sendPasswordResetEmail(to: string, name: string, email: string, token: string) {
    try {
      const baseUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      const job = await this.emailQueue.add(
        'reset-password',
        {
          to,
          name,
          email,
          resetUrl,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      this.logger.log(`Password reset email job queued with ID: ${job.id}`);
      return { jobId: job.id, status: 'queued' };
    } catch (error) {
      this.logger.error('Failed to queue password reset email:', error);
      throw error;
    }
  }

  async getJobStatus(jobId: string | number) {
    try {
      const job = await this.emailQueue.getJob(jobId);
      
      if (!job) {
        return null;
      }

      const state = await job.getState();
      const progress = job.progress();

      return {
        id: job.id,
        state,
        progress,
        data: job.data,
        failedReason: job.failedReason,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
      };
    } catch (error) {
      this.logger.error('Failed to get job status:', error);
      throw error;
    }
  }
}