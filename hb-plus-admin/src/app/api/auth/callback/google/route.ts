import { NextResponse } from 'next/server';

// Step 2: Google redirects back here with a 'code'
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const appUrl = origin;

  if (!code) {
    return NextResponse.redirect(`${appUrl}?error=no_code`);
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${origin}/api/auth/callback/google`,
        grant_type: 'authorization_code',
        code,
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokens);
      return NextResponse.redirect(`${appUrl}?error=token_exchange_failed`);
    }

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const userInfo = await userInfoResponse.json();
    const email: string = userInfo.email || '';
    const allowedDomain = process.env.ALLOWED_DOMAIN || 'hbplus.fit';

    // Enforce domain restriction
    if (!email.endsWith(`@${allowedDomain}`)) {
      return NextResponse.redirect(`${appUrl}?error=unauthorized_domain&email=${encodeURIComponent(email)}`);
    }

    // Create a lightweight session payload
    const session = {
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };

    const sessionStr = Buffer.from(JSON.stringify(session)).toString('base64');

    // Set secure session cookie and redirect to dashboard
    const response = NextResponse.redirect(appUrl);
    response.cookies.set('hb_admin_session', sessionStr, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Auth callback error:', error);
    return NextResponse.redirect(`${appUrl}?error=auth_failed`);
  }
}
