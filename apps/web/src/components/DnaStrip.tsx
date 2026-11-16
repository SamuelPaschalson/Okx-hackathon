import { GATE_BASE, N_OUT, SENSORS, type Gate } from '@lineage/core';

/**
 * One bar per NAND gate, in netlist order: the creature's literal DNA.
 * Sensor-reading gates are tinted by the sensor they read; the final three
 * bars are the output genes (Stride, Bearing, Shell).
 */
export function DnaStrip({ gates, className = '' }: { gates: readonly Gate[]; className?: string }) {
  const outputStart = gates.length - N_OUT;
  return (
    <div className={`flex h-6 items-end gap-px ${className}`} aria-label={`${gates.length} NAND gates`}>
      {gates.map((g, i) => {
        const isOutput = i >= outputStart;
        const sensor = [g.a, g.b].find((s) => s >= 2 && s < GATE_BASE);
        const color = isOutput
          ? 'var(--color-acid)'
          : sensor !== undefined
            ? `hsl(${((sensor - 2) * 360) / SENSORS.length} 70% 60%)`
            : 'var(--color-line)';
        const height = isOutput ? 100 : sensor !== undefined ? 75 : 50;
        return (
          <span
            key={i}
            className="w-1.5 min-w-[3px] flex-1 rounded-sm"
            style={{ background: color, height: `${height}%`, maxWidth: 8 }}
            title={`gate ${i}: NAND(${label(g.a)}, ${label(g.b)})`}
          />
        );
      })}
    </div>
  );
}

function label(s: number): string {
  if (s === 0) return '0';
  if (s === 1) return '1';
  if (s < GATE_BASE) return SENSORS[s - 2];
  return `g${s - GATE_BASE}`;
}
