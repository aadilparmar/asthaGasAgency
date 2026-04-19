interface LegendDotProps {
  color: string;
  label: string;
  dashed?: boolean;
}

export default function LegendDot({ color, label, dashed }: LegendDotProps) {
  return (
    <div className="flex items-center gap-1 text-slate-300 flex-shrink-0">
      <span
        className="inline-block w-3 h-[2px] rounded"
        style={{
          background: dashed
            ? `repeating-linear-gradient(to right, ${color} 0, ${color} 2px, transparent 2px, transparent 4px)`
            : color,
        }}
      />
      <span className="text-[10px]">{label}</span>
    </div>
  );
}
