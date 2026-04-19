import { arcPath } from "./utils";

interface DonutProps {
  segments: { value: number; color: string }[];
  size?: number;
  outerR?: number;
  innerR?: number;
  gap?: number;
}

export default function Donut({
  segments, size = 200, outerR = 88, innerR = 58, gap = 1.5,
}: DonutProps) {
  const total = segments.reduce((s, a) => s + a.value, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const actualGap = segments.length > 1 ? gap : 0;

  let cursor = -90;
  const paths: { d: string; color: string }[] = [];
  for (const s of segments) {
    if (s.value === 0) continue;
    const pct = s.value / total;
    const arcDeg = Math.max(0, pct * 360 - actualGap);
    paths.push({
      d: arcPath(cx, cy, outerR, innerR, cursor, cursor + arcDeg),
      color: s.color,
    });
    cursor += pct * 360;
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full block">
      <circle cx={cx} cy={cy} r={outerR} fill="#f1f5f9" />
      <circle cx={cx} cy={cy} r={innerR} fill="white" />
      {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} />)}
    </svg>
  );
}
