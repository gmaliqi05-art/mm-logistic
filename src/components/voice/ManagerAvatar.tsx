/**
 * Elegant "manager" avatar — a self-contained SVG (no external image, so it is
 * CSP-safe and scales crisply at any size). Used as the draggable assistant
 * launcher and as the large centered figure while the assistant listens/speaks.
 */
export default function ManagerAvatar({ size = 56, speaking = false }: { size?: number; speaking?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Assistant">
      <defs>
        <linearGradient id="mgrBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f766e" />
          <stop offset="1" stopColor="#134e4a" />
        </linearGradient>
        <clipPath id="mgrClip"><circle cx="50" cy="50" r="50" /></clipPath>
      </defs>
      <g clipPath="url(#mgrClip)">
        <circle cx="50" cy="50" r="50" fill="url(#mgrBg)" />
        {/* suit shoulders */}
        <path d="M14 100 Q14 71 50 71 Q86 71 86 100 Z" fill="#1f2937" />
        {/* lapels */}
        <path d="M50 74 L36 100 L44 100 L50 82 Z" fill="#111827" />
        <path d="M50 74 L64 100 L56 100 L50 82 Z" fill="#111827" />
        {/* shirt */}
        <path d="M40 73 L50 86 L60 73 L56 71 L50 77 L44 71 Z" fill="#f8fafc" />
        {/* tie */}
        <path d="M50 77 L46 82 L50 100 L54 82 Z" fill="#2dd4bf" />
        {/* neck */}
        <rect x="44" y="58" width="12" height="16" rx="5" fill="#e0aa82" />
        {/* head */}
        <circle cx="50" cy="45" r="18" fill="#eab68f" />
        {/* ears */}
        <circle cx="32" cy="46" r="3" fill="#eab68f" />
        <circle cx="68" cy="46" r="3" fill="#eab68f" />
        {/* hair */}
        <path d="M31 45 Q30 25 50 25 Q70 25 69 45 Q65 33 50 33 Q35 33 31 45 Z" fill="#3f3a36" />
        {/* eyebrows */}
        <path d="M40 41 Q43 39 46 41" stroke="#3f3a36" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <path d="M54 41 Q57 39 60 41" stroke="#3f3a36" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        {/* eyes */}
        <circle cx="43" cy="46" r="1.9" fill="#2b2622" />
        <circle cx="57" cy="46" r="1.9" fill="#2b2622" />
        {/* mouth — opens a touch while speaking */}
        {speaking ? (
          <ellipse cx="50" cy="54" rx="4" ry="2.6" fill="#7a3f2c">
            <animate attributeName="ry" values="1.2;3;1.2" dur="0.5s" repeatCount="indefinite" />
          </ellipse>
        ) : (
          <path d="M44 53 Q50 57 56 53" stroke="#a85a3d" strokeWidth="1.7" fill="none" strokeLinecap="round" />
        )}
      </g>
    </svg>
  );
}
