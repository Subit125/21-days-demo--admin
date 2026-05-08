import { NextResponse } from 'next/server';

// Step 1: Redirect user to Google OAuth
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin;
  const redirectUri = `${appUrl}/api/auth/callback/google`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    hd: 'hbplus.fit', // Hint Google to only show hbplus.fit accounts
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.redirect(googleAuthUrl);
}
