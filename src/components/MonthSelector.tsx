"use client";

import { getMonthName } from "@/lib/utils";

interface MonthSelectorProps {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
}

export default function MonthSelector({ month, year, onChange }: MonthSelectorProps) {
  function prev() {
    if (month === 1) onChange(12, year - 1);
    else onChange(month - 1, year);
  }

  function next() {
    if (month === 12) onChange(1, year + 1);
    else onChange(month + 1, year);
  }

  return (
    <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg px-1 py-0.5">
      <button
        onClick={prev}
        className="p-1.5 rounded text-slate-400 hover:text-slate-600 transition"
        title="Previous month"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span className="text-[13px] font-medium text-slate-700 min-w-[120px] text-center select-none px-1">
        {getMonthName(month)} {year}
      </span>
      <button
        onClick={next}
        className="p-1.5 rounded text-slate-400 hover:text-slate-600 transition"
        title="Next month"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
