/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // geolocation=(self) lets Dawn's own pages ask for a location — attendance
  // punches and the shop-location setup both need it — while still denying it
  // to any embedded third-party frame. This read geolocation=() until V33,
  // which silently killed every location call in the product: the browser
  // refused before the request reached the OS, and reported it as a permission
  // denial, so it looked like a user or device problem for days. Camera and
  // microphone stay fully off; nothing in Dawn uses them.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig = {
  async headers() {
    return [
      {
        // Apply security headers to all routes.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
