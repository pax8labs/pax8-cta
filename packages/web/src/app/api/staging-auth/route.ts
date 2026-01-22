import { NextRequest, NextResponse } from 'next/server';

const STAGING_PASSWORD = process.env.STAGING_PASSWORD;
const COOKIE_NAME = 'staging-auth';
// Cookie expires in 7 days
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export async function POST(request: NextRequest) {
  // If no staging password is configured, allow access
  if (!STAGING_PASSWORD) {
    return NextResponse.json({ error: 'Staging password not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const password = body?.password;

    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    if (password === STAGING_PASSWORD) {
      // Create a simple token to verify the cookie later
      const token = Buffer.from(`${STAGING_PASSWORD}-${Date.now()}`).toString('base64');

      const response = NextResponse.json({ success: true });

      // Set the auth cookie
      // Note: secure=false for HTTP staging environments
      response.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
      });

      return response;
    }

    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  } catch (err) {
    console.error('Staging auth error:', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
