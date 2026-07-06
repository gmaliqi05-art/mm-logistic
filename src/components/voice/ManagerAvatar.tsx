/**
 * Elegant "manager" avatar — a self-contained SVG (no external image, so it is
 * CSP-safe and scales crisply at any size). Used as the draggable assistant
 * launcher and as the large centered figure while the assistant listens/speaks.
 *
 * Rendered with a transparent background (no coloured circle) so only the
 * gentleman himself shows. He is styled as a serious, well-dressed man with a
 * defined (non-round) face, curly hair and a tie.
 */
export default function ManagerAvatar({ size = 56, speaking = false }: { size?: number; speaking?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Assistant">
      {/* suit shoulders */}
      <path d="M12 100 Q12 70 50 70 Q88 70 88 100 Z" fill="#273043" />
      {/* lapels */}
      <path d="M50 72 L34 100 L43 100 L50 80 Z" fill="#1b2130" />
      <path d="M50 72 L66 100 L57 100 L50 80 Z" fill="#1b2130" />
      {/* shirt collar */}
      <path d="M41 71 L50 84 L59 71 L55 69 L50 75 L45 69 Z" fill="#f8fafc" />
      {/* tie */}
      <path d="M50 75 L45.5 80 L50 100 L54.5 80 Z" fill="#b91c1c" />
      <path d="M50 75 L47.5 78 L50 81 L52.5 78 Z" fill="#7f1616" />
      {/* neck */}
      <path d="M43 57 L43 70 Q50 75 57 70 L57 57 Z" fill="#d69a70" />
      {/* head — an oval with a defined jaw, not a plain circle */}
      <path
        d="M32 42 Q32 24 50 24 Q68 24 68 42 Q68 55 60 62 Q55 66 50 66 Q45 66 40 62 Q32 55 32 42 Z"
        fill="#eab68f"
      />
      {/* ears */}
      <path d="M31 44 Q27 44 29 49 Q31 52 33 50 Z" fill="#e3a97f" />
      <path d="M69 44 Q73 44 71 49 Q69 52 67 50 Z" fill="#e3a97f" />
      {/* curly hair — a cluster of soft coils framing the top of the head */}
      <g fill="#2c2622">
        <path d="M31 44 Q28 40 31 36 Q29 30 35 28 Q37 22 45 23 Q50 19 55 23 Q63 22 65 28 Q71 30 69 36 Q72 40 69 44 Q68 37 62 35 Q64 31 59 30 Q60 26 54 27 Q52 24 47 26 Q42 25 41 30 Q36 30 37 34 Q32 36 31 44 Z" />
        <circle cx="35" cy="31" r="4" />
        <circle cx="42" cy="27" r="4.2" />
        <circle cx="50" cy="25" r="4.4" />
        <circle cx="58" cy="27" r="4.2" />
        <circle cx="65" cy="31" r="4" />
        <circle cx="33" cy="38" r="3.6" />
        <circle cx="67" cy="38" r="3.6" />
      </g>
      {/* eyebrows — level, giving a composed, serious look */}
      <path d="M39 42 Q43 40 47 42" stroke="#2c2622" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M53 42 Q57 40 61 42" stroke="#2c2622" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* eyes */}
      <ellipse cx="43" cy="46" rx="2.1" ry="2.3" fill="#2b2622" />
      <ellipse cx="57" cy="46" rx="2.1" ry="2.3" fill="#2b2622" />
      {/* nose */}
      <path d="M50 47 L48 53 Q50 55 52 53" stroke="#c98a5f" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* mouth — opens a touch while speaking */}
      {speaking ? (
        <ellipse cx="50" cy="58" rx="4" ry="2.6" fill="#7a3f2c">
          <animate attributeName="ry" values="1.2;3;1.2" dur="0.5s" repeatCount="indefinite" />
        </ellipse>
      ) : (
        <path d="M45 58 Q50 61 55 58" stroke="#a85a3d" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}
