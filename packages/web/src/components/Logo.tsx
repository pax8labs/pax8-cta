export function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Robot antenna with glow effect */}
      <circle cx="24" cy="4" r="2.5" fill="#60a5fa">
        <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
      </circle>
      <line x1="24" y1="6.5" x2="24" y2="12" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />

      {/* Modern sleek crate - shipping container style */}
      <rect
        x="6"
        y="14"
        width="36"
        height="30"
        rx="3"
        fill="url(#crateGradient)"
      />

      {/* Crate detail lines - minimal shipping label style */}
      <rect x="8" y="16" width="8" height="5" rx="1" fill="#1e3a8a" opacity="0.3" />
      <rect x="32" y="16" width="8" height="5" rx="1" fill="#1e3a8a" opacity="0.3" />

      {/* Robot emerging from crate */}
      <g>
        {/* Robot head/body - sleek rounded design */}
        <rect x="14" y="22" width="20" height="16" rx="4" fill="white" />

        {/* Robot visor/eyes - single sleek visor */}
        <rect x="17" y="26" width="14" height="4" rx="2" fill="url(#visorGradient)" />

        {/* Eye lights within visor */}
        <circle cx="20.5" cy="28" r="1.5" fill="white" opacity="0.9" />
        <circle cx="27.5" cy="28" r="1.5" fill="white" opacity="0.9" />

        {/* Robot smile - friendly arc */}
        <path
          d="M20 34 Q24 37 28 34"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />

        {/* Robot ear details */}
        <rect x="11" y="26" width="3" height="6" rx="1" fill="#e2e8f0" />
        <rect x="34" y="26" width="3" height="6" rx="1" fill="#e2e8f0" />
      </g>

      {/* Subtle crate edge highlight */}
      <line x1="6" y1="44" x2="42" y2="44" stroke="#1e3a8a" strokeWidth="1" opacity="0.4" />

      {/* Gradient definitions */}
      <defs>
        <linearGradient id="crateGradient" x1="6" y1="14" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" />
          <stop offset="0.5" stopColor="#2563eb" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="visorGradient" x1="17" y1="26" x2="31" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1e3a8a" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
    </svg>
  )
}
