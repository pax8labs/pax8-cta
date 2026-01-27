import Link from 'next/link'

interface StatsCardProps {
  title: string
  value: string | number
  color: 'blue' | 'green' | 'yellow' | 'red'
  href?: string
  subtitle?: string
}

const colorConfig = {
  blue: {
    bg: 'bg-gradient-to-br from-blue-500 to-blue-600',
    hoverBg: 'hover:from-blue-600 hover:to-blue-700',
    icon: 'bg-blue-400/30',
    text: 'text-white',
  },
  green: {
    bg: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
    hoverBg: 'hover:from-emerald-600 hover:to-emerald-700',
    icon: 'bg-emerald-400/30',
    text: 'text-white',
  },
  yellow: {
    bg: 'bg-gradient-to-br from-amber-500 to-amber-600',
    hoverBg: 'hover:from-amber-600 hover:to-amber-700',
    icon: 'bg-amber-400/30',
    text: 'text-white',
  },
  red: {
    bg: 'bg-gradient-to-br from-rose-500 to-rose-600',
    hoverBg: 'hover:from-rose-600 hover:to-rose-700',
    icon: 'bg-rose-400/30',
    text: 'text-white',
  },
}

const icons = {
  blue: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  yellow: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  green: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  red: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
}

export function StatsCard({ title, value, color, href, subtitle }: StatsCardProps) {
  const config = colorConfig[color]

  const content = (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-90">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs mt-1 opacity-75">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-full ${config.icon}`}>
          {icons[color]}
        </div>
      </div>
      {href && (
        <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between text-sm opacity-90">
          <span>View details</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className={`block rounded-xl p-5 shadow-lg transition-all ${config.bg} ${config.hoverBg} ${config.text} hover:shadow-xl hover:scale-[1.02]`}
      >
        {content}
      </Link>
    )
  }

  return (
    <div className={`rounded-xl p-5 shadow-lg ${config.bg} ${config.text}`}>
      {content}
    </div>
  )
}
