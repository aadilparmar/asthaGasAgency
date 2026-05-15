import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";
import {
  checkLoginRateLimit,
  getClientIp,
  recordLoginAttempt,
} from "@/lib/rateLimit";

const LoginSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

// Pre-computed bcrypt hash of a random string, used to keep bcrypt timing
// roughly constant when the username does not exist. Prevents an attacker
// from learning which usernames are valid by measuring response time.
const DUMMY_HASH =
  "$2a$12$CwTycUXWue0Thq9StjUM0uJ8Z9vJZ.5Pq5q1pX0o3vYy7HhM2jXyu";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);

  let parsedUsername = "";
  try {
    const body = await request.json().catch(() => null);
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }
    const { username, password } = parsed.data;
    parsedUsername = username;

    const decision = await checkLoginRateLimit(ip, username);
    if (!decision.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(decision.retryAfterSeconds) },
        }
      );
    }

    const user = await prisma.user.findUnique({ where: { username } });
    // Always run bcrypt.compare so response time does not reveal whether
    // the username exists.
    const valid = user
      ? await bcrypt.compare(password, user.password)
      : (await bcrypt.compare(password, DUMMY_HASH), false);

    if (!user || !valid) {
      await recordLoginAttempt(ip, username, false);
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    await recordLoginAttempt(ip, username, true);

    const token = await createToken({
      userId: user.id,
      username: user.username,
    });

    const response = NextResponse.json({ success: true, name: user.name });
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch {
    // Record an attempt on unexpected errors too, so the rate limiter
    // does not become a way to mask probing.
    if (parsedUsername) {
      await recordLoginAttempt(ip, parsedUsername, false).catch(() => {});
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
