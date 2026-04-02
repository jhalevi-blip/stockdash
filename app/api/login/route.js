import { NextResponse } from 'next/server';

export async function POST(request) {
  const { password } = await request.json();
  const correct = process.env.SITE_PASSWORD;

  if (!correct) {
    return NextResponse.json({ error: 'No password set' }, { status: 500 });
  }

  if (password !== correct) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('auth', 'authenticated', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
}