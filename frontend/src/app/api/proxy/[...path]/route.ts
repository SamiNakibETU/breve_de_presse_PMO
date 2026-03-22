import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const BACKEND =
  process.env.BACKEND_INTERNAL_URL?.replace(/\/+$/, "") ?? "http://127.0.0.1:8000";
const INTERNAL_KEY = process.env.INTERNAL_API_KEY?.trim();

function buildTargetUrl(req: NextRequest, segments: string[]): string {
  const path = segments.length ? segments.join("/") : "";
  const suffix = path ? `/${path}` : "";
  return `${BACKEND}${suffix}${req.nextUrl.search}`;
}

async function forward(req: NextRequest, segments: string[]): Promise<NextResponse> {
  const url = buildTargetUrl(req, segments);
  const headers = new Headers();
  const accept = req.headers.get("Accept");
  if (accept) headers.set("Accept", accept);
  else headers.set("Accept", "application/json");

  if (INTERNAL_KEY) {
    headers.set("Authorization", `Bearer ${INTERNAL_KEY}`);
  }
  const editor = req.headers.get("X-Editor-ID");
  if (editor) {
    headers.set("X-Editor-ID", editor);
  }

  const method = req.method.toUpperCase();
  let body: string | undefined;
  if (!["GET", "HEAD"].includes(method)) {
    body = await req.text();
    const ct = req.headers.get("Content-Type");
    if (ct) headers.set("Content-Type", ct);
    else if (body) headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body && body.length > 0 ? body : undefined,
    cache: "no-store",
  });

  const outHeaders = new Headers();
  const resCt = res.headers.get("Content-Type");
  if (resCt) outHeaders.set("Content-Type", resCt);

  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: outHeaders });
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return forward(req, path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return forward(req, path);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return forward(req, path);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return forward(req, path);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return forward(req, path);
}
