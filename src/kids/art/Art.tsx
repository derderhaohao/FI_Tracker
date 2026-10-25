import type { Jar } from '../math';
import { AVATARS, JAR_COLORS } from './palette';

// Original inline SVG art for Beginner mode (PRD Part D, "Look and language"): friendly animal
// avatars, jars, coins and a tree. Colours come with words and icons on screen, never alone.

/** One of eight animal faces. */
export function Avatar({ index, size = 56 }: { index: number; size?: number }) {
  const a = AVATARS[((index % AVATARS.length) + AVATARS.length) % AVATARS.length];
  const ears =
    a.name === 'rabbit' ? (
      <>
        <ellipse cx="22" cy="12" rx="7" ry="16" fill={a.face} stroke="#d9d9d9" />
        <ellipse cx="42" cy="12" rx="7" ry="16" fill={a.face} stroke="#d9d9d9" />
        <ellipse cx="22" cy="13" rx="3" ry="11" fill={a.ear} />
        <ellipse cx="42" cy="13" rx="3" ry="11" fill={a.ear} />
      </>
    ) : a.name === 'cat' || a.name === 'fox' ? (
      <>
        <path d="M12 26 L16 6 L28 18 Z" fill={a.ear} />
        <path d="M52 26 L48 6 L36 18 Z" fill={a.ear} />
      </>
    ) : a.name === 'frog' ? (
      <>
        <circle cx="20" cy="16" r="9" fill={a.face} />
        <circle cx="44" cy="16" r="9" fill={a.face} />
      </>
    ) : a.name === 'owl' ? (
      <>
        <path d="M14 20 L18 8 L26 16 Z" fill={a.ear} />
        <path d="M50 20 L46 8 L38 16 Z" fill={a.ear} />
      </>
    ) : (
      <>
        <circle cx="16" cy="16" r="8" fill={a.ear} />
        <circle cx="48" cy="16" r="8" fill={a.ear} />
      </>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      {ears}
      <circle cx="32" cy="36" r="22" fill={a.face} stroke={a.name === 'panda' ? '#ddd' : 'none'} />
      {a.name === 'panda' && (
        <>
          <ellipse cx="24" cy="34" rx="6" ry="7" fill="#333" />
          <ellipse cx="40" cy="34" rx="6" ry="7" fill="#333" />
        </>
      )}
      {a.name === 'owl' ? (
        <>
          <circle cx="24" cy="33" r="7" fill="#fff" />
          <circle cx="40" cy="33" r="7" fill="#fff" />
          <circle cx="24" cy="33" r="3.5" fill="#222" />
          <circle cx="40" cy="33" r="3.5" fill="#222" />
          <path d="M29 40 L32 45 L35 40 Z" fill="#e8a33d" />
        </>
      ) : (
        <>
          <circle cx="24" cy="34" r="3" fill={a.name === 'panda' ? '#fff' : '#222'} />
          <circle cx="40" cy="34" r="3" fill={a.name === 'panda' ? '#fff' : '#222'} />
          <ellipse cx="32" cy="42" rx="3.5" ry="2.5" fill="#333" />
          <path d="M26 46 Q32 51 38 46" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      )}
      <circle cx="18" cy="42" r="3" fill="#ff8fa3" opacity="0.5" />
      <circle cx="46" cy="42" r="3" fill="#ff8fa3" opacity="0.5" />
    </svg>
  );
}

/** A glass jar filled to `level` (0 to 1) with coins. */
export function JarArt({ jar, level, size = 72 }: { jar: Jar; level: number; size?: number }) {
  const fill = Math.max(0, Math.min(1, level));
  const top = 58 - fill * 38;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="18" y="6" width="28" height="6" rx="2" fill={JAR_COLORS[jar]} />
      <path
        d="M16 14 h32 q4 0 4 6 v32 q0 8 -8 8 h-24 q-8 0 -8 -8 v-32 q0 -6 4 -6 Z"
        fill="#e6f0f5"
        stroke="#9fb4bf"
        strokeWidth="2"
        opacity="0.9"
      />
      {fill > 0 && (
        <g>
          <path
            d={`M14 ${top} h36 v${58 - top} q0 2 -6 2 h-24 q-6 0 -6 -2 Z`}
            fill={JAR_COLORS[jar]}
            opacity="0.35"
          />
          {Array.from({ length: Math.max(1, Math.round(fill * 6)) }, (_, i) => (
            <ellipse
              key={i}
              cx={22 + (i % 3) * 10}
              cy={54 - Math.floor(i / 3) * 7}
              rx="5"
              ry="3"
              fill="#facc15"
              stroke="#ca8a04"
            />
          ))}
        </g>
      )}
    </svg>
  );
}

/** A gold coin with an optional count of stacked coins. */
export function Coin({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="inline-block shrink-0">
      <circle cx="12" cy="12" r="10" fill="#facc15" stroke="#ca8a04" strokeWidth="2" />
      <circle cx="12" cy="12" r="5.5" fill="none" stroke="#ca8a04" strokeWidth="1.5" />
    </svg>
  );
}

/** A bag of coins, for the freedom number. */
export function CoinBag({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="inline-block shrink-0">
      <path d="M14 8 h12 l-3 6 h-6 Z" fill="#b45309" />
      <path d="M17 14 h6 q12 6 10 18 q-1 6 -13 6 q-12 0 -13 -6 q-2 -12 10 -18 Z" fill="#d97706" />
      <circle cx="20" cy="27" r="5" fill="#facc15" stroke="#ca8a04" />
    </svg>
  );
}

/** A money tree from seed (0) to big tree (4), with coin fruit as it grows. */
export function TreeArt({ size: stage, px = 140 }: { size: 0 | 1 | 2 | 3 | 4; px?: number }) {
  const trunk = [0, 14, 26, 36, 44][stage];
  const crown = [0, 14, 24, 32, 40][stage];
  const fruit = [0, 0, 2, 4, 7][stage];
  return (
    <svg width={px} height={px} viewBox="0 0 120 120" aria-hidden>
      <ellipse cx="60" cy="110" rx="40" ry="6" fill="#a16207" opacity="0.35" />
      {stage === 0 ? (
        <>
          <ellipse cx="60" cy="104" rx="6" ry="4" fill="#92400e" />
          <path d="M60 102 q-2 -8 -8 -10 q6 0 8 6 q2 -8 9 -9 q-6 4 -7 13" fill="#22c55e" />
        </>
      ) : (
        <>
          <rect
            x={60 - 3 - stage}
            y={108 - trunk}
            width={6 + 2 * stage}
            height={trunk}
            rx="3"
            fill="#92400e"
          />
          <circle cx="60" cy={108 - trunk - crown * 0.6} r={crown} fill="#22c55e" />
          {stage >= 2 && (
            <circle cx={60 - crown * 0.7} cy={108 - trunk - crown * 0.2} r={crown * 0.7} fill="#16a34a" />
          )}
          {stage >= 2 && (
            <circle cx={60 + crown * 0.7} cy={108 - trunk - crown * 0.2} r={crown * 0.7} fill="#16a34a" />
          )}
          {Array.from({ length: fruit }, (_, i) => {
            const angle = (i / Math.max(1, fruit)) * Math.PI * 2;
            return (
              <circle
                key={i}
                cx={60 + Math.cos(angle) * crown * 0.75}
                cy={108 - trunk - crown * 0.4 + Math.sin(angle) * crown * 0.55}
                r="4.5"
                fill="#facc15"
                stroke="#ca8a04"
              />
            );
          })}
        </>
      )}
    </svg>
  );
}

/** A piggy bank. */
export function PiggyArt({ px = 64 }: { px?: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 64 64" aria-hidden>
      <ellipse cx="32" cy="36" rx="22" ry="16" fill="#f9a8d4" />
      <circle cx="52" cy="34" r="6" fill="#f472b6" />
      <circle cx="51" cy="33" r="1.2" fill="#831843" />
      <circle cx="54" cy="35" r="1.2" fill="#831843" />
      <path d="M20 22 l4 -8 l6 6 Z" fill="#f472b6" />
      <circle cx="40" cy="30" r="2" fill="#333" />
      <rect x="28" y="20" width="10" height="3" rx="1.5" fill="#831843" />
      <rect x="18" y="48" width="6" height="8" rx="2" fill="#f472b6" />
      <rect x="38" y="48" width="6" height="8" rx="2" fill="#f472b6" />
    </svg>
  );
}

/** A bank building. */
export function BankArt({ px = 64 }: { px?: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 64 64" aria-hidden>
      <path d="M8 24 L32 10 L56 24 Z" fill="#60a5fa" />
      {[14, 26, 38, 50].map((x) => (
        <rect key={x} x={x - 3} y="27" width="6" height="22" fill="#93c5fd" />
      ))}
      <rect x="8" y="50" width="48" height="6" fill="#3b82f6" />
      <circle cx="32" cy="19" r="3" fill="#facc15" />
    </svg>
  );
}
