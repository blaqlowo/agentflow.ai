import { NextResponse } from "next/server";

export async function readJson(req: Request, maxBytes: number): Promise<{ ok: true; data: unknown } | { ok: false; res: NextResponse }> {
  const text = await req.text();
  if (text.length > maxBytes) {
    return { ok: false, res: NextResponse.json({ error: "too_large", message: "That request is too large." }, { status: 413 }) };
  }
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, res: NextResponse.json({ error: "bad_json", message: "The request body is not valid JSON." }, { status: 400 }) };
  }
}

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
