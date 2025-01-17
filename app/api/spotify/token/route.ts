import { NextRequest, NextResponse } from 'next/server';

interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

export async function GET(request: NextRequest) {
  try {
    // Get existing tokens
    const accessToken = request.cookies.get('spotify_access_token')?.value;
    const refreshToken = request.cookies.get('spotify_refresh_token')?.value;
    const tokenExpiry = request.cookies.get('spotify_token_expiry')?.value;

    // If we have a valid access token, return it
    if (accessToken && tokenExpiry && parseInt(tokenExpiry) > Date.now()) {
      return NextResponse.json({ access_token: accessToken });
    }

    // If no refresh token, user needs to authorize
    if (!refreshToken) {
      return NextResponse.json(
        { error: 'No refresh token found' },
        { status: 401 }
      );
    }

    // Get new access token using refresh token
    const clientId = process.env.SPOTIFY_CLIENT_ID!;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      // If refresh fails, user needs to reauthorize
      return NextResponse.json(
        { error: 'Failed to refresh token' },
        { status: 401 }
      );
    }

    const tokenData: TokenResponse = await response.json();

    // Create response
    const apiResponse = NextResponse.json({ 
      access_token: tokenData.access_token 
    });

    // Update cookies
    apiResponse.cookies.set('spotify_access_token', tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokenData.expires_in
    });

    apiResponse.cookies.set('spotify_token_expiry', 
      (Date.now() + tokenData.expires_in * 1000).toString(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokenData.expires_in
    });

    // Update refresh token if a new one was provided
    if (tokenData.refresh_token) {
      apiResponse.cookies.set('spotify_refresh_token', tokenData.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 365 * 24 * 60 * 60 // 1 year
      });
    }

    return apiResponse;

  } catch (error) {
    console.error('Token error:', error);
    return NextResponse.json(
      { error: 'Failed to process token request' },
      { status: 500 }
    );
  }
}