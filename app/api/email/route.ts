import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";
import {
  ResetError,
  confirmPasswordReset,
  requestPasswordReset,
  verifyResetCode,
} from "@/lib/passwordReset";

// Templates the client may request directly. password_reset / password_changed
// carry links or security notices, so only the server sends them (actions below).
type TemplateKey = "test" | "welcome" | "twofa";

const resetFailed = (err: unknown) => {
  if (err instanceof ResetError) {
    return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
  }
  console.error("PASSWORD RESET ERROR:", err);
  return NextResponse.json(
    { ok: false, message: "Something went wrong. Please try again." },
    { status: 500 }
  );
};

export async function POST(req: Request) {
  try {
    // ============================
    // Parse body
    // ============================
    const body = await req.json().catch(() => ({} as unknown));

    const action = String(body?.action || "").trim();
    if (!action) {
      return NextResponse.json(
        { ok: false, message: "action requerido" },
        { status: 400 }
      );
    }

    // ============================
    // Router by action
    // ============================
    switch (action) {
      // --------------------------------
      // SEND EMAIL
      // --------------------------------
      case "send_email": {
        const email = String(body?.email || "").trim();
        const template = String(body?.template || "").trim() as TemplateKey;

        // data puede traer code, expiresMinutes, etc.
        const data = (body?.data ?? {}) as Record<string, unknown>;

        // opcionales para welcome
        const displayName = String(body?.displayName || "").trim();
        const username = String(body?.username || "").trim();

        console.log("EMAIL SEND ->", { email, template, data });

        if (!email) {
          return NextResponse.json(
            { ok: false, message: "email requerido" },
            { status: 400 }
          );
        }

        if (!template) {
          return NextResponse.json(
            { ok: false, message: "template requerido" },
            { status: 400 }
          );
        }

        const allowed: TemplateKey[] = ["test", "welcome", "twofa"];
        if (!allowed.includes(template)) {
          return NextResponse.json(
            { ok: false, message: "template inválido" },
            { status: 400 }
          );
        }

        // Validación extra para 2FA
        if (template === "twofa") {
          const code = String(data?.code || "").trim();
          if (!/^\d{6}$/.test(code)) {
            return NextResponse.json(
              { ok: false, message: "data.code requerido (6 dígitos) para twofa" },
              { status: 400 }
            );
          }
        }

        // Payload final hacia el email (se adapta por template)
        const payload: Record<string, unknown> = {
          ...data,
          ...(displayName ? { displayName } : {}),
          ...(username ? { username } : {}),
        };

        // Llamada real
        await sendEmail(email, template, payload);

        return NextResponse.json({ ok: true });
      }

      // --------------------------------
      // PASSWORD RESET: request the email
      // Always ok for unknown emails (no account enumeration)
      // --------------------------------
      case "password_reset": {
        try {
          await requestPasswordReset(String(body?.email || ""));
          return NextResponse.json({ ok: true });
        } catch (err) {
          return resetFailed(err);
        }
      }

      // --------------------------------
      // PASSWORD RESET: check the link's code, return its email
      // --------------------------------
      case "verify_reset_code": {
        try {
          const email = await verifyResetCode(String(body?.oobCode || ""));
          return NextResponse.json({ ok: true, email });
        } catch (err) {
          return resetFailed(err);
        }
      }

      // --------------------------------
      // PASSWORD RESET: set the new password
      // --------------------------------
      case "confirm_password_reset": {
        try {
          await confirmPasswordReset(String(body?.oobCode || ""), String(body?.newPassword || ""));
          return NextResponse.json({ ok: true });
        } catch (err) {
          return resetFailed(err);
        }
      }

      // --------------------------------
      // DEFAULT
      // --------------------------------
      default:
        return NextResponse.json(
          { ok: false, message: "Acción inválida" },
          { status: 400 }
        );
    }
  }  catch (err) {
  console.error("EMAIL API ERROR FULL:", err);
  const e = err instanceof Error ? err : new Error(String(err));
  return NextResponse.json(
    {
      ok: false,
      message: "Error interno",
      error: e.message,
      stack: e.stack || null,
    },
    { status: 500 }
  );
}
}
