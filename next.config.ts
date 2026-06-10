import type { NextConfig } from "next";

// SEC-6 (Wave-16 security hardening): baseline response security headers
// applied to every route. HSTS is intentionally NOT set here — it is
// meaningless on localhost HTTP and is deferred to production (PR-2 in
// PRODUCTION-READINESS.md). The CSP ships intentionally permissive
// (`'unsafe-inline'` + `'unsafe-eval'` in `script-src`) so the Next.js /
// React runtime keeps working in development; tightening it is deferred
// (PR-3 in PRODUCTION-READINESS.md).
//
// The CSP allowlists the three external asset CDNs the app legitimately
// uses (verified Wave-16 QA): Google Fonts (the brand typography loaded via
// <link> in app/layout.tsx), DiceBear (`src/lib/avatar.ts` avatars), and the
// Iconify icon API (`@iconify/react`, hosts api.iconify.design + its two
// fallbacks). Without these the app ships a missing brand font, broken
// avatars, and degraded icons. These are specific origins, not wildcards.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      // W41: *.supabase.co — signature images (and any storage-served media)
      // load via public/signed storage URLs; without this img-src entry the
      // browser CSP-blocked them, which was the real root cause of the
      // "Couldn't load the signature image" state.
      "img-src 'self' data: blob: https://api.dicebear.com https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
