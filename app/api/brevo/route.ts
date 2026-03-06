import { NextResponse } from "next/server";
import { sendEmailBrevo } from "@/lib/sendEmailBrevo";

type TemplateKey = "test" | "welcome" | "twofa";

export async function POST(req: Request) {
  try {
    // ============================
    // Parse body
    // ============================
    const body = await req.json().catch(() => ({} as any));

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
        const data = (body?.data ?? {}) as Record<string, any>;

        // opcionales para welcome
        const displayName = String(body?.displayName || "").trim();
        const username = String(body?.username || "").trim();

        console.log("BREVO SEND ->", { email, template, data });

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

        // Payload final hacia Brevo (se adapta por template)
        const payload: Record<string, any> = {
          ...data,
          ...(displayName ? { displayName } : {}),
          ...(username ? { username } : {}),
        };

        // Llamada real
        await sendEmailBrevo(email, template, payload);

        return NextResponse.json({ ok: true });
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
  } catch (err: any) {
    console.error("BREVO API ERROR FULL:", err);

    return NextResponse.json(
      {
        ok: false,
        message: "Error interno",
        error: err?.message || String(err),
        stack: err?.stack || null,
      },
      { status: 500 }
    );
  }
}
