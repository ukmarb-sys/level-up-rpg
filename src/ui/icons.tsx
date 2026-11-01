/** Original inline SVG icons for resources and buildings. */
import { iconBackground, paintedIcon } from '../assets/icon';
import type { BuildingType, ResourceType } from '../core/types';

export function ResourceIcon({ type, size = 22 }: { type: ResourceType; size?: number }) {
  switch (type) {
    case 'wood':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <rect x="3" y="8" width="16" height="9" rx="4.5" fill="#9c6b3e" />
          <ellipse cx="18" cy="12.5" rx="3.6" ry="4.5" fill="#e2b77c" />
          <ellipse cx="18" cy="12.5" rx="1.8" ry="2.4" fill="none" stroke="#9c6b3e" strokeWidth="1" />
          <path d="M6 10.5h7M5 14h8" stroke="#6e4524" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'stone':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M4 16 7 8l6-3 6 4 1 7-6 4H8z" fill="#8d8a9e" />
          <path d="M7 8l6-3 6 4-6 2z" fill="#b3b0c4" />
          <path d="M13 11v9" stroke="#6b687c" strokeWidth="1.2" />
        </svg>
      );
    case 'magic':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <defs>
            <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#efe8ff" />
              <stop offset="1" stopColor="#7b5cff" />
            </linearGradient>
          </defs>
          <path d="M12 2 18 10 12 22 6 10Z" fill="url(#mg)" />
          <path d="M12 2 14.5 10 12 22" fill="#fff" opacity=".3" />
          <path d="M6 10h12" stroke="#5b3fe0" strokeWidth=".8" />
        </svg>
      );
  }
}

/**
 * Building icon: the painted sprite the map uses (cropped to the building) when that artwork
 * exists, otherwise the built-in vector icon.
 */
export function BuildingIcon({ type, size = 48 }: { type: BuildingType; size?: number }) {
  const painted = paintedIcon(type);
  if (painted) {
    return (
      <span
        className="painted-icon"
        data-painted={type}
        aria-hidden
        style={{ width: size, height: size, backgroundImage: `url("${painted.url}")`, ...iconBackground(painted.crop, size) }}
      />
    );
  }
  return <VectorBuildingIcon type={type} size={size} />;
}

function VectorBuildingIcon({ type, size = 48 }: { type: BuildingType; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 48 48', 'aria-hidden': true } as const;
  switch (type) {
    case 'cottage':
      return (
        <svg {...common}>
          <path d="M24 40 8 32V22l16 8z" fill="#cdb48a" />
          <path d="M24 40l16-8V22l-16 8z" fill="#a8916b" />
          <path d="M6 23 24 10l18 13-18 9z" fill="#a4452f" />
          <path d="M24 10l18 13-18 9z" fill="#7d3222" />
          <rect x="29" y="8" width="4" height="9" fill="#7a6f72" />
          <path d="M13 30l4 2v6l-4-2z" fill="#5a3a24" />
          <path d="M30 31l5-2.5v4L30 35z" fill="#ffc96b" />
        </svg>
      );
    case 'farm':
      return (
        <svg {...common}>
          <path d="M4 30 24 20l20 10-20 10z" fill="#6e5131" />
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M${9 + i * 5} ${32 - i * 2.5}l13 6.5`} stroke="#d9b44a" strokeWidth="2.4" strokeLinecap="round" />
          ))}
          <path d="M30 22l8-4 6 3v6l-8 4-6-3z" fill="#a3423a" />
          <path d="M29 22l8-8 8 7-8 4z" fill="#5b3a2e" />
        </svg>
      );
    case 'sawmill':
      return (
        <svg {...common}>
          <path d="M6 30 22 22l16 8-16 8z" fill="#5d4a37" />
          <path d="M8 29v-9l13-6.5V22z" fill="#8a5a33" />
          <path d="M21 22v-8.5l12 6V28z" fill="#6c4627" />
          <path d="M6 20 20 11l15 8-13 4z" fill="#4f6b3a" />
          <circle cx="36" cy="30" r="7" fill="#d7dbe4" />
          <circle cx="36" cy="30" r="2" fill="#6b7280" />
          <path d="M36 23l1.5 2.2M43 30l-2.2 1.5M36 37l-1.5-2.2M29 30l2.2-1.5" stroke="#9aa1ad" strokeWidth="1.4" />
        </svg>
      );
    case 'mageTower':
      return (
        <svg {...common}>
          <defs>
            <radialGradient id="orb" cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="#fff" />
              <stop offset="1" stopColor="#8f6bff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path d="M18 44V22l6-3 6 3v22l-6 3z" fill="#7d7a96" />
          <path d="M24 47V19l6 3v22z" fill="#5f5c78" />
          <path d="M16 23 24 6l8 17-8 3z" fill="#4b3a99" />
          <path d="M24 6l8 17-8 3z" fill="#352873" />
          <rect x="21" y="30" width="2.4" height="6" fill="#b79cff" />
          <circle cx="24" cy="5" r="6" fill="url(#orb)" />
        </svg>
      );
  }
}

export function Glyph({
  name,
  size = 22,
}: {
  name: 'rotate' | 'check' | 'close' | 'move' | 'trash' | 'menu' | 'plus' | 'minus' | 'chevronUp' | 'chevronDown' | 'lock' | 'gear' | 'flask';
  size?: number;
}) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
  switch (name) {
    case 'rotate':
      return <svg {...p}><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v5h-5" /></svg>;
    case 'check':
      return <svg {...p}><path d="m5 12.5 4.5 4.5L19 7" /></svg>;
    case 'close':
      return <svg {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>;
    case 'move':
      return <svg {...p}><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" /></svg>;
    case 'trash':
      return <svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
    case 'menu':
      return <svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
    case 'plus':
      return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
    case 'minus':
      return <svg {...p}><path d="M5 12h14" /></svg>;
    case 'chevronUp':
      return <svg {...p}><path d="m6 15 6-6 6 6" /></svg>;
    case 'chevronDown':
      return <svg {...p}><path d="m6 9 6 6 6-6" /></svg>;
    case 'lock':
      return <svg {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
    case 'gear':
      return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>;
    case 'flask':
      return <svg {...p}><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" /><path d="M7.5 15h9" /></svg>;
  }
}
