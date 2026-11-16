import { identityOf, type Gate } from '@lineage/core';

const BODIES = [
  // round
  'M32 8c13 0 24 10 24 25s-10 24-24 24S8 48 8 33 19 8 32 8z',
  // squat
  'M14 18c5-7 31-7 36 0 6 8 6 26 0 34-5 6-31 6-36 0-6-8-6-26 0-34z',
  // tall drop
  'M32 5c9 12 22 22 22 35 0 11-10 19-22 19S10 51 10 40C10 27 23 17 32 5z',
  // spiky
  'M32 6l7 9 11-3-1 11 9 7-9 7 1 11-11-3-7 9-7-9-11 3 1-11-9-7 9-7-1-11 11 3z',
];

interface Props {
  gates: readonly Gate[];
  size?: number;
  /** Gentle idle animation. */
  alive?: boolean;
  className?: string;
}

/**
 * Procedural portrait derived from the genome bytes. The "veins" are drawn
 * from the creature's first gates, so siblings look related but distinct.
 */
export function CreatureAvatar({ gates, size = 64, alive = false, className = '' }: Props) {
  const id = identityOf(gates);
  const body = `hsl(${id.hue} 70% 62%)`;
  const shade = `hsl(${id.hue} 55% 38%)`;
  const accent = `hsl(${id.accentHue} 85% 70%)`;
  const veins = gates.slice(0, 6).map((g, i) => {
    const x1 = 20 + ((g.a * 7) % 24);
    const x2 = 20 + ((g.b * 11) % 24);
    return <path key={i} d={`M${x1} ${44 - i * 2}Q32 ${50 + (i % 3) * 2} ${x2} ${40 + i}`} stroke={accent} strokeWidth="1.2" fill="none" opacity="0.7" />;
  });

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={`${id.name}, a ${gates.length}-gate creature`}
      className={`${alive ? 'animate-wobble' : ''} ${className}`}
    >
      <ellipse cx="32" cy="59" rx="16" ry="3" fill="#000" opacity="0.35" />
      <path d={BODIES[id.shape]} fill={body} stroke={shade} strokeWidth="2" />
      {veins}
      <circle cx="25" cy="28" r="5" fill="#0b0f0c" />
      <circle cx="39" cy="28" r="5" fill="#0b0f0c" />
      <circle cx="26.5" cy="26.5" r="1.6" fill="#fff" />
      <circle cx="40.5" cy="26.5" r="1.6" fill="#fff" />
      <circle cx="32" cy="16" r="2.5" fill={accent} />
    </svg>
  );
}
