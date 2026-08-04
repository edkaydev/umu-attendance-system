import nodemailer from 'nodemailer'

export const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST!,
  port: Number(process.env.SMTP_PORT!) || 587,
  secure: false, // TLS
  auth: {
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  },
})

/**
 * Send an email. Throws on failure.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string | string[]
  subject: string
  html: string
}): Promise<void> {
  await mailer.sendMail({
    from: `"${process.env.ALERT_FROM_NAME}" <${process.env.ALERT_FROM_EMAIL}>`,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
  })
}
