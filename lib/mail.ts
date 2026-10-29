import "server-only";
import nodemailer from "nodemailer";

type Mail = { to: string; subject: string; html: string; text: string };

/** True when mail is only printed to the server log (dev), i.e. not really delivered. */
export function mailIsConsole(): boolean {
  return (process.env.MAIL_TRANSPORT ?? "console") !== "smtp";
}

/**
 * Sends an email. Two transports:
 *  - console (dev default): prints the message (and any link) to the server log.
 *  - smtp: real delivery via the SMTP_* env vars.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const transport = process.env.MAIL_TRANSPORT ?? "console";

  if (transport === "smtp") {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.MAIL_FROM ?? "no-reply@learning.local",
      ...mail,
    });
    return;
  }

  // console transport
  console.log(
    [
      "",
      "┌─────────────────────────────────────────────────────────────",
      `│ 📧  EMAIL → ${mail.to}`,
      `│ ${mail.subject}`,
      "├─────────────────────────────────────────────────────────────",
      ...mail.text.split("\n").map((l) => `│ ${l}`),
      "└─────────────────────────────────────────────────────────────",
      "",
    ].join("\n"),
  );
}

export function inviteEmail(name: string, link: string): Omit<Mail, "to"> {
  const text = [
    `Здравствуйте, ${name}!`,
    "",
    "Вас пригласили в AI Portal. Перейдите по ссылке, чтобы задать пароль и активировать аккаунт:",
    "",
    link,
    "",
    "Ссылка действует 72 часа.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#15172b;max-width:480px">
      <p>Здравствуйте, ${escapeHtml(name)}!</p>
      <p>Вас пригласили в <b>AI Portal</b>. Нажмите кнопку, чтобы задать пароль и активировать аккаунт:</p>
      <p><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:600">Задать пароль</a></p>
      <p style="color:#6b7085;font-size:13px">Или скопируйте ссылку: <br>${link}</p>
      <p style="color:#6b7085;font-size:13px">Ссылка действует 72 часа.</p>
    </div>`;

  return { subject: "Приглашение в AI Portal", text, html };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
