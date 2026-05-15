import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function parseJson<T>(
  req: NextRequest,
  schema: z.ZodType<T>
): Promise<ParseResult<T>> {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid request" }, { status: 400 }),
    };
  }
  return { ok: true, data: parsed.data };
}
