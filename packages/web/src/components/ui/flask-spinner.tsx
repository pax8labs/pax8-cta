'use client'

import React from 'react'

interface FlaskSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  message?: string
  className?: string
}

/**
 * A fun science flask loading spinner with animated bubbles
 */
export function FlaskSpinner({ size = 'md', message, className = '' }: FlaskSpinnerProps) {
  const dimensions = {
    sm: { width: 32, height: 40, bubbleSize: 4 },
    md: { width: 48, height: 60, bubbleSize: 6 },
    lg: { width: 64, height: 80, bubbleSize: 8 },
  }

  const { width, height, bubbleSize } = dimensions[size]

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className="relative" style={{ width, height }}>
        {/* Flask SVG */}
        <svg
          viewBox="0 0 64 80"
          width={width}
          height={height}
          className="text-blue-600"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Flask neck */}
          <path
            d="M24 4 L24 24 L8 64 Q6 70 12 74 L52 74 Q58 70 56 64 L40 24 L40 4"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* Flask neck top */}
          <path
            d="M22 4 L42 4"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Liquid in flask - animated fill */}
          <path
            d="M12 58 Q10 64 14 68 L50 68 Q54 64 52 58 L44 40 L20 40 Z"
            fill="currentColor"
            opacity="0.3"
            className="animate-pulse"
          />

          {/* Liquid surface wave */}
          <path
            d="M20 40 Q26 38 32 40 Q38 42 44 40"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.5"
            className="animate-liquid-wave"
          />
        </svg>

        {/* Animated bubbles */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Bubble 1 */}
          <div
            className="absolute rounded-full bg-blue-400 opacity-70 animate-bubble-1"
            style={{
              width: bubbleSize,
              height: bubbleSize,
              left: '35%',
              bottom: '25%',
            }}
          />
          {/* Bubble 2 */}
          <div
            className="absolute rounded-full bg-blue-500 opacity-60 animate-bubble-2"
            style={{
              width: bubbleSize * 0.75,
              height: bubbleSize * 0.75,
              left: '50%',
              bottom: '30%',
            }}
          />
          {/* Bubble 3 */}
          <div
            className="absolute rounded-full bg-blue-300 opacity-80 animate-bubble-3"
            style={{
              width: bubbleSize * 0.5,
              height: bubbleSize * 0.5,
              left: '42%',
              bottom: '20%',
            }}
          />
          {/* Bubble 4 - escaping bubble */}
          <div
            className="absolute rounded-full bg-blue-400 opacity-50 animate-bubble-escape"
            style={{
              width: bubbleSize * 0.6,
              height: bubbleSize * 0.6,
              left: '48%',
              bottom: '60%',
            }}
          />
          {/* Bubble 5 - another escaping bubble */}
          <div
            className="absolute rounded-full bg-blue-300 opacity-40 animate-bubble-escape-2"
            style={{
              width: bubbleSize * 0.4,
              height: bubbleSize * 0.4,
              left: '52%',
              bottom: '65%',
            }}
          />
        </div>

        {/* Steam/vapor effect at top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2">
          <div className="flex gap-1">
            <div
              className="rounded-full bg-blue-200 opacity-30 animate-steam-1"
              style={{ width: bubbleSize * 0.5, height: bubbleSize * 0.5 }}
            />
            <div
              className="rounded-full bg-blue-200 opacity-20 animate-steam-2"
              style={{ width: bubbleSize * 0.4, height: bubbleSize * 0.4 }}
            />
          </div>
        </div>
      </div>

      {message && (
        <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">{message}</p>
      )}

      {/* Keyframe animations via style tag */}
      <style jsx>{`
        @keyframes bubble-rise-1 {
          0% {
            transform: translateY(0) scale(1);
            opacity: 0.7;
          }
          50% {
            transform: translateY(-15px) scale(1.1);
            opacity: 0.5;
          }
          100% {
            transform: translateY(-30px) scale(0.8);
            opacity: 0;
          }
        }

        @keyframes bubble-rise-2 {
          0% {
            transform: translateY(0) translateX(0) scale(1);
            opacity: 0.6;
          }
          50% {
            transform: translateY(-12px) translateX(3px) scale(1.15);
            opacity: 0.4;
          }
          100% {
            transform: translateY(-25px) translateX(-2px) scale(0.7);
            opacity: 0;
          }
        }

        @keyframes bubble-rise-3 {
          0% {
            transform: translateY(0) translateX(0) scale(1);
            opacity: 0.8;
          }
          50% {
            transform: translateY(-10px) translateX(-2px) scale(1.2);
            opacity: 0.5;
          }
          100% {
            transform: translateY(-20px) translateX(2px) scale(0.6);
            opacity: 0;
          }
        }

        @keyframes bubble-escape {
          0% {
            transform: translateY(0) scale(0);
            opacity: 0;
          }
          20% {
            transform: translateY(-5px) scale(1);
            opacity: 0.5;
          }
          100% {
            transform: translateY(-40px) scale(0.3);
            opacity: 0;
          }
        }

        @keyframes bubble-escape-2 {
          0% {
            transform: translateY(0) translateX(0) scale(0);
            opacity: 0;
          }
          30% {
            transform: translateY(-8px) translateX(3px) scale(1);
            opacity: 0.4;
          }
          100% {
            transform: translateY(-35px) translateX(-5px) scale(0.2);
            opacity: 0;
          }
        }

        @keyframes steam {
          0% {
            transform: translateY(0) scale(1);
            opacity: 0.3;
          }
          100% {
            transform: translateY(-15px) scale(1.5);
            opacity: 0;
          }
        }

        @keyframes liquid-wave {
          0%, 100% {
            d: path("M20 40 Q26 38 32 40 Q38 42 44 40");
          }
          50% {
            d: path("M20 40 Q26 42 32 40 Q38 38 44 40");
          }
        }

        .animate-bubble-1 {
          animation: bubble-rise-1 1.5s ease-in-out infinite;
        }

        .animate-bubble-2 {
          animation: bubble-rise-2 1.8s ease-in-out infinite 0.3s;
        }

        .animate-bubble-3 {
          animation: bubble-rise-3 1.3s ease-in-out infinite 0.6s;
        }

        .animate-bubble-escape {
          animation: bubble-escape 2.5s ease-out infinite 0.8s;
        }

        .animate-bubble-escape-2 {
          animation: bubble-escape-2 2.8s ease-out infinite 1.2s;
        }

        .animate-steam-1 {
          animation: steam 2s ease-out infinite;
        }

        .animate-steam-2 {
          animation: steam 2.2s ease-out infinite 0.5s;
        }

        .animate-liquid-wave {
          animation: liquid-wave 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

/**
 * Full-page loading overlay with flask spinner
 */
export function FlaskLoadingOverlay({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
      <FlaskSpinner size="lg" message={message} />
    </div>
  )
}

/**
 * Inline loading state for cards/sections
 */
export function FlaskLoadingCard({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center p-8">
      <FlaskSpinner size="md" message={message} />
    </div>
  )
}

export default FlaskSpinner
