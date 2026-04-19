import { cn } from "@/lib/utils";

interface CardProps {
  title: string;
  subtitle?: string;
  icon?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export default function Card({ title, subtitle, icon, action, children, className }: CardProps) {
  return (
    <div className={cn(
      "bg-white border border-slate-200 rounded-2xl p-4 w-full min-w-0 overflow-hidden",
      className,
    )}>
      <div className="flex items-start justify-between gap-2 mb-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon && (
            <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
              </svg>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-semibold text-slate-900 tracking-tight truncate">{title}</div>
            {subtitle && (
              <div className="text-[10px] text-slate-500 mt-0.5 truncate">{subtitle}</div>
            )}
          </div>
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
