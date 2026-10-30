/* ===================== Email templates =====================
 * Every email Youtask sends, in the app's light "Blue" look (same palette as
 * the login card): light blue canvas, white card, navy button, blue logo.
 *
 * Email HTML rules followed here: table layout + inline styles only (Outlook
 * ignores flex/most CSS), no web fonts, a bulletproof button, and a plain-text
 * part for every email. The logo is attached inline (cid:logo) by sendEmail so
 * it shows even when the app URL isn't public (local dev). */

export const LOGO_CID = 'logo';

const C = {
  canvas: '#eef3f9',
  card: '#ffffff',
  border: '#e3e9f1',
  navy: '#18315c',
  text: '#1a2b48',
  body: '#4b5b74',
  muted: '#8693a7',
  soft: '#f4f7fb',
  danger: '#be123c',
};

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Values come from users (names, emails) — never inject them raw into HTML. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtUtc(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date) + ' UTC';
}

/* ───────────────────────── Building blocks ───────────────────────── */

function heading(text: string): string {
  return `<h1 style="margin:0 0 12px;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:${C.text};">${text}</h1>`;
}

function paragraph(html: string, extra = ''): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:${C.body};${extra}">${html}</p>`;
}

function button(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
      <tr>
        <td align="center" bgcolor="${C.navy}" style="border-radius:10px;">
          <a href="${esc(href)}" target="_blank"
            style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:10px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>`;
}

/** The raw link under a button, for clients that block buttons. */
function fallbackLink(href: string): string {
  return paragraph(
    `If the button doesn't work, copy and paste this link into your browser:<br>
     <a href="${esc(href)}" style="color:${C.navy};word-break:break-all;">${esc(href)}</a>`,
    `font-size:13px;line-height:20px;color:${C.muted};`,
  );
}

/** Light info box (details rows, security notes). */
function infoBox(html: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:14px 16px;background:${C.soft};border:1px solid ${C.border};border-radius:12px;font-family:${FONT};font-size:13px;line-height:21px;color:${C.body};">
          ${html}
        </td>
      </tr>
    </table>`;
}

function divider(): string {
  return `<div style="height:1px;line-height:1px;font-size:1px;background:${C.border};margin:8px 0 20px;">&nbsp;</div>`;
}

/** Shared shell: preheader, logo, white card, footer. */
function layout({ preheader, body, footerNote }: { preheader: string; body: string; footerNote: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Youtask</title>
</head>
<body style="margin:0;padding:0;background:${C.canvas};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.canvas}" style="background:${C.canvas};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <img src="cid:${LOGO_CID}" width="147" height="36" alt="Youtask"
                style="display:block;border:0;outline:none;width:147px;height:36px;">
            </td>
          </tr>
          <tr>
            <td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.border};border-radius:18px;padding:36px 36px 20px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 12px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${C.muted};">
              ${footerNote}<br>
              Youtask by Tekorder
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ───────────────────────── Templates ───────────────────────── */

export function testEmail(): RenderedEmail {
  return {
    subject: 'Youtask email test',
    html: layout({
      preheader: 'Your email setup is working.',
      body: heading('Email is working') + paragraph('If you are reading this, Youtask can send emails through Twilio.'),
      footerNote: 'This is a test message.',
    }),
    text: 'Email is working.\n\nIf you are reading this, Youtask can send emails through Twilio.',
  };
}

export function welcomeEmail({ name, appUrl }: { name?: string; appUrl: string }): RenderedEmail {
  const loginUrl = `${appUrl}/login`;
  const hello = name ? `Welcome, ${esc(name)}` : 'Welcome to Youtask';
  const features: [string, string][] = [
    ['Capture everything', 'Tasks, reminders and checklists in one place.'],
    ['Focus on what matters', 'Prioritize with flags, lists and due dates.'],
    ['See your progress', 'Your profile dashboard tracks what you finish.'],
  ];

  const featureRows = features
    .map(([title, desc]) => `
      <tr>
        <td valign="top" width="28" style="padding:0 0 14px;">
          <div style="width:20px;height:20px;border-radius:6px;background:${C.navy};color:#ffffff;font-family:${FONT};font-size:12px;line-height:20px;text-align:center;">&#10003;</div>
        </td>
        <td valign="top" style="padding:0 0 14px;font-family:${FONT};font-size:14px;line-height:20px;color:${C.body};">
          <strong style="color:${C.text};">${title}</strong><br>${desc}
        </td>
      </tr>`)
    .join('');

  return {
    subject: 'Welcome to Youtask',
    html: layout({
      preheader: 'Your account is ready. Here is how to get started.',
      body:
        heading(hello) +
        paragraph('Your account has been created. You are one step away from organizing your day, your ideas and your goals.') +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 12px;">${featureRows}</table>` +
        button(loginUrl, 'Open Youtask'),
      footerNote: 'If you did not create this account, you can ignore this email.',
    }),
    text:
      `${name ? `Welcome, ${name}` : 'Welcome to Youtask'}\n\n` +
      'Your account has been created. You are one step away from organizing your day, your ideas and your goals.\n\n' +
      features.map(([t, d]) => `- ${t}: ${d}`).join('\n') +
      `\n\nOpen Youtask: ${loginUrl}\n\nIf you did not create this account, you can ignore this email.`,
  };
}

export function twoFactorEmail({ code, expiresMinutes, ip, device }: {
  code: string;
  expiresMinutes: number;
  ip?: string;
  device?: string;
}): RenderedEmail {
  const details = [
    `Time: <strong style="color:${C.text};">${esc(fmtUtc(new Date()))}</strong>`,
    ip ? `IP: <strong style="color:${C.text};">${esc(ip)}</strong>` : '',
    device ? `Device: <strong style="color:${C.text};">${esc(device)}</strong>` : '',
  ].filter(Boolean).join('<br>');

  return {
    subject: `Your Youtask security code: ${code}`,
    html: layout({
      preheader: `Your code is ${code}. It expires in ${expiresMinutes} minutes.`,
      body:
        heading('Your security code') +
        paragraph(`Enter this code to finish signing in. It expires in <strong style="color:${C.text};">${expiresMinutes} minutes</strong>.`) +
        `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;">
          <tr>
            <td align="center" style="padding:18px 12px;background:${C.soft};border:1px solid ${C.border};border-radius:12px;font-family:'SF Mono', Menlo, Consolas, monospace;font-size:32px;line-height:40px;font-weight:700;letter-spacing:10px;color:${C.text};">
              ${esc(code)}
            </td>
          </tr>
        </table>` +
        infoBox(`<strong style="color:${C.text};">Sign-in attempt</strong><br>${details}`) +
        paragraph("If this wasn't you, ignore this email and consider changing your password.", `font-size:13px;line-height:20px;color:${C.muted};`),
      footerNote: 'Youtask will never ask you to share this code.',
    }),
    text:
      `Your Youtask security code: ${code}\n\n` +
      `It expires in ${expiresMinutes} minutes.\n\n` +
      `Time: ${fmtUtc(new Date())}${ip ? `\nIP: ${ip}` : ''}${device ? `\nDevice: ${device}` : ''}\n\n` +
      "If this wasn't you, ignore this email and consider changing your password.",
  };
}

export function passwordResetEmail({ email, resetUrl }: { email: string; resetUrl: string }): RenderedEmail {
  return {
    subject: 'Reset your Youtask password',
    html: layout({
      preheader: 'Use this link to choose a new password. It expires in 1 hour.',
      body:
        heading('Reset your password') +
        paragraph(`We received a request to reset the password for <strong style="color:${C.text};">${esc(email)}</strong>. Click the button below to choose a new one.`) +
        button(resetUrl, 'Choose a new password') +
        paragraph('This link expires in 1 hour and can only be used once.', `font-size:13px;line-height:20px;color:${C.muted};`) +
        divider() +
        fallbackLink(resetUrl),
      footerNote: "If you didn't ask to reset your password, you can ignore this email. Your password won't change.",
    }),
    text:
      `Reset your Youtask password\n\n` +
      `We received a request to reset the password for ${email}.\n\n` +
      `Choose a new password: ${resetUrl}\n\n` +
      'This link expires in 1 hour and can only be used once.\n\n' +
      "If you didn't ask to reset your password, you can ignore this email.",
  };
}

export function passwordChangedEmail({ email, appUrl }: { email: string; appUrl: string }): RenderedEmail {
  const when = fmtUtc(new Date());
  const loginUrl = `${appUrl}/login`;
  return {
    subject: 'Your Youtask password was changed',
    html: layout({
      preheader: 'Your password was just changed.',
      body:
        heading('Your password was changed') +
        paragraph(`The password for <strong style="color:${C.text};">${esc(email)}</strong> was changed on ${esc(when)}.`) +
        paragraph('If this was you, there is nothing else to do. You can sign in with your new password.') +
        infoBox(`<strong style="color:${C.danger};">Wasn't you?</strong><br>Reset your password right away from the sign-in page ("Forgot password?") and review your account.`) +
        button(loginUrl, 'Go to sign in'),
      footerNote: 'You are receiving this because the password on your account changed.',
    }),
    text:
      `Your Youtask password was changed\n\n` +
      `The password for ${email} was changed on ${when}.\n\n` +
      'If this was you, there is nothing else to do.\n' +
      `If it wasn't you, reset your password right away: ${loginUrl}`,
  };
}
