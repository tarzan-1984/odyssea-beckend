# Mailer Service

This module provides email functionality for the Odyssea backend application.

## Features

- SMTP email sending with nodemailer
- HTML and text email support
- Configurable SMTP settings
- Error handling and logging
- Email templates for OTP and password reset

## Configuration

Add the following environment variables to your `.env` file:

```env
# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com

# Frontend URL for password reset links
FRONTEND_URL=http://localhost:3000
```

## Usage

### Basic Usage

```typescript
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class YourService {
  constructor(private readonly mailerService: MailerService) {}

  async sendWelcomeEmail(userEmail: string, userName: string) {
    const success = await this.mailerService.sendHtmlEmail(
      userEmail,
      'Welcome to Odyssea',
      `<h1>Welcome ${userName}!</h1><p>Thank you for joining us.</p>`
    );
    
    if (!success) {
      throw new Error('Failed to send welcome email');
    }
  }
}
```

### Available Methods

- `sendMail(options: SendMailOptions): Promise<boolean>` - Send email with full options
- `sendTextEmail(to: string, subject: string, text: string): Promise<boolean>` - Send plain text email
- `sendHtmlEmail(to: string, subject: string, html: string): Promise<boolean>` - Send HTML email
- `sendEmail(to: string, subject: string, text: string, html?: string): Promise<boolean>` - Send email with both text and HTML

## Email Templates

The service includes built-in templates for common use cases:

### OTP Email Template
Used for sending one-time password codes during login.

### Password Reset Template
Used for sending password reset links with a styled button.

## Testing

Run the mailer service tests:

```bash
yarn test src/mailer/mailer.service.spec.ts
```

## Troubleshooting

1. **SMTP Connection Failed**: Check your SMTP credentials and ensure the server allows connections from your IP.

2. **Gmail Setup**: For Gmail, you need to:
   - Enable 2-factor authentication
   - Generate an App Password
   - Use the App Password instead of your regular password

3. **Port Issues**: Make sure the SMTP port (usually 587 or 465) is not blocked by your firewall.

## Security Notes

- Never commit SMTP credentials to version control
- Use environment variables for all sensitive configuration
- Consider using a dedicated email service (SendGrid, Mailgun, etc.) for production
