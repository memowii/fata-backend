import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { SendEmailDto } from './dto/send-email.dto';
import { SESProvider } from './providers/ses.provider';

@Processor('email')
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);
  private sesProvider: SESProvider;
  private compiledTemplates: Map<string, handlebars.TemplateDelegate> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.sesProvider = new SESProvider(configService);
    this.loadTemplates();
    this.verifyEmailService();
  }

  private async verifyEmailService() {
    const isReady = await this.sesProvider.verifyConnection();
    if (isReady) {
      this.logger.log('Email service ready with AWS SES');
    } else {
      this.logger.warn('Email service running in development mode (no AWS SES)');
    }
  }

  private loadTemplates() {
    const templateFiles = ['verify-email.hbs', 'reset-password.hbs'];

    // Try multiple possible locations due to NestJS build path variations
    const possibleDirs = [
      path.join(__dirname, 'templates'), // Default expected path
      '/usr/src/app/dist/email/templates', // Actual path in container
      path.join(process.cwd(), 'dist/email/templates'),
      path.join(process.cwd(), 'src/email/templates'),
    ];

    let foundDir: string | null = null;
    for (const dir of possibleDirs) {
      if (fs.existsSync(dir)) {
        foundDir = dir;
        break;
      }
    }

    if (!foundDir) {
      this.logger.error('Template directory not found. Searched:', possibleDirs);
      return;
    }

    this.logger.log(`Loading email templates from: ${foundDir}`);
    
    templateFiles.forEach((file) => {
      const templatePath = path.join(foundDir, file);
      
      if (fs.existsSync(templatePath)) {
        const templateSource = fs.readFileSync(templatePath, 'utf-8');
        const compiledTemplate = handlebars.compile(templateSource);
        const templateName = file.replace('.hbs', '');
        this.compiledTemplates.set(templateName, compiledTemplate);
        this.logger.log(`✅ Template loaded: ${templateName}`);
      } else {
        this.logger.error(`❌ Template not found: ${templatePath}`);
      }
    });
    
    if (this.compiledTemplates.size > 0) {
      this.logger.log(`✅ Successfully loaded ${this.compiledTemplates.size} email templates`);
    } else {
      this.logger.error('❌ No email templates were loaded!');
    }
  }

  @Process('send')
  async handleSendEmail(job: Job<SendEmailDto>) {
    const { to, subject, text, html, template, context } = job.data;

    try {
      let emailHtml = html;

      if (template && this.compiledTemplates.has(template)) {
        const compiledTemplate = this.compiledTemplates.get(template);
        if (compiledTemplate) {
          emailHtml = compiledTemplate({
            ...context,
            currentYear: new Date().getFullYear(),
            appName: this.configService.get<string>('APP_NAME', 'From Article to Audio'),
          });
        }
      }

      const result = await this.sesProvider.sendEmail({
        to,
        subject,
        html: emailHtml || '',
        text: text,
      });

      if (result) {
        this.logger.log(`Email sent successfully to ${to}. MessageId: ${result.MessageId}`);
        return {
          messageId: result.MessageId,
          status: 'sent',
          timestamp: new Date().toISOString(),
        };
      } else {
        throw new Error('Failed to send email - no result returned');
      }
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  @Process('verify-email')
  async handleVerifyEmail(job: Job<{
    to: string;
    name: string;
    verificationUrl: string;
  }>) {
    const { to, name, verificationUrl } = job.data;

    try {
      const compiledTemplate = this.compiledTemplates.get('verify-email');
      if (!compiledTemplate) {
        throw new Error('Verification email template not found');
      }

      const emailHtml = compiledTemplate({
        name,
        verificationUrl,
        expiresIn: this.configService.get<string>('EMAIL_VERIFICATION_EXPIRY', '24 hours'),
        currentYear: new Date().getFullYear(),
        appName: this.configService.get<string>('APP_NAME', 'From Article to Audio'),
      });

      const result = await this.sesProvider.sendEmail({
        to,
        subject: 'Verify Your Email Address',
        html: emailHtml,
      });

      if (result) {
        this.logger.log(`Verification email sent to ${to}. MessageId: ${result.MessageId}`);
        return {
          messageId: result.MessageId,
          status: 'sent',
          type: 'verification',
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${to}:`, error);
      throw error;
    }
  }

  @Process('reset-password')
  async handleResetPassword(job: Job<{
    to: string;
    name: string;
    email: string;
    resetUrl: string;
  }>) {
    const { to, name, email, resetUrl } = job.data;

    try {
      const compiledTemplate = this.compiledTemplates.get('reset-password');
      if (!compiledTemplate) {
        throw new Error('Password reset email template not found');
      }

      const emailHtml = compiledTemplate({
        name,
        email,
        resetUrl,
        expiresIn: this.configService.get<string>('PASSWORD_RESET_EXPIRY', '1 hour'),
        currentYear: new Date().getFullYear(),
        appName: this.configService.get<string>('APP_NAME', 'From Article to Audio'),
      });

      const result = await this.sesProvider.sendEmail({
        to,
        subject: 'Reset Your Password',
        html: emailHtml,
      });

      if (result) {
        this.logger.log(`Password reset email sent to ${to}. MessageId: ${result.MessageId}`);
        return {
          messageId: result.MessageId,
          status: 'sent',
          type: 'password-reset',
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${to}:`, error);
      throw error;
    }
  }
}