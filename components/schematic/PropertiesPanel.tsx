'use client';

/**
 * PropertiesPanel — slides in from the right when a single component is selected.
 * Lets the user edit Designator, Value, MPN, and Footprint fields.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { EditorComponent } from './editorTypes';

export interface PropertiesPanelProps {
  component: EditorComponent | null;
  onUpdate: (id: string, changes: Partial<EditorComponent>) => void;
  onClose: () => void;
}

interface FieldRowProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  monospace?: boolean;
}

function FieldRow({ label, value, onChange, placeholder, monospace }: FieldRowProps) {
  const [draft, setDraft] = useState(value);

  // Sync draft when component changes
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft !== value) onChange(draft);
  };

  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Escape') {
            setDraft(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={[
          'w-full rounded border border-border bg-muted/40 px-2 py-1 text-xs text-foreground',
          'outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30',
          monospace ? 'font-mono' : '',
        ].join(' ')}
      />
    </div>
  );
}

export function PropertiesPanel({ component, onUpdate, onClose }: PropertiesPanelProps) {
  const visible = component !== null;

  // Keep a stable ref for the last known component so panel content doesn't
  // flash blank during the slide-out animation
  const lastCompRef = useRef<EditorComponent | null>(null);
  if (component) lastCompRef.current = component;
  const display = component ?? lastCompRef.current;

  const update = (field: keyof EditorComponent) => (v: string) => {
    if (!display) return;
    onUpdate(display.id, { [field]: v } as Partial<EditorComponent>);
  };

  return (
    <div
      aria-hidden={!visible}
      // pointer-events guard: when the panel is off-screen (translate-x-full)
      // it would still capture clicks because layout space isn't actually
      // 280px wide off the right edge in some browsers (sub-pixel rounding,
      // CSS containment quirks). Disable pointer events when not visible.
      className={[
        'absolute right-0 top-8 bottom-0 z-10 w-[280px]',
        'flex flex-col border-l border-border bg-background shadow-xl',
        'transition-transform duration-200 ease-in-out',
        visible ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-foreground">Properties</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close properties panel"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>

      {/* Fields */}
      {display && (
        <div className="flex flex-col gap-3 overflow-y-auto p-3">
          {/* Library ID (read-only context) */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Symbol
            </span>
            <span className="truncate rounded border border-border/50 bg-muted/20 px-2 py-1 font-mono text-[11px] text-muted-foreground">
              {display.libId}
            </span>
          </div>

          <FieldRow
            label="Designator"
            value={display.designator}
            onChange={update('designator')}
            placeholder="R1"
            monospace
          />

          <FieldRow
            label="Value"
            value={display.value}
            onChange={update('value')}
            placeholder="10k"
            monospace
          />

          <FieldRow
            label="MPN"
            value={display.mpn ?? ''}
            onChange={update('mpn')}
            placeholder="LCSC / MPN…"
            monospace
          />

          <FieldRow
            label="Footprint"
            value={display.footprint ?? ''}
            onChange={update('footprint')}
            placeholder="Package_TO_SOT_SMD:SOT-23"
          />

          {/* Position readout */}
          <div className="mt-1 border-t border-border/50 pt-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Position
            </span>
            <div className="mt-1 flex gap-2 font-mono text-[11px] text-muted-foreground">
              <span>X: {display.x.toFixed(2)} mm</span>
              <span>Y: {display.y.toFixed(2)} mm</span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              Rot: {display.rot}&deg; &nbsp; Mirror: {display.mirror}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
