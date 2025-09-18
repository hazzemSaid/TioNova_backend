import * as dotenv from "dotenv";
import { EmailParams, MailerSend, Recipient, Sender } from 'mailersend';
dotenv.config()
// Initialize Mailersend with your API key
const mailerSend = new MailerSend({
	apiKey:  process.env.api_mailsender ?? "",  // Your Mailersend API key
});
const senderemail:string = process.env.sender_email ?? "";

// Define the sender's information
const sentFrom = new Sender(senderemail, "Buldm");  // Replace with your verified email and name

// Define the recipient's information


async function sendEmail(to: string, code: string) {
	try {
		const recipients = [
			new Recipient(to, to.split('@')[0])  // Replace with the recipient's email and name

		];
		
		// Prepare the email parameters
		const emailParams = new EmailParams()
			.setFrom(sentFrom)
			.setTo(recipients)
			.setReplyTo(sentFrom)  // Optional: specify reply-to address
			.setSubject("Email Verification Code")
			.setHtml(`<p>Your verification code is: <strong>${code}</strong></p>`)
			.setText(`Your verification code is: ${code}`);
		// Send the email
		const response = await mailerSend.email.send(emailParams);
	} catch (error) {
	}
}

// Call the sendEmail function
export default sendEmail;