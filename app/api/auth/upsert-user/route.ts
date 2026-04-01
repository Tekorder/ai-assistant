import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

type Body = {
  email?: string;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  firebaseUid?: string | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim() || null;
    const username = body.username?.trim().toLowerCase() || null;
    const avatarUrl = body.avatarUrl?.trim() || null;
    const firebaseUid = body.firebaseUid?.trim() || null;

    if (!email) {
      return NextResponse.json(
        { ok: false, message: 'Email is required.' },
        { status: 400 }
      );
    }

    let user = null;

    if (firebaseUid) {
      user = await prisma.user.findUnique({
        where: { firebaseUid },
      });
    }

    if (!user) {
      user = await prisma.user.findUnique({
        where: { email },
      });
    }

    if (username) {
      const usernameOwner = await prisma.user.findUnique({
        where: { username },
      });

      if (usernameOwner && (!user || usernameOwner.id !== user.id)) {
        return NextResponse.json(
          { ok: false, message: 'That username is already taken.' },
          { status: 409 }
        );
      }
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          username,
          avatarUrl,
          firebaseUid,
          timezone: 'America/Tegucigalpa',
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          email,
          name,
          avatarUrl,
          ...(username ? { username } : {}),
          ...(firebaseUid ? { firebaseUid } : {}),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      user,
    });
  } catch (error) {
    console.error('upsert-user error:', error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = Array.isArray(error.meta?.target)
        ? error.meta?.target.join(', ')
        : String(error.meta?.target || '');

      if (target.includes('username')) {
        return NextResponse.json(
          { ok: false, message: 'That username is already taken.' },
          { status: 409 }
        );
      }

      if (target.includes('email')) {
        return NextResponse.json(
          { ok: false, message: 'That email is already registered.' },
          { status: 409 }
        );
      }

      if (target.includes('firebaseUid')) {
        return NextResponse.json(
          { ok: false, message: 'That Firebase account is already linked.' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { ok: false, message: 'A unique field is already in use.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { ok: false, message: 'Server error while syncing user.' },
      { status: 500 }
    );
  }
}