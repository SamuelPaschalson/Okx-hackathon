import { GENES, packBits, SENSORS, toHex, type Action } from '@lineage/core';

const DIRS = ['north', 'east', 'south', 'west'];

export const describeAction = (a: Action) => (a.kind === 'guard' ? 'raises its shell' : `moves ${DIRS[a.dir]}`);

/**
 * Shows one decision: the sensor bits in, the circuit's output bits out, and
 * the exact eval() call anyone can make on X Layer to reproduce it.
 */
export interface BrainScanProps {
  inputs: Uint8Array;
  outputs: Uint8Array;
  action: Action;
  tone: 'acid' | 'spark';
}

export function BrainScan({ inputs, outputs, action, tone }: BrainScanProps) {
  const lit = tone === 'acid' ? 'bg-acid text-bg' : 'bg-spark text-bg';
  return (
    <div className="space-y-2">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Senses</p>
        <div className="flex flex-wrap gap-1">
          {SENSORS.map((s, i) => (
            <span key={s} className={`rounded px-1.5 py-0.5 text-[10px] ${inputs[i] ? lit : 'bg-bg text-muted'}`}>
              {s}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Genes fire</p>
        <div className="flex gap-1">
          {GENES.map((g, i) => (
            <span key={g} className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${outputs[i] ? lit : 'bg-bg text-muted'}`}>
              {g}={outputs[i]}
            </span>
          ))}
        </div>
      </div>
      <p className="text-sm">
        → <span className="font-semibold">{describeAction(action)}</span>
      </p>
      <p className="break-all font-mono text-[10px] text-muted" title="Reproduce this decision on X Layer with a free view call">
        eval(id, {toHex(packBits(inputs))}) → {toHex(packBits(outputs))}
      </p>
    </div>
  );
}
