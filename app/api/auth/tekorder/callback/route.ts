import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

type Body = {
  user_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
};

export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: true, user: null });

  try {
    const body = (await req.json()) as Body;
    const email = body.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { ok: false, message: 'Email is required.' },
        { status: 400 }
      );
    }

    const name =
      body.display_name?.trim() ||
      [body.first_name, body.last_name].filter(Boolean).join(' ').trim() ||
      null;
    const tekOrderUid = body.user_id ? `tekorder:${body.user_id}` : null;

    // Email is the key: an existing user is authenticated as-is, never
    // duplicated. Only a brand-new email creates a new user.
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          firebaseUid: tekOrderUid,
          timezone: 'America/Tegucigalpa',
        },
      });
    } else if (!user.firebaseUid && tekOrderUid) {
      // Backfill so this account resolves via the existing X-Firebase-UID
      // session convention — never overwrite a real Firebase/Google uid.
      user = await prisma.user.update({
        where: { id: user.id },
        data: { firebaseUid: tekOrderUid },
      });
    }

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error('tekorder callback error:', error);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { ok: false, message: 'Sign-in conflicted with another request. Please try again.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { ok: false, message: 'Server error during TekOrder sign-in.' },
      { status: 500 }
    );
  }
}
