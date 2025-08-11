import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { SendEmailDto } from './dto/send-email.dto';

@Processor('email')
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);
  private transporter: nodemailer.Transporter;
  private compiledTemplates: Map<string, handlebars.TemplateDelegate> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      secure: this.configService.get<number>('SMTP_PORT') === 465,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });

    this.loadTemplates();
  }

  private loadTemplates() {
    const templatesDir = path.join(__dirname, 'templates');
    const templateFiles = ['verify-email.hbs', 'reset-password.hbs'];

    templateFiles.forEach((file) => {
      const templatePath = path.join(templatesDir, file);
      if (fs.existsSync(templatePath)) {
        const templateSource = fs.readFileSync(templatePath, 'utf-8');
        const compiledTemplate = handlebars.compile(templateSource);
        const templateName = file.replace('.hbs', '');
        this.compiledTemplates.set(templateName, compiledTemplate);
      }
    });
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

      const mailOptions: nodemailer.SendMailOptions = {
        from: this.configService.get<string>('EMAIL_FROM'),
        to,
        subject,
        text,
        html: emailHtml,
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      this.logger.log(`Email sent successfully to ${to}: ${info.messageId}`);
      return info;
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
      const emailData: SendEmailDto = {
        to,
        subject: 'Verify Your Email Address',
        template: 'verify-email',
        context: {
          name,
          verificationUrl,
          expiresIn: this.configService.get<string>('EMAIL_VERIFICATION_EXPIRY', '24 hours'),
        },
      };

      return this.handleSendEmail({ data: emailData } as Job<SendEmailDto>);
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
      const emailData: SendEmailDto = {
        to,
        subject: 'Reset Your Password',
        template: 'reset-password',
        context: {
          name,
          email,
          resetUrl,
          expiresIn: this.configService.get<string>('PASSWORD_RESET_EXPIRY', '1 hour'),
        },
      };

      return this.handleSendEmail({ data: emailData } as Job<SendEmailDto>);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${to}:`, error);
      throw error;
    }
  }
}