'use client';

import { useState, useTransition } from 'react';

interface SimResult {
  nodeVoltages: Record<string, number>;
  branchCurrents: Record<string, number>;
  converged: boolean;
  error?: string;
}

interface Props {
  circuitId: string;
}

export function SimPanel({ circuitId }: Props) {
  const [result, setResult] = useState<SimResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runSim() {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/sim/${circuitId}`, { method: 'POST' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          setError(body.error ?? `HTTP ${res.status}`);
          return;
        }
        const data = await res.json() as SimResult;
        setResult(data);
        if (!data.converged) setError(data.error ?? 'Simulation did not converge.');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Simulation failed.');
      }
    });
  }

  const netEntries = result ? Object.entries(result.nodeVoltages) : [];
  const currentEntries = result ? Object.entries(result.branchCurrents) : [];

  return (
    <section className="mt-8 rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            DC Simulator
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Modified Nodal Analysis · operating point
          </p>
        </div>
        <button
          onClick={runSim}
          disabled={pending}
          className={[
            'inline-flex h-8 items-center gap-1.5 rounded-md border border-border',
            'bg-background px-3 font-mono text-[11px] uppercase tracking-wider',
            'text-muted-foreground hover:border-foreground/30 hover:text-foreground',
            'disabled:opacity-50 transition-colors',
          ].join(' ')}
        >
          {pending ? (
            <>
              <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
              Running…
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 3l14 9-14 9V3z"/>
              </svg>
              Run .op
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 font-mono text-[11px] text-destructive">
          {error}
        </div>
      )}

      {result?.converged && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* Node voltages */}
          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Node voltages
            </div>
            <div className="space-y-1">
              {netEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground">No nodes (add power sources)</p>
              ) : (
                netEntries.map(([net, v]) => (
                  <div
                    key={net}
                    className="flex items-center justify-between rounded-sm px-2 py-1 hover:bg-muted/40"
                  >
                    <span className="font-mono text-xs text-foreground">{net}</span>
                    <span className="font-mono text-xs">
                      {formatVoltage(v)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Branch currents */}
          {currentEntries.length > 0 && (
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Branch currents
              </div>
              <div className="space-y-1">
                {currentEntries.map(([id, i]) => (
                  <div
                    key={id}
                    className="flex items-center justify-between rounded-sm px-2 py-1 hover:bg-muted/40"
                  >
                    <span className="font-mono text-xs text-foreground">{id}</span>
                    <span className="font-mono text-xs">
                      {formatCurrent(i)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!result && !error && (
        <p className="mt-3 text-[12px] text-muted-foreground">
          Extracts resistors and power rails from the schematic and solves for DC
          node voltages. Capacitors are open-circuit, inductors are short-circuit at DC.
        </p>
      )}

      <p className="mt-3 font-mono text-[10px] text-muted-foreground opacity-50">
        Linear DC only · ideal elements · verify with SPICE before fabrication
      </p>
    </section>
  );
}

function formatVoltage(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1) return `${v.toFixed(3)} V`;
  if (abs >= 1e-3) return `${(v * 1e3).toFixed(2)} mV`;
  return `${(v * 1e6).toFixed(1)} µV`;
}

function formatCurrent(i: number): string {
  const abs = Math.abs(i);
  if (abs >= 1) return `${i.toFixed(4)} A`;
  if (abs >= 1e-3) return `${(i * 1e3).toFixed(3)} mA`;
  if (abs >= 1e-6) return `${(i * 1e6).toFixed(2)} µA`;
  return `${(i * 1e9).toFixed(1)} nA`;
}
