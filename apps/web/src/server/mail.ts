import { createTransport, type Transporter } from "nodemailer";

let transport: Transporter | undefined;

/**
 * Sends an e-mail through SMTP_URL. Without SMTP the message is printed in the
 * server log, which is enough for a single-person install or development.
 */
export async function sendMail(to: string, subject: string, text: string) {
  const url = process.env.SMTP_URL;
  if (!url) {
    console.info(`[mail] SMTP_URL not set, e-mail not sent.\n  To: ${to}\n  Subject: ${subject}\n${text.replace(/^/gm, "  ")}`);
    return { sent: false };
  }
  transport ??= createTransport(url);
  await transport.sendMail({ from: process.env.MAIL_FROM ?? "PcyBox GoLive <no-reply@localhost>", to, subject, text });
  return { sent: true };
}

export const mailConfigured = () => !!process.env.SMTP_URL;
