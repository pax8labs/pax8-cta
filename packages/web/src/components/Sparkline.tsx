interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  showDots?: boolean
  className?: string
}

export function Sparkline({
  data,
  width = 80,
  height = 20,
  color = '#3b82f6',
  showDots = false,
  className = '',
}: SparklineProps) {
  if (!data || data.length === 0) {
    return <span className="text-slate-300 text-xs">—</span>
  }

  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1 || 1)) * width
    const y = height - ((value - min) / range) * height
    return { x, y, value }
  })

  const pathData = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
    >
      <path
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDots && points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={index === points.length - 1 ? 2 : 1}
          fill={color}
        />
      ))}
    </svg>
  )
}

// Mini bar chart variant for discrete values
interface MiniBarProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  className?: string
}

export function MiniBar({
  data,
  width = 60,
  height = 16,
  color = '#3b82f6',
  className = '',
}: MiniBarProps) {
  if (!data || data.length === 0) {
    return <span className="text-slate-300 text-xs">—</span>
  }

  const max = Math.max(...data, 1)
  const barWidth = width / data.length - 1
  const gap = 1

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
    >
      {data.map((value, index) => {
        const barHeight = (value / max) * height
        const x = index * (barWidth + gap)
        const y = height - barHeight
        return (
          <rect
            key={index}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill={color}
            opacity={index === data.length - 1 ? 1 : 0.6}
            rx={1}
          />
        )
      })}
    </svg>
  )
}
