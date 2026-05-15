import { prisma } from "./prisma";

export const IP_WINDOW_MINUTES = 15;
export const IP_MAX_FAILURES = 5;
export const USER_WINDOW_MINUTES = 30;
export const USER_MAX_FAILURES = 10;

export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  return "unknown";
}

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; reason: "ip" | "user"; retryAfterSeconds: number };

export async function checkLoginRateLimit(
  ip: string,
  username: string
): Promise<RateLimitDecision> {
  const ipSince = new Date(Date.now() - IP_WINDOW_MINUTES * 60 * 1000);
  const userSince = new Date(Date.now() - USER_WINDOW_MINUTES * 60 * 1000);

  const [ipFailures, userFailures] = await Promise.all([
    prisma.loginAttempt.count({
      where: { ipAddress: ip, success: false, createdAt: { gte: ipSince } },
    }),
    prisma.loginAttempt.count({
      where: {
        username,
        success: false,
        createdAt: { gte: userSince },
      },
    }),
  ]);

  if (ipFailures >= IP_MAX_FAILURES) {
    return {
      allowed: false,
      reason: "ip",
      retryAfterSeconds: IP_WINDOW_MINUTES * 60,
    };
  }
  if (userFailures >= USER_MAX_FAILURES) {
    return {
      allowed: false,
      reason: "user",
      retryAfterSeconds: USER_WINDOW_MINUTES * 60,
    };
  }
  return { allowed: true };
}

export async function recordLoginAttempt(
  ip: string,
  username: string,
  success: boolean
): Promise<void> {
  await prisma.loginAttempt.create({
    data: { ipAddress: ip, username, success },
  });
}
