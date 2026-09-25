import { NextResponse, type NextRequest } from 'next/server';

const REQUEST_ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const SESSION_COOKIES = ['better-auth.session_token', '__Secure-better-auth.session_token'];
const PUBLIC_PREFIXES = ['/api/', '/media/', '/_next/', '/sign-in', '/sign-up'];

export function middleware(request: NextRequest) {
  const supplied = request.headers.get('x-request-id');
  const requestId = supplied && REQUEST_ID_RE.test(supplied) ? supplied : crypto.randomUUID();

  const { pathname, search } = request.nextUrl;
  const isPage =
    !PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) && pathname !== '/favicon.ico';
  // A cheap redirect for signed-out visitors. The real check is requireUser() on the server.
  if (isPage && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const res = NextResponse.redirect(url);
    res.headers.set('x-request-id', requestId);
    return res;
  }

  const forwarded = new Headers(request.headers);
  forwarded.set('x-request-id', requestId);
  const res = NextResponse.next({ request: { headers: forwarded } });
  res.headers.set('x-request-id', requestId);
  return res;
}

export const config = {
  // POST /api/photos is left out: when middleware runs, Next.js buffers request bodies for it
  // and truncates them past 10 MB, which would corrupt uploads of up to 50 MB. That route
  // assigns its own request ID and checks the session itself.
  matcher: ['/((?!_next/static|_next/image|api/photos).*)'],
};
