// Envío de correos con Twilio Email API (Comms)
import {
  LOGO_CID,
  passwordChangedEmail,
  passwordResetEmail,
  testEmail,
  twoFactorEmail,
  welcomeEmail,
  type RenderedEmail,
} from "./emailTemplates";
import { EMAIL_LOGO_PNG_BASE64 } from "./emailLogo";

const TWILIO_EMAIL_URL = "https://comms.twilio.com/v1/Emails";

export type EmailTemplate =
  | "test"
  | "welcome"
  | "twofa"
  | "password_reset"
  | "password_changed";

interface EmailData {
  // Welcome
  displayName?: string;
  username?: string;

  // 2FA
  code?: string;            // "123456"
  expiresMinutes?: number;  // 5
  ip?: string;
  device?: string;

  // Password reset (built server-side only, never from the client)
  resetUrl?: string;
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function render(email: string, template: EmailTemplate, data: EmailData): RenderedEmail {
  switch (template) {
    case "test":
      return testEmail();

    case "welcome": {
      const capitalize = (str: string) =>
        str
          .toLowerCase()
          .split(" ")
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
      const name = capitalize(String(data.displayName || "")) || String(data.username || "");
      return welcomeEmail({ name, appUrl: appUrl() });
    }

    case "twofa": {
      const code = String(data.code || "").trim();
      if (!/^\d{6}$/.test(code)) {
        throw new Error("twofa requiere data.code (6 dígitos)");
      }
      const expiresMinutes = Number.isFinite(data.expiresMinutes)
        ? Math.max(1, Math.min(30, Number(data.expiresMinutes)))
        : 5;
      return twoFactorEmail({
        code,
        expiresMinutes,
        ip: String(data.ip || "").trim(),
        device: String(data.device || "").trim(),
      });
    }

    case "password_reset": {
      if (!data.resetUrl) throw new Error("password_reset requiere data.resetUrl");
      return passwordResetEmail({ email, resetUrl: data.resetUrl });
    }

    case "password_changed":
      return passwordChangedEmail({ email, appUrl: appUrl() });

    default:
      throw new Error(`Template inválido: ${template}`);
  }
}

export async function sendEmail(
  email: string,
  template: EmailTemplate,
  data: EmailData = {}
) {
  if (!process.env.TWILIO_SID || !process.env.TWILIO_CLIENT_SECRET) {
    throw new Error("TWILIO_SID / TWILIO_CLIENT_SECRET are not defined");
  }
  if (!process.env.EMAIL_FROM_ADDRESS) {
    throw new Error("EMAIL_FROM_ADDRESS is not defined");
  }

  const { subject, html, text } = render(email, template, data);

  const credentials = Buffer.from(
    `${process.env.TWILIO_SID}:${process.env.TWILIO_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(TWILIO_EMAIL_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: {
        address: process.env.EMAIL_FROM_ADDRESS,
        name: process.env.EMAIL_FROM_NAME || "Youtask",
      },
      to: [{ address: email }],
      content: {
        subject,
        html,
        text,
        // Logo shown inline via <img src="cid:logo">
        attachments: [
          {
            filename: "youtask-logo.png",
            contentType: "image/png",
            content: EMAIL_LOGO_PNG_BASE64,
            cid: LOGO_CID,
          },
        ],
      },
    }),
  });

  // Twilio responde 202 (asíncrono) con un operationId
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Twilio Email error ${res.status}: ${detail}`);
  }

  return res.json().catch(() => ({}));
}
