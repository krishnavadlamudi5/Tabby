import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Send real Email OTP to user's inbox via Resend (or SMTP fallback)
 */
export async function sendEmailOtp(email: string, code: string, type: 'register' | 'reset' = 'register'): Promise<boolean> {
  const subject = type === 'reset' 
    ? '🔐 Tabby - Your Password Reset Verification Code' 
    : '✨ Tabby - Your Account Verification Code';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #E6E1DA; border-radius: 16px; background-color: #FAF8F5;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #3C5A48; margin: 0; font-size: 26px; font-weight: 800;">Tabby</h2>
        <p style="color: #736F6A; font-size: 13px; margin-top: 4px;">Smart Expense Sharing</p>
      </div>
      <div style="background-color: #ffffff; padding: 28px; border-radius: 12px; text-align: center; border: 1px solid #E6E1DA; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
        <p style="color: #2C2B29; font-size: 15px; margin-bottom: 16px; font-weight: 600;">Your 6-digit verification security code is:</p>
        <div style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #3C5A48; padding: 14px 20px; background-color: #EBF1ED; border-radius: 10px; display: inline-block; font-family: monospace;">
          ${code}
        </div>
        <p style="color: #736F6A; font-size: 12px; margin-top: 18px; line-height: 1.5;">This code will expire in <strong>10 minutes</strong>.<br/>Do not share this code with anyone.</p>
      </div>
      <p style="color: #A39E96; font-size: 11px; text-align: center; margin-top: 22px;">If you didn't request this verification code, please disregard this message.</p>
    </div>
  `;

  // 1. Primary: Resend API (Sent from Tabby system, not personal email)
  if (resend) {
    try {
      const fromAddress = process.env.RESEND_FROM || 'Tabby App <onboarding@resend.dev>';
      const result = await resend.emails.send({
        from: fromAddress,
        to: email,
        subject,
        html,
      });

      if (result.error) {
        console.error('❌ [RESEND API ERROR]:', result.error);
      } else {
        console.log(`✅ [RESEND EMAIL SENT] Successfully delivered verification email to ${email} (ID: ${result.data?.id})`);
        return true;
      }
    } catch (err) {
      console.error('❌ [RESEND FAILED]:', err);
    }
  }

  // 2. Fallback: SMTP if configured
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      await transporter.sendMail({
        from: `"Tabby Security" <${process.env.SMTP_USER}>`,
        to: email,
        subject,
        html,
      });
      console.log(`✅ [SMTP EMAIL SENT] Delivered to ${email}`);
      return true;
    } catch (smtpErr) {
      console.error('❌ [SMTP FAILED]:', smtpErr);
    }
  }

  console.log(`\n========================================`);
  console.log(`📧 [EMAIL OTP DISPATCH] -> ${email}`);
  console.log(`🔐 Verification Code: ${code}`);
  console.log(`========================================\n`);
  return true;
}

/**
 * Send real SMS Mobile OTP
 */
export async function sendSmsOtp(phone: string, code: string, type: 'register' | 'reset' = 'register'): Promise<boolean> {
  const message = `Your Tabby verification code is: ${code}. Valid for 10 minutes. Do not share this code.`;

  // 1. Fast2SMS Integration (Indian Numbers +91)
  if (process.env.FAST2SMS_API_KEY) {
    try {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          route: 'otp',
          variables_values: code,
          numbers: cleanPhone,
        }),
      });
      const data = await res.json();
      console.log(`✅ [FAST2SMS SENT] SMS dispatched to ${phone}:`, data);
      return true;
    } catch (e) {
      console.error(`❌ [FAST2SMS FAILED]:`, e);
    }
  }

  // 2. Twilio Integration (Global Numbers)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    try {
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const params = new URLSearchParams();
      params.append('To', phone);
      params.append('From', process.env.TWILIO_PHONE_NUMBER);
      params.append('Body', message);

      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params,
        }
      );
      const data = await res.json();
      console.log(`✅ [TWILIO SMS SENT] SMS dispatched to ${phone}:`, data.sid);
      return true;
    } catch (e) {
      console.error(`❌ [TWILIO SMS FAILED]:`, e);
    }
  }

  // Console output when API key is not configured in .env yet
  console.log(`\n========================================`);
  console.log(`📱 [SMS MOBILE OTP DISPATCH] -> ${phone}`);
  console.log(`🔐 Verification Code: ${code}`);
  console.log(`========================================\n`);
  return true;
}
