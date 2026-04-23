import { NextRequest, NextResponse } from 'next/server';
import { compileCanvasCss } from '@/lib/server/cssGenerator';

export const dynamic = 'force-dynamic';

/**
 * POST /ycode/api/canvas/css
 *
 * Compile Tailwind CSS for the exact set of class candidates currently used
 * by the live editor canvas. Replaces the Tailwind browser CDN JIT that used
 * to run inside the canvas iframe.
 *
 * Body: { classes: string[] }
 * Response: text/css (compiled Tailwind output)
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { classes?: unknown };
    const raw = Array.isArray(body.classes) ? body.classes : [];

    const classes = raw
      .filter((cls): cls is string => typeof cls === 'string')
      .map((cls) => cls.trim())
      .filter((cls) => cls.length > 0);

    const css = await compileCanvasCss(classes);

    return new NextResponse(css, {
      status: 200,
      headers: {
        'content-type': 'text/css; charset=utf-8',
        // Content is derived entirely from the request body; the client keys
        // its Blob URL cache by a hash of the input, so we don't need HTTP
        // caching here.
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[canvas-css] Failed to compile canvas CSS:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to compile CSS',
      },
      { status: 500 },
    );
  }
}
