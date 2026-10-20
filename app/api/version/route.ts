import { NextResponse } from 'next/server';

// Always answered by the live deployment, never from a cache
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? '' },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
