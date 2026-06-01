export { auth as middleware } from "@/auth";

/* Protect the rep workspace; the `authorized` callback in auth.ts redirects
   unauthenticated requests to /login. The prospect-facing /demo routes and
   public APIs are intentionally left open. */
export const config = {
  matcher: ["/workspace", "/workspace/:path*"],
};
