import type { FC } from 'react'
import { SuuntoModel } from '../../../main/deviceManager'

interface DeviceGraphicProps {
  model: SuuntoModel
  connected: boolean
  modelName: string
  isWayne?: boolean
}

export const DeviceGraphic: FC<DeviceGraphicProps> = ({ model, connected, modelName, isWayne }) => {
  if (model === 'suunto-wing') {
    return (
      <div className="relative flex flex-col items-center justify-center p-4">
        {/* Glowing aura */}
        <div
          className={`absolute w-44 h-44 rounded-full filter blur-2xl transition-opacity duration-700 ${
            connected ? 'bg-red-500/20 dark:bg-red-600/30 opacity-100' : 'bg-gray-400/10 opacity-40'
          }`}
        />

        {/* Suunto Wing SVG Graphic */}
        <svg
          className="relative w-56 h-36 drop-shadow-xl"
          viewBox="0 0 260 160"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient
              id="bandGrad"
              x1="20"
              y1="30"
              x2="240"
              y2="30"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#1e293b" />
              <stop offset="0.5" stopColor="#334155" />
              <stop offset="1" stopColor="#1e293b" />
            </linearGradient>
            <linearGradient id="ledGlow" x1="0" y1="0" x2="1" y2="0">
              <stop stopColor="#ef4444" />
              <stop offset="1" stopColor="#dc2626" />
            </linearGradient>
            <filter id="redLedBlur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Neckband Titanium Arch */}
          <path
            d="M 50 110 C 20 60, 40 20, 130 20 C 220 20, 240 60, 210 110"
            stroke="url(#bandGrad)"
            strokeWidth="8"
            strokeLinecap="round"
          />

          {/* Left Transducer Body */}
          <rect
            x="36"
            y="95"
            width="28"
            height="42"
            rx="8"
            fill="#0f172a"
            stroke="#334155"
            strokeWidth="2"
          />
          {/* Left Transducer Cushion / Contact Pad */}
          <rect x="42" y="103" width="16" height="26" rx="4" fill="#1e293b" />

          {/* Right Transducer Body */}
          <rect
            x="196"
            y="95"
            width="28"
            height="42"
            rx="8"
            fill="#0f172a"
            stroke="#334155"
            strokeWidth="2"
          />
          {/* Right Transducer Cushion */}
          <rect x="202" y="103" width="16" height="26" rx="4" fill="#1e293b" />

          {/* Left Ear Hook */}
          <path
            d="M 50 100 C 45 70, 70 65, 80 80"
            stroke="#1e293b"
            strokeWidth="6"
            strokeLinecap="round"
          />

          {/* Right Ear Hook */}
          <path
            d="M 210 100 C 215 70, 190 65, 180 80"
            stroke="#1e293b"
            strokeWidth="6"
            strokeLinecap="round"
          />

          {/* Signature Suunto Wing LED Safety Light - Left Side */}
          <g filter={connected ? 'url(#redLedBlur)' : undefined}>
            <rect
              x="47"
              y="100"
              width="6"
              height="20"
              rx="3"
              fill={connected ? '#ef4444' : '#64748b'}
              className={connected ? 'animate-pulse' : ''}
            />
          </g>

          {/* Signature Suunto Wing LED Safety Light - Right Side */}
          <g filter={connected ? 'url(#redLedBlur)' : undefined}>
            <rect
              x="207"
              y="100"
              width="6"
              height="20"
              rx="3"
              fill={connected ? '#ef4444' : '#64748b'}
              className={connected ? 'animate-pulse' : ''}
            />
          </g>

          {/* Suunto Center Badge */}
          <rect
            x="110"
            y="12"
            width="40"
            height="16"
            rx="4"
            fill="#0f172a"
            stroke="#475569"
            strokeWidth="1"
          />
          <text
            x="130"
            y="23"
            fill="#e2e8f0"
            fontSize="7"
            fontFamily="sans-serif"
            fontWeight="bold"
            textAnchor="middle"
            letterSpacing="1"
          >
            SUUNTO
          </text>

          {/* Bone Conduction Soundwave graphics */}
          {connected && (
            <>
              <circle
                cx="50"
                cy="116"
                r="18"
                stroke="#ef4444"
                strokeWidth="1"
                opacity="0.4"
                className="animate-ping"
              />
              <circle
                cx="210"
                cy="116"
                r="18"
                stroke="#ef4444"
                strokeWidth="1"
                opacity="0.4"
                className="animate-ping"
              />
            </>
          )}
        </svg>

        <div className="mt-2 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="font-bold text-gray-900 dark:text-white tracking-wide text-sm">
              {modelName}
            </span>
            {isWayne && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                Wayne&apos;s Edition
              </span>
            )}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Open-Ear Bone Conduction Headset • Offline Music Storage
          </span>
        </div>
      </div>
    )
  }

  if (model === 'suunto-sonic') {
    return (
      <div className="relative flex flex-col items-center justify-center p-4">
        <div
          className={`absolute w-44 h-44 rounded-full filter blur-2xl transition-opacity duration-700 ${
            connected ? 'bg-cyan-500/20 opacity-100' : 'bg-gray-400/10 opacity-40'
          }`}
        />

        <svg className="relative w-56 h-36 drop-shadow-xl" viewBox="0 0 260 160" fill="none">
          <path
            d="M 50 110 C 20 60, 40 20, 130 20 C 220 20, 240 60, 210 110"
            stroke="#0ea5e9"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <rect
            x="36"
            y="95"
            width="28"
            height="42"
            rx="8"
            fill="#0f172a"
            stroke="#0ea5e9"
            strokeWidth="2"
          />
          <rect
            x="196"
            y="95"
            width="28"
            height="42"
            rx="8"
            fill="#0f172a"
            stroke="#0ea5e9"
            strokeWidth="2"
          />
          <rect
            x="110"
            y="12"
            width="40"
            height="16"
            rx="4"
            fill="#0f172a"
            stroke="#38bdf8"
            strokeWidth="1"
          />
          <text
            x="130"
            y="23"
            fill="#e2e8f0"
            fontSize="7"
            fontWeight="bold"
            textAnchor="middle"
            letterSpacing="1"
          >
            SUUNTO
          </text>
        </svg>

        <div className="mt-2 text-center">
          <span className="font-bold text-gray-900 dark:text-white tracking-wide text-sm">
            {modelName}
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400">Lightweight Sports Headset</p>
        </div>
      </div>
    )
  }

  if (model === 'suunto-watch') {
    return (
      <div className="relative flex flex-col items-center justify-center p-4">
        <div
          className={`absolute w-40 h-40 rounded-full filter blur-2xl transition-opacity duration-700 ${
            connected ? 'bg-amber-500/20 opacity-100' : 'bg-gray-400/10 opacity-40'
          }`}
        />

        <svg className="relative w-40 h-36 drop-shadow-xl" viewBox="0 0 160 160" fill="none">
          <rect x="65" y="10" width="30" height="140" rx="6" fill="#334155" />
          <circle cx="80" cy="80" r="48" fill="#0f172a" stroke="#94a3b8" strokeWidth="5" />
          <circle cx="80" cy="80" r="40" fill="#020617" />
          <circle cx="80" cy="80" r="3" fill="#ef4444" />
          <path d="M 80 80 L 80 55" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
          <path d="M 80 80 L 100 80" stroke="#f8fafc" strokeWidth="2.5" strokeLinecap="round" />
        </svg>

        <div className="mt-2 text-center">
          <span className="font-bold text-gray-900 dark:text-white tracking-wide text-sm">
            {modelName}
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            GPS Multisport Watch • Music Storage
          </p>
        </div>
      </div>
    )
  }

  // Generic USB / MP3 Player
  return (
    <div className="relative flex flex-col items-center justify-center p-4">
      <div
        className={`absolute w-40 h-40 rounded-full filter blur-2xl transition-opacity duration-700 ${
          connected ? 'bg-red-500/15 opacity-100' : 'bg-gray-400/10 opacity-40'
        }`}
      />

      <svg className="relative w-40 h-36 drop-shadow-xl" viewBox="0 0 160 160" fill="none">
        <rect
          x="45"
          y="30"
          width="70"
          height="100"
          rx="10"
          fill="#0f172a"
          stroke="#475569"
          strokeWidth="3"
        />
        <rect x="55" y="42" width="50" height="40" rx="4" fill="#1e293b" />
        <circle cx="80" cy="105" r="14" fill="#334155" />
        <polygon points="76,100 86,105 76,110" fill="#f8fafc" />
        <path d="M 65 58 Q 75 48 85 58 T 95 58" stroke="#ef4444" strokeWidth="2" fill="none" />
      </svg>

      <div className="mt-2 text-center">
        <span className="font-bold text-gray-900 dark:text-white tracking-wide text-sm">
          {modelName}
        </span>
        <p className="text-xs text-gray-500 dark:text-gray-400">Portable Music Storage</p>
      </div>
    </div>
  )
}
