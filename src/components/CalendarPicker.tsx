"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { cn, getMonthName, getDaysInMonth } from "@/lib/utils";

interface CalendarPickerProps {
  month: number;
  year: number;
  selectedDay?: number;
  onMonthChange: (month: number, year: number) => void;
  onDaySelect?: (day: number) => void;
  showDayPicker?: boolean;
}

const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function CalendarPicker({
  month, year, selectedDay, onMonthChange, onDaySelect, showDayPicker = false,
}: CalendarPickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"calendar" | "month" | "year">("calendar");
  const ref = useRef<HTMLDivElement>(null);

  const now = new Date();
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const today = now.getDate();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setMode("calendar");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const daysInMonth = useMemo(() => getDaysInMonth(month, year), [month, year]);
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

  function prevMonth() {
    if (month === 1) onMonthChange(12, year - 1);
    else onMonthChange(month - 1, year);
  }

  function nextMonth() {
    if (month === 12) onMonthChange(1, year + 1);
    else onMonthChange(month + 1, year);
  }

  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = year - 5; y <= year + 5; y++) years.push(y);
    return years;
  }, [year]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setMode("calendar"); }}
        className={cn(
          "flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-700 transition",
          "hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none",
          open && "border-slate-400 ring-1 ring-slate-400"
        )}
      >
        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {showDayPicker && selectedDay ? `${selectedDay} ` : ""}{getMonthName(month)} {year}
        <svg className={cn("w-3 h-3 text-slate-400 transition-transform", open && "rotate-180")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 right-0 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-[280px] animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setMode(mode === "month" ? "calendar" : "month")}
              className="text-sm font-semibold text-slate-800 hover:bg-slate-100 px-2 py-1 rounded-md transition"
            >
              {getMonthName(month)} {year}
            </button>

            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {mode === "calendar" && (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAY_HEADERS.map((d) => (
                  <div key={d} className="text-center text-[10px] font-medium text-slate-400 py-1">
                    {d}
                  </div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7">
                {/* Empty cells for offset */}
                {Array.from({ length: firstDayOfWeek }, (_, i) => (
                  <div key={`empty-${i}`} className="h-8" />
                ))}

                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const isSelected = showDayPicker && selectedDay === day;
                  const isToday = isCurrentMonth && today === day;
                  const isSunday = new Date(year, month - 1, day).getDay() === 0;

                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        if (showDayPicker && onDaySelect) {
                          onDaySelect(day);
                          setOpen(false);
                        }
                      }}
                      className={cn(
                        "h-8 w-full rounded-md text-xs font-medium transition-colors",
                        isSelected
                          ? "bg-slate-800 text-white"
                          : isToday
                            ? "bg-slate-100 text-slate-800 font-semibold"
                            : isSunday
                              ? "text-amber-600 hover:bg-amber-50"
                              : "text-slate-600 hover:bg-slate-50",
                        showDayPicker && "cursor-pointer"
                      )}
                      disabled={!showDayPicker}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              {/* Today shortcut */}
              <div className="mt-2 pt-2 border-t border-slate-100 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    onMonthChange(now.getMonth() + 1, now.getFullYear());
                    if (showDayPicker && onDaySelect) {
                      onDaySelect(now.getDate());
                      setOpen(false);
                    }
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1 rounded-md hover:bg-slate-50 transition"
                >
                  Today
                </button>
              </div>
            </>
          )}

          {mode === "month" && (
            <div className="space-y-3">
              {/* Year selector */}
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => onMonthChange(month, year - 1)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm font-semibold text-slate-800">{year}</span>
                <button
                  type="button"
                  onClick={() => onMonthChange(month, year + 1)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Month grid */}
              <div className="grid grid-cols-3 gap-1">
                {MONTHS_SHORT.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { onMonthChange(i + 1, year); setMode("calendar"); }}
                    className={cn(
                      "py-2 rounded-md text-xs font-medium transition-colors",
                      i + 1 === month
                        ? "bg-slate-800 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Year grid */}
              <div className="grid grid-cols-4 gap-1 pt-2 border-t border-slate-100">
                {yearOptions.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => { onMonthChange(month, y); setMode("calendar"); }}
                    className={cn(
                      "py-1.5 rounded-md text-xs font-medium transition-colors",
                      y === year
                        ? "bg-slate-800 text-white"
                        : "text-slate-500 hover:bg-slate-100"
                    )}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
