import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/landing(.*)",
  "/login(.*)",
  "/sign-up(.*)",
  "/dashboard(.*)",
  "/performance(.*)",
  "/macro(.*)",
  "/insider(.*)",
  "/ownership(.*)",
  "/institutional(.*)",
  "/peers(.*)",
  "/research(.*)",
  "/valuation(.*)",
  "/earnings(.*)",
  "/analyst(.*)",
  "/short-interest(.*)",
  "/api/(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/"],
};
