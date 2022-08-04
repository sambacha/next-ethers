import type { NextRequest, NextFetchEvent } from 'next/server';
import { NextResponse as Response } from 'next/server';

export default function middleware(req: NextRequest, ev: NextFetchEvent) {

// TMP
  if (req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = '/{ChaiId}';
    return Response.redirect(url);

  }
}
