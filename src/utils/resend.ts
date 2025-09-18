// resend.ts
import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY ?? '');

async function sendVerificationEmail(to: string, code: string) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev', // العنوان المجاني المقدم من Resend
      to,
      subject: 'Verify your Buldm account',
      html: `<p>Your verification code is: <strong>${code}</strong></p>`,
    });

    if (error) {
      console.error('Email send error:', error);
      throw new Error('Failed to send verification email.');
    }

    console.log('Verification email sent to:', to);
  } catch (err) {
    console.error('Resend error:', err);
    throw err;
  }
}

export default sendVerificationEmail;
