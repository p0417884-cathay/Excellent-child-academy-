const nodemailer = require("nodemailer");

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_FROM);
}
async function sendOtp(email, code) {
  if (!smtpConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email delivery is not configured. Contact the school administrator.");
    }
    console.log(`[DEVELOPMENT ONLY] Login code for ${email}: ${code}`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Your Excellent Child Academy sign-in code",
    text: `Your sign-in code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px"><h2 style="color:#153e35">Excellent Child Academy</h2><p>Your secure sign-in code is:</p><div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px;background:#f0f7f4;border-radius:10px">${code}</div><p>This code expires in 10 minutes and can only be used once.</p><p>If you did not request it, ignore this email.</p></div>`
  });
}
module.exports = { sendOtp };
