// gmail.ts
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,       // مثال: hazem.dev@gmail.com
    pass: process.env.GMAIL_APP_PASS,   // App password من Google
  },
});

async function sendEmail(to: string, code: string) {
  try {
    const info = await transporter.sendMail({
      from: `"TioNova" <${process.env.GMAIL_USER}>`,
      to,
      subject: 'Your Verification Code',
      html: `<p>Your code is: <strong>${code}</strong></p>`,
    });
    console.log('Email sent:', info.messageId);
  } catch (error) {
    console.error('Error sending Gmail:', error);
    throw error;
  }
}

export default sendEmail;
