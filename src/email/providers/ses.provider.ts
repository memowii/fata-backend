import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
  SendEmailCommandOutput,
  MessageRejected,
  MailFromDomainNotVerifiedException,
  ConfigurationSetDoesNotExistException,
} from '@aws-sdk/client-ses';

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
}

@Injectable()
export class SESProvider {
  private readonly logger = new Logger(SESProvider.name);
  private sesClient: SESClient;
  private fromEmail: string;
  private fromName: string;
  private configurationSet?: string;
  private isConfigured: boolean = false;

  constructor(private readonly configService: ConfigService) {
    this.initializeSES();
  }

  private initializeSES() {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');

    // Check if AWS credentials are configured
    if (!accessKeyId || !secretAccessKey) {
      this.logger.warn(
        'AWS SES credentials not configured. Email sending will be simulated in development mode.',
      );
      this.isConfigured = false;
      return;
    }

    try {
      this.sesClient = new SESClient({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });

      this.fromEmail = this.configService.get<string>(
        'AWS_SES_FROM_EMAIL',
        'noreply@example.com',
      );
      this.fromName = this.configService.get<string>(
        'AWS_SES_FROM_NAME',
        'From Article to Audio',
      );
      this.configurationSet = this.configService.get<string>('AWS_SES_CONFIGURATION_SET');

      this.isConfigured = true;
      this.logger.log(`AWS SES initialized for region: ${region}`);
    } catch (error) {
      this.logger.error('Failed to initialize AWS SES:', error);
      this.isConfigured = false;
    }
  }

  private formatSource(): string {
    if (this.fromName) {
      return `"${this.fromName}" <${this.fromEmail}>`;
    }
    return this.fromEmail;
  }

  private convertToArray(input: string | string[]): string[] {
    return Array.isArray(input) ? input : [input];
  }

  private generatePlainText(html: string): string {
    // Simple HTML to text conversion
    // In production, you might want to use a library like html-to-text
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailCommandOutput | null> {
    // Development mode - simulate email sending
    if (!this.isConfigured) {
      this.logger.log('Development mode - Simulating email send:');
      this.logger.log(`To: ${params.to}`);
      this.logger.log(`Subject: ${params.subject}`);
      this.logger.log(`HTML content length: ${params.html.length} characters`);
      
      // Return a mock response
      return {
        MessageId: `dev-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        $metadata: {
          httpStatusCode: 200,
          requestId: 'dev-request-id',
          attempts: 1,
          totalRetryDelay: 0,
        },
      };
    }

    try {
      const toAddresses = this.convertToArray(params.to);
      const text = params.text || this.generatePlainText(params.html);

      const emailParams: SendEmailCommandInput = {
        Source: this.formatSource(),
        Destination: {
          ToAddresses: toAddresses,
          CcAddresses: params.cc,
          BccAddresses: params.bcc,
        },
        Message: {
          Subject: {
            Data: params.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: params.html,
              Charset: 'UTF-8',
            },
            Text: {
              Data: text,
              Charset: 'UTF-8',
            },
          },
        },
        ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
        ConfigurationSetName: this.configurationSet,
      };

      const command = new SendEmailCommand(emailParams);
      const result = await this.sesClient.send(command);

      this.logger.log(
        `Email sent successfully via AWS SES. MessageId: ${result.MessageId}`,
      );

      return result;
    } catch (error) {
      // Handle specific AWS SES errors
      if (error instanceof MessageRejected) {
        this.logger.error('Email rejected by AWS SES:', error.message);
      } else if (error instanceof MailFromDomainNotVerifiedException) {
        this.logger.error('Sender domain not verified in AWS SES:', error.message);
      } else if (error instanceof ConfigurationSetDoesNotExistException) {
        this.logger.error('Configuration set does not exist:', error.message);
      } else {
        this.logger.error('Failed to send email via AWS SES:', error);
      }

      throw error;
    }
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn('AWS SES not configured - running in development mode');
      return false;
    }

    try {
      // Send a test command to verify credentials and configuration
      // We'll use getSendQuota as a lightweight check
      const { SESClient, GetSendQuotaCommand } = await import('@aws-sdk/client-ses');
      const command = new GetSendQuotaCommand({});
      await this.sesClient.send(command as any);
      
      this.logger.log('AWS SES connection verified successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to verify AWS SES connection:', error);
      return false;
    }
  }

  isReady(): boolean {
    return this.isConfigured;
  }
}