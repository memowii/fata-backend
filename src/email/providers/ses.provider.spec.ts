import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { SESProvider } from './ses.provider';

// Mock AWS SDK
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  SendEmailCommand: jest.fn().mockImplementation((params) => params),
  GetSendQuotaCommand: jest.fn().mockImplementation(() => ({})),
  MessageRejected: class MessageRejected extends Error {},
  MailFromDomainNotVerifiedException: class MailFromDomainNotVerifiedException extends Error {},
  ConfigurationSetDoesNotExistException: class ConfigurationSetDoesNotExistException extends Error {},
}));

// Mock logger to prevent console output during tests
jest.spyOn(Logger.prototype, 'log').mockImplementation();
jest.spyOn(Logger.prototype, 'error').mockImplementation();
jest.spyOn(Logger.prototype, 'warn').mockImplementation();

describe('SESProvider', () => {
  let provider: SESProvider;
  let configService: ConfigService;

  describe('with AWS credentials', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SESProvider,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: any) => {
                const config = {
                  AWS_ACCESS_KEY_ID: 'test-access-key',
                  AWS_SECRET_ACCESS_KEY: 'test-secret-key',
                  AWS_REGION: 'us-east-1',
                  AWS_SES_FROM_EMAIL: 'test@example.com',
                  AWS_SES_FROM_NAME: 'Test App',
                  AWS_SES_CONFIGURATION_SET: 'test-config-set',
                };
                return config[key] || defaultValue;
              }),
            },
          },
        ],
      }).compile();

      provider = module.get<SESProvider>(SESProvider);
      configService = module.get<ConfigService>(ConfigService);
    });

    it('should be defined', () => {
      expect(provider).toBeDefined();
    });

    it('should initialize with AWS credentials', () => {
      expect(provider.isReady()).toBe(true);
    });

    it('should send email successfully', async () => {
      const mockSESClient = {
        send: jest.fn().mockResolvedValue({
          MessageId: 'test-message-id',
          $metadata: {
            httpStatusCode: 200,
            requestId: 'test-request-id',
            attempts: 1,
            totalRetryDelay: 0,
          },
        }),
      };

      (provider as any).sesClient = mockSESClient;

      const result = await provider.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test content</p>',
      });

      expect(result).toBeDefined();
      expect(result?.MessageId).toBe('test-message-id');
      expect(mockSESClient.send).toHaveBeenCalled();
    });

    it('should send email with multiple recipients', async () => {
      const mockSESClient = {
        send: jest.fn().mockResolvedValue({
          MessageId: 'test-message-id-multi',
          $metadata: { httpStatusCode: 200 },
        }),
      };

      (provider as any).sesClient = mockSESClient;

      const result = await provider.sendEmail({
        to: ['recipient1@example.com', 'recipient2@example.com'],
        subject: 'Test Subject',
        html: '<p>Test content</p>',
      });

      expect(result).toBeDefined();
      expect(result?.MessageId).toBe('test-message-id-multi');
    });

    it('should include text version when provided', async () => {
      const mockSESClient = {
        send: jest.fn().mockResolvedValue({
          MessageId: 'test-message-id',
          $metadata: { httpStatusCode: 200 },
        }),
      };

      (provider as any).sesClient = mockSESClient;

      await provider.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test content</p>',
        text: 'Test content plain text',
      });

      const sendCall = mockSESClient.send.mock.calls[0][0];
      expect(sendCall.Message.Body.Text.Data).toBe('Test content plain text');
    });

    it('should generate plain text from HTML when not provided', async () => {
      const mockSESClient = {
        send: jest.fn().mockResolvedValue({
          MessageId: 'test-message-id',
          $metadata: { httpStatusCode: 200 },
        }),
      };

      (provider as any).sesClient = mockSESClient;

      await provider.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test <strong>content</strong></p>',
      });

      const sendCall = mockSESClient.send.mock.calls[0][0];
      expect(sendCall.Message.Body.Text.Data).toContain('Test content');
    });

    it('should handle SES errors properly', async () => {
      const mockSESClient = {
        send: jest.fn().mockRejectedValue(new Error('SES Error')),
      };

      (provider as any).sesClient = mockSESClient;

      await expect(
        provider.sendEmail({
          to: 'recipient@example.com',
          subject: 'Test Subject',
          html: '<p>Test content</p>',
        }),
      ).rejects.toThrow('SES Error');
    });

    it('should verify connection successfully', async () => {
      const mockSESClient = {
        send: jest.fn().mockResolvedValue({}),
      };

      (provider as any).sesClient = mockSESClient;

      const result = await provider.verifyConnection();
      expect(result).toBe(true);
    });

    it('should handle connection verification failure', async () => {
      const mockSESClient = {
        send: jest.fn().mockRejectedValue(new Error('Connection failed')),
      };

      (provider as any).sesClient = mockSESClient;

      const result = await provider.verifyConnection();
      expect(result).toBe(false);
    });
  });

  describe('without AWS credentials (development mode)', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SESProvider,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: any) => {
                const config = {
                  AWS_REGION: 'us-east-1',
                  AWS_SES_FROM_EMAIL: 'test@example.com',
                  AWS_SES_FROM_NAME: 'Test App',
                };
                return config[key] || defaultValue;
              }),
            },
          },
        ],
      }).compile();

      provider = module.get<SESProvider>(SESProvider);
      configService = module.get<ConfigService>(ConfigService);
    });

    it('should work in development mode without credentials', () => {
      expect(provider).toBeDefined();
      expect(provider.isReady()).toBe(false);
    });

    it('should simulate email sending in development mode', async () => {
      const result = await provider.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test content</p>',
      });

      expect(result).toBeDefined();
      expect(result?.MessageId).toContain('dev-');
      expect(result?.$metadata.httpStatusCode).toBe(200);
    });

    it('should return false for connection verification in dev mode', async () => {
      const result = await provider.verifyConnection();
      expect(result).toBe(false);
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SESProvider,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: any) => {
                const config = {
                  AWS_ACCESS_KEY_ID: 'test-access-key',
                  AWS_SECRET_ACCESS_KEY: 'test-secret-key',
                  AWS_REGION: 'us-east-1',
                  AWS_SES_FROM_EMAIL: 'test@example.com',
                  AWS_SES_FROM_NAME: 'Test App',
                };
                return config[key] || defaultValue;
              }),
            },
          },
        ],
      }).compile();

      provider = module.get<SESProvider>(SESProvider);
    });

    it('should handle HTML entities properly', async () => {
      const mockSESClient = {
        send: jest.fn().mockResolvedValue({
          MessageId: 'test-message-id',
          $metadata: { httpStatusCode: 200 },
        }),
      };

      (provider as any).sesClient = mockSESClient;

      await provider.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>&amp; &lt; &gt; &quot; &nbsp;</p>',
      });

      const sendCall = mockSESClient.send.mock.calls[0][0];
      expect(sendCall.Message.Body.Text.Data).toContain('& < > "');
    });

    it('should strip script and style tags from HTML', async () => {
      const mockSESClient = {
        send: jest.fn().mockResolvedValue({
          MessageId: 'test-message-id',
          $metadata: { httpStatusCode: 200 },
        }),
      };

      (provider as any).sesClient = mockSESClient;

      await provider.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Content</p><script>alert("test")</script><style>body{color:red}</style>',
      });

      const sendCall = mockSESClient.send.mock.calls[0][0];
      expect(sendCall.Message.Body.Text.Data).not.toContain('alert');
      expect(sendCall.Message.Body.Text.Data).not.toContain('color:red');
      expect(sendCall.Message.Body.Text.Data).toContain('Content');
    });
  });
});