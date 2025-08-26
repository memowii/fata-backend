# AWS SES Email Configuration

## Overview
This application uses AWS Simple Email Service (SES) for sending transactional emails like verification emails and password resets. The implementation replaces the traditional SMTP setup with direct AWS SES API calls for better deliverability and scalability.

## Configuration

### Environment Variables
Add these to your `.env` file:

```env
# AWS SES Configuration
AWS_REGION=us-east-1                    # AWS region where SES is configured
AWS_ACCESS_KEY_ID=your-access-key       # IAM user access key
AWS_SECRET_ACCESS_KEY=your-secret-key   # IAM user secret key
AWS_SES_FROM_EMAIL=noreply@yourdomain.com  # Verified sender email
AWS_SES_FROM_NAME=From Article to Audio    # Display name for emails
AWS_SES_CONFIGURATION_SET=your-config-set  # Optional: for tracking
```

### Development Mode
If AWS credentials are not configured, the application runs in development mode where emails are simulated and logged to the console instead of being sent.

## AWS Setup Steps

### 1. Create IAM User
Create an IAM user with the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:GetSendQuota"
      ],
      "Resource": "*"
    }
  ]
}
```

### 2. Verify Domain or Email
1. Go to AWS SES Console
2. Navigate to "Verified identities"
3. Add and verify your domain or email address
4. Follow the verification instructions (DNS records for domain, or click link for email)

### 3. Move Out of Sandbox (Production Only)
New AWS accounts start in sandbox mode with limitations:
- Can only send to verified emails
- Limited to 200 emails per day
- 1 email per second

To move to production:
1. Go to AWS SES Console
2. Click "Request production access"
3. Fill out the form with your use case
4. Wait for approval (usually 24-48 hours)

### 4. Configure Bounce and Complaint Handling (Optional)
1. Create an SNS topic for bounce/complaint notifications
2. Subscribe your endpoint to the topic
3. Configure SES to send notifications to the SNS topic

## Features

### Email Types Supported
- **Verification Emails**: Sent when users register
- **Password Reset Emails**: Sent when users request password reset
- **Generic Emails**: Support for any custom email template

### Templates
Email templates are stored in `src/email/templates/`:
- `verify-email.hbs`: Email verification template
- `reset-password.hbs`: Password reset template

Templates use Handlebars for dynamic content rendering.

### Queue Processing
Emails are processed through a Bull queue backed by Redis:
- Automatic retry on failure (3 attempts)
- Exponential backoff
- Dead letter queue for failed emails

## Testing

### Local Development
Without AWS credentials, the system automatically runs in development mode:
```bash
# Logs will show:
# AWS SES credentials not configured. Email sending will be simulated in development mode.
```

### With AWS Credentials
To test with real AWS SES:
1. Configure your AWS credentials in `.env`
2. Ensure your sender email is verified
3. Test with verified recipient emails (if in sandbox)

### Unit Tests
```bash
# Run SES provider tests
docker compose exec app yarn test src/email/providers/ses.provider.spec.ts
```

## Monitoring

### CloudWatch Metrics
AWS SES automatically provides metrics in CloudWatch:
- Send rate
- Bounce rate
- Complaint rate
- Delivery rate

### Message IDs
Every email sent returns a unique MessageId from AWS SES which can be used for tracking in CloudWatch Logs.

### Configuration Sets
Use Configuration Sets for advanced tracking:
1. Create a Configuration Set in AWS SES Console
2. Add event publishing (SNS, CloudWatch, Kinesis)
3. Set `AWS_SES_CONFIGURATION_SET` in your `.env`

## Troubleshooting

### Common Issues

#### "Sender domain not verified"
- Ensure your sender email/domain is verified in AWS SES
- Check you're using the correct AWS region

#### "Rate exceeded"
- Check your SES sending limits in AWS Console
- Implement rate limiting in your application

#### "Message rejected"
- Check email content for spam triggers
- Ensure recipient email is valid
- If in sandbox, verify recipient email

#### Development mode always active
- Check AWS credentials are properly set in `.env`
- Ensure the Docker container has access to environment variables
- Restart the container after updating `.env`

## Cost

AWS SES Pricing (as of 2024):
- $0.10 per 1,000 emails sent
- No charge for receiving emails
- Data transfer charges may apply

## Migration from SMTP

If migrating from SMTP to AWS SES:
1. Keep SMTP configuration as fallback (commented out)
2. Test thoroughly with AWS SES in staging
3. Monitor delivery rates
4. Gradually migrate production traffic

## Security Best Practices

1. **Never commit AWS credentials** - Use environment variables
2. **Use IAM roles in production** - Better than access keys
3. **Rotate access keys regularly** - If using keys
4. **Monitor bounce/complaint rates** - Stay under AWS thresholds
5. **Implement rate limiting** - Prevent abuse
6. **Validate email addresses** - Before sending
7. **Use Configuration Sets** - For tracking and monitoring

## Support

For AWS SES issues:
- [AWS SES Documentation](https://docs.aws.amazon.com/ses/)
- [AWS SES Best Practices](https://docs.aws.amazon.com/ses/latest/dg/best-practices.html)
- [AWS Support Center](https://console.aws.amazon.com/support/)

For application issues:
- Check logs: `docker compose logs app | grep -i ses`
- Check email queue: Monitor Bull dashboard
- Verify credentials: Test with AWS CLI