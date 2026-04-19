import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Alert } from "./types";

const ICON_PATHS: Record<Alert["icon"], string> = {
  fire:         "M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z",
  clock:        "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  cash:         "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  "trend-down": "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6",
  inbox:        "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4",
};

const LEVEL_STYLE = {
  danger:  { bg: "bg-rose-50",   border: "border-rose-200",   iconBg: "bg-rose-100",   iconFg: "text-rose-600",   text: "text-rose-900",   muted: "text-rose-700",   pulse: "bg-rose-400" },
  warning: { bg: "bg-violet-50", border: "border-violet-200", iconBg: "bg-violet-100", iconFg: "text-violet-600", text: "text-violet-900", muted: "text-violet-700", pulse: "bg-violet-400" },
  info:    { bg: "bg-sky-50",    border: "border-sky-200",    iconBg: "bg-sky-100",    iconFg: "text-sky-600",    text: "text-sky-900",    muted: "text-sky-700",    pulse: "bg-sky-400" },
};

interface AlertCardProps {
  alert: Alert;
}

export default function AlertCard({ alert }: AlertCardProps) {
  const c = LEVEL_STYLE[alert.level];

  const body = (
    <div className={cn(
      c.bg, "border", c.border,
      "rounded-xl p-3 flex items-start gap-2.5 w-full min-w-0 overflow-hidden transition-all hover:shadow-sm",
    )}>
      <div className="relative flex-shrink-0">
        <div className={cn(c.iconBg, "w-8 h-8 rounded-full flex items-center justify-center")}>
          <svg className={cn("w-3.5 h-3.5", c.iconFg)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={ICON_PATHS[alert.icon]} />
          </svg>
        </div>
        {alert.level === "danger" && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", c.pulse)} />
            <span className={cn("relative inline-flex rounded-full h-2 w-2", c.pulse)} />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className={cn("text-[12px] sm:text-xs font-medium flex items-center gap-2 min-w-0", c.text)}>
          <span className="truncate min-w-0">{alert.title}</span>
          {alert.count != null && (
            <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded-full flex-shrink-0", c.iconBg, c.iconFg)}>
              {alert.count}
            </span>
          )}
        </div>
        <div className={cn("text-[10px] sm:text-[11px] mt-0.5 truncate", c.muted)}>{alert.message}</div>
      </div>
      {alert.href && (
        <svg className={cn("w-3.5 h-3.5 flex-shrink-0 mt-2", c.muted)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  );

  return alert.href ? <Link href={alert.href} className="block w-full min-w-0">{body}</Link> : body;
}
