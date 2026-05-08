import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// GET /api/auth/session — returns current session
export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('hb_admin_session');

  if (!sessionCookie) {
    return NextResponse.json({ authenticated: false });
  }

  try {
    const session = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString());

    // Check expiry
    if (session.exp < Date.now()) {
      return NextResponse.json({ authenticated: false, reason: 'expired' });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        email: session.email,
        name: session.name,
        picture: session.picture,
      },
    });
  } catch {
    return NextResponse.json({ authenticated: false, reason: 'invalid_session' });
  }
}

// POST /api/auth/session — logout: clears session cookie
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('hb_admin_session', '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
  });
  return response;
}
