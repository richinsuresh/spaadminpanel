import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Define a secure cookie name
const COOKIE_NAME = 'superuser-auth';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    // --- SECURITY WARNING ---
    // You MUST set this password in your environment variables
    // (e.g., in a .env.local file or your deployment settings)
    const superUserPassword = process.env.SUPERUSER_PASSWORD;

    if (!superUserPassword) {
      console.error('SUPERUSER_PASSWORD is not set in environment variables.');
      return NextResponse.json(
        { message: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (password === superUserPassword) {
      // Passwords match. Set a secure, httpOnly cookie.
      const cookieStore = cookies();
      cookieStore.set(COOKIE_NAME, 'true', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 8, // 8 hours
      });

      return NextResponse.json({ message: 'Login successful' }, { status: 200 });
    } else {
      // Passwords do not match
      return NextResponse.json(
        { message: 'Invalid password' },
        { status: 401 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { message: 'An unknown error occurred' },
      { status: 500 }
    );
  }
}