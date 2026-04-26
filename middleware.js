import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// In-memory rate limit store: ip -> { count, windowStart }
// Note: on Vercel's serverless/edge network, this is per-instance, not globally shared.
// For true global rate limiting, use Redis (Upstash, etc.).
const rateLimitStore = new Map();
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;

const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS;
}

// Only the portfolio write endpoint requires a signed-in user.
// All page routes are public — pages handle their own auth state via useUser()/auth().
const isProtectedRoute = createRouteMatcher(['/api/portfolio']);

const clerkHandler = clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) {
    auth.protect();
  }
});

export default async function middleware(req, ev) {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      '127.0.0.1';

    if (isRateLimited(ip)) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests. Limit is 60 per minute per IP.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        }
      );
    }
  }

  const res = await clerkHandler(req, ev);

  // First-touch UTM attribution — set once, never overwritten
  if (!req.cookies.get('sd_attribution')) {
    const { searchParams } = req.nextUrl;
    const utmData = {};
    for (const param of UTM_PARAMS) {
      const val = searchParams.get(param);
      if (val) utmData[param] = val;
    }
    if (Object.keys(utmData).length > 0) {
      const response = res instanceof NextResponse ? res : NextResponse.next();
      response.cookies.set('sd_attribution', encodeURIComponent(JSON.stringify(utmData)), {
        path: '/',
        maxAge: 60 * 60 * 24 * 90, // 90 days
        sameSite: 'lax',
      });
      return response;
    }
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
