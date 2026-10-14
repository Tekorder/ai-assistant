import { brevoTx } from "./brevo";

export type BrevoTemplate = "test" | "welcome" | "twofa";

interface BrevoData {
  // Welcome
  displayName?: string;
  username?: string;

  // 2FA
  code?: string;            // "123456"
  expiresMinutes?: number;  // 5
  ip?: string;
  device?: string;
}

export async function sendEmailBrevo(
  email: string,
  template: BrevoTemplate,
  data: BrevoData = {}
) {
  if (!process.env.BREVO_SENDER_EMAIL) {
    throw new Error("BREVO_SENDER_EMAIL is not defined");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  let subject = "";
  let htmlContent = "";

  switch (template) {
    // ---------------------------
    // TEST
    // ---------------------------
    case "test":
      subject = "🧪 Brevo Test OK";
      htmlContent = `
        <div style="font-family:Arial; padding:40px; background:#0f172a; color:#fff;">
          <h2>Brevo funcionando ✅</h2>
          <p>Si estás leyendo esto, el sistema de correos está listo.</p>
        </div>`;
      break;

    // ---------------------------
    // WELCOME
    // ---------------------------
    case "welcome": {
      subject = "💚 Welcome to Yout Task";

      const capitalizeName = (str: string = ""): string =>
        str
          .toLowerCase()
          .split(" ")
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

      const displayNameFormatted = capitalizeName(String(data?.displayName || ""));
      const username = String(data?.username || "");

      const greetingName =
        displayNameFormatted && username
          ? `${displayNameFormatted} | ${username}`
          : displayNameFormatted || username || "";

      htmlContent = `
        <div style="background:#0b1220; padding:40px 10px;">
          <div style="
            max-width:520px;
            margin:auto;
            background:#0f172a;
            border-radius:16px;
            padding:40px;
            box-shadow:0 0 40px rgba(34,197,94,0.25);
            color:#ffffff;
            font-family:Arial, sans-serif;
          ">

            <h1 style="
              margin:0;
              text-align:center;
              font-size:32px;
              background:linear-gradient(90deg,#22c55e,#38bdf8);
              -webkit-background-clip:text;
              -webkit-text-fill-color:transparent;
            ">
              Youtask
            </h1>

            <p style="text-align:center; color:#94a3b8; margin-top:6px;">
              Organize - Execute - Move forward.
            </p>

            <hr style="border:none;height:1px;background:#1e293b;margin:30px 0"/>

            <h2 style="color:#22c55e;">
              Hello ${greetingName} 👋
            </h2>

            <p style="font-size:16px;color:#e2e8f0;">
              Your account has been successfully created.
              You’re one step away from organizing your day, your ideas, and your goals.
            </p>

            <p style="font-size:16px;color:#e2e8f0;">
              With Youtask you can:
            </p>

            <ul style="color:#cbd5f5; padding-left:20px;">
              <li>✅ Create and prioritize tasks</li>
              <li>⚡ Focus on what matters</li>
              <li>📈 Track your progress</li>
            </ul>

            <div style="text-align:center;margin-top:35px;">
              <a href="${appUrl}/login"
                style="
                  background:linear-gradient(90deg,#22c55e,#38bdf8);
                  color:#0f172a;
                  padding:14px 34px;
                  border-radius:12px;
                  text-decoration:none;
                  font-weight:bold;
                  font-size:16px;
                  display:inline-block;
                ">
                Log in
              </a>
            </div>

            <p style="
              margin-top:40px;
              font-size:13px;
              color:#64748b;
              text-align:center;
            ">
              If you did not create this account, you can safely ignore this message.
            </p>

          </div>
        </div>
      `;
      break;
    }

    // ---------------------------
    // TWO-FACTOR AUTH (2FA)
    // ---------------------------
    case "twofa": {
      const code = String(data?.code || "").trim();
      if (!/^\d{6}$/.test(code)) {
        throw new Error("twofa requiere data.code (6 dígitos)");
      }

      const expiresMinutes = Number.isFinite(data?.expiresMinutes)
        ? Math.max(1, Math.min(30, Number(data.expiresMinutes)))
        : 5;

      const ip = String(data?.ip || "").trim();
      const device = String(data?.device || "").trim();

      subject = `🔐 Your Youtask security code: ${code}`;

      const codeBoxes = code
        .split("")
        .map(
          (d) => `
          <span style="
            display:inline-block;
            width:46px;
            height:56px;
            line-height:56px;
            text-align:center;
            border-radius:12px;
            background:#0b1220;
            border:1px solid #1f2a44;
            font-size:22px;
            font-weight:800;
            letter-spacing:1px;
            color:#ffffff;
            margin:0 4px;
          ">${d}</span>
        `
        )
        .join("");

      htmlContent = `
        <div style="background:#0b1220; padding:40px 10px;">
          <div style="
            max-width:560px;
            margin:auto;
            background:#0f172a;
            border-radius:18px;
            padding:38px 34px;
            box-shadow:0 0 55px rgba(56,189,248,0.18);
            color:#ffffff;
            font-family:Arial, sans-serif;
            border:1px solid rgba(255,255,255,0.06);
          ">

            <div style="text-align:center;">
              <div style="
                width:62px;height:62px;
                border-radius:18px;
                margin:0 auto 14px auto;
                background:linear-gradient(135deg,rgba(34,197,94,0.25),rgba(56,189,248,0.22));
                border:1px solid rgba(255,255,255,0.08);
                display:flex;
                align-items:center;
                justify-content:center;
                font-size:26px;
              ">🔐</div>

              <h1 style="
                margin:0;
                font-size:30px;
                background:linear-gradient(90deg,#22c55e,#38bdf8);
                -webkit-background-clip:text;
                -webkit-text-fill-color:transparent;
              ">
                Youtask Security Code
              </h1>

              <p style="margin:10px 0 0 0; color:#94a3b8; font-size:14px;">
                Use this code to complete your login. It expires in ${expiresMinutes} minutes.
              </p>
            </div>

            <hr style="border:none;height:1px;background:#1e293b;margin:28px 0"/>

            <div style="text-align:center;">
              <p style="margin:0 0 14px 0; color:#e2e8f0; font-size:16px;">
                Your verification code is:
              </p>

              <div style="white-space:nowrap;">
                ${codeBoxes}
              </div>

              <div style="
                margin-top:18px;
                font-size:13px;
                color:#94a3b8;
              ">
                Or copy/paste: <span style="color:#ffffff;font-weight:700;letter-spacing:2px;">${code}</span>
              </div>
            </div>

            <div style="
              margin-top:28px;
              padding:16px 16px;
              border-radius:14px;
              background:#0b1220;
              border:1px solid #1f2a44;
              color:#cbd5f5;
              font-size:13px;
            ">
              <div style="margin-bottom:6px;">
                <strong style="color:#ffffff;">Login attempt details</strong>
              </div>
              <div>Time: <strong style="color:#ffffff;">${new Date().toLocaleString()}</strong></div>
              ${
                ip
                  ? `<div>IP: <strong style="color:#ffffff;">${ip}</strong></div>`
                  : ""
              }
              ${
                device
                  ? `<div>Device: <strong style="color:#ffffff;">${device}</strong></div>`
                  : ""
              }
              <div style="margin-top:10px; color:#94a3b8;">
                If this wasn't you, ignore this email and consider changing your password.
              </div>
            </div>

            <div style="text-align:center; margin-top:26px;">
              <a href="${appUrl}/login"
                style="
                  display:inline-block;
                  background:linear-gradient(90deg,#22c55e,#38bdf8);
                  color:#0f172a;
                  padding:12px 26px;
                  border-radius:12px;
                  text-decoration:none;
                  font-weight:bold;
                  font-size:14px;
                ">
                Back to Login
              </a>
            </div>

            <p style="
              margin-top:28px;
              font-size:12px;
              color:#64748b;
              text-align:center;
              line-height:1.5;
            ">
              This code is for your eyes only. Youtask will never ask you to share it with anyone.
            </p>

          </div>
        </div>
      `;
      break;
    }

    default:
      throw new Error(`Template inválido: ${template}`);
  }

  return brevoTx().sendTransacEmail({
    sender: {
      email: process.env.BREVO_SENDER_EMAIL,
      name: process.env.BREVO_SENDER_NAME || "Youtask",
    },
    to: [{ email }],
    subject,
    htmlContent,
  });
}
