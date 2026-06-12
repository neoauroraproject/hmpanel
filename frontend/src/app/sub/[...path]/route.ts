import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const path = resolvedParams.path.join("/");
  const backendUrl = process.env.API_URL || "http://panel-app:4000";
  
  try {
    const res = await fetch(`${backendUrl}/sub/${path}`, {
      method: 'GET',
      headers: {
        'Accept': req.headers.get('accept') || '*/*',
        'User-Agent': req.headers.get('user-agent') || 'NextJS-Proxy',
      }
    });

    const body = res.body;
    
    // Create new headers, forwarding essential ones
    const newHeaders = new Headers();
    const headersToForward = ['content-type', 'content-length', 'cache-control', 'last-modified', 'etag'];
    headersToForward.forEach(h => {
      const val = res.headers.get(h);
      if (val) newHeaders.set(h, val);
    });

    return new NextResponse(body, {
      status: res.status,
      headers: newHeaders,
    });
  } catch (error) {
    console.error(`Next.js Sub Proxy Error for ${path}:`, error);
    return new NextResponse("Error proxying asset", { status: 500 });
  }
}
