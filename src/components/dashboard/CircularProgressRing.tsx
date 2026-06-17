export interface CircularProgressRingProps {
  value: number
  size: number
  strokeWidth?: number
  label?: string
  color?: 'emerald' | 'blue'
  compact?: boolean
}

export function CircularProgressRing({
  value,
  size,
  strokeWidth = 10,
  label,
  color = 'emerald',
  compact = false,
}: CircularProgressRingProps) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference

  const strokeColor = color === 'blue' ? 'rgb(59, 130, 246)' : 'rgb(34, 197, 94)'

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle
          className="text-slate-100 stroke-current"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx="50"
          cy="50"
        />
        <circle
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx="50"
          cy="50"
          strokeDasharray={circumference}
          style={{
            stroke: strokeColor,
            strokeDashoffset: offset,
            transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {compact ? (
          <span className="text-lg font-bold text-slate-900">{value}%</span>
        ) : (
          <>
            <span className="text-4xl font-black font-display text-slate-900">
              {value}
              <span className="text-lg">%</span>
            </span>
            {label && (
              <span className="text-[10px] font-bold text-slate-400 tracking-widest">{label}</span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
