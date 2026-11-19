// Vercel Routing Middleware: the Falcon case study's lock, checked on the server.
// The lock page (src/pages/work/falcon-locked.astro) turns the visitor's password into a PBKDF2 hash and stores it
// in the falcon_access cookie. Here that cookie is compared with FALCON_ACCESS, an environment variable set in
// Vercel (never committed). Make its value with:  node tools/falcon-hash.mjs "the password"
// With no FALCON_ACCESS set, the door stays shut for everyone.

export const config = {
  matcher: ['/work/falcon', '/work/falcon/:path*', '/falcon-screen/:path*'],
};

const COOKIE = 'falcon_access';

function readCookie(header, name) {
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

// compares every character, so the time taken says nothing about how much of the cookie was right
function same(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// open to everyone, though it sits under /work/falcon/: the quick read (the detailed read stays locked)
const PUBLIC = ['/work/falcon/quick'];

export default function middleware(request) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  if (PUBLIC.includes(path)) return;
  const expected = (process.env.FALCON_ACCESS || '').trim().toLowerCase();
  const given = readCookie(request.headers.get('cookie'), COOKIE).toLowerCase();
  if (same(given, expected)) return;                       // the right password: carry on to the page

  const url = new URL(request.url);
  // the Falcon screen's own images and icons: not found, rather than a redirect to a page
  if (url.pathname.startsWith('/falcon-screen/')) return new Response('Not found', { status: 404 });
  return new Response(null, {
    status: 307,
    headers: { Location: new URL('/work/falcon-locked', url).toString(), 'Cache-Control': 'no-store' },
  });
}
