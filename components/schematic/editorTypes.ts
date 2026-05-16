// Shared types for the interactive schematic editor.
// Extended v2: undo/redo, multi-select, no-connect, text annotations, power symbols.

import type { LibShape } from '@/lib/kicad/parse';

export type EditorMode = 'select' | 'wire' | 'place' | 'text' | 'no_connect';
export type PlaceKind = 'resistor' | 'capacitor' | 'inductor' | 'diode' | 'led'
  | 'npn' | 'pnp' | 'nmos' | 'pmos' | 'opamp' | 'switch' | 'crystal' | 'fuse'
  | 'power' | 'gnd' | 'label';

/**
 * Pin geometry copied from the KiCad lib_symbol block (local lib_symbol frame,
 * NOT world coords). When present on an EditorComponent these override the
 * generic-glyph pin positions, so wires snap to the right place for parts
 * the generic-glyph catalog doesn't know about (e.g. BSS138 MOSFETs).
 */
export interface EditorPinLocal {
  number: string;
  x: number;
  y: number;
  /**
   * KiCad pin direction in lib_symbol local frame. CCW degrees; specifies
   * which way the pin LINE extends from the connection point toward the
   * symbol body. 0=right, 90=up, 180=left, 270=down. Required for drawing
   * the pin stub line between the connection point and the body — without
   * it, wires appear visually disconnected from the symbol.
   */
  rot?: number;
  /** Pin stub length in mm (lib_symbol local frame). */
  length?: number;
}

/**
 * Property label position copied straight from the KiCad symbol instance —
 * world coords, world rotation. KiCad authors place these explicitly (and
 * autoplaced ones still end up in the file) so reproducing the file's
 * positions is the only way the preview can match KiCad pixel-for-pixel.
 *
 * `rot` is KiCad's text rotation in degrees CCW. KiCad keeps text upright
 * by convention — 180 means the text is anchored on the opposite side, NOT
 * that it should be drawn upside-down.
 */
export interface EditorPropertyLabel {
  name: string;   // "Reference", "Value", "Footprint", …
  text: string;
  x: number;
  y: number;
  rot: number;
  hide: boolean;
}

export interface EditorComponent {
  id: string;
  libId: string;
  designator: string;
  value: string;
  x: number;  // mm — the KiCad instance anchor (lib_symbol local origin in world)
  y: number;
  rot: number; // degrees 0|90|180|270
  mirror: 'none' | 'x' | 'y';
  // Optional extra properties
  footprint?: string;
  datasheet?: string;
  mpn?: string;
  // Draggable label offsets (mm relative to component centre)
  designatorOffset?: { x: number; y: number };
  valueOffset?: { x: number; y: number };
  /**
   * Embedded body geometry copied from the uploaded KiCad file's
   * (lib_symbols …) block. When present, the editor renders these shapes
   * at the instance anchor with `rot` + `mirror` applied — matching what
   * KiCad itself draws. Falls back to the generic glyph otherwise.
   */
  embeddedShapes?: LibShape[];
  /** Pin geometry in lib_symbol local coords; overrides generic glyph pins. */
  pinsLocal?: EditorPinLocal[];
  /** True for power symbols (KiCad `(power)` flag); turns off labels and uses red stroke. */
  isPower?: boolean;
  /**
   * Property text positions/visibility from the source .kicad_sch. When
   * present, the editor renders designator/value at these exact world
   * coords instead of computing them from the symbol bounding box.
   */
  properties?: EditorPropertyLabel[];
}

export interface EditorWire {
  id: string;
  x1: number; y1: number;
  x2: number; y2: number;
}

export interface EditorJunction {
  id: string;
  x: number; y: number;
}

export interface EditorLabel {
  id: string;
  text: string;
  x: number; y: number;
  rot: number;
  kind: 'local' | 'global' | 'power';
}

export interface EditorNoConnect {
  id: string;
  x: number; y: number;
}

export interface EditorText {
  id: string;
  text: string;
  x: number; y: number;
  fontSize: number; // mm
  bold: boolean;
  italic: boolean;
}

export interface EditorState {
  components: EditorComponent[];
  wires: EditorWire[];
  junctions: EditorJunction[];
  labels: EditorLabel[];
  noConnects: EditorNoConnect[];
  texts: EditorText[];
}

export const EMPTY_STATE: EditorState = {
  components: [], wires: [], junctions: [], labels: [], noConnects: [], texts: [],
};

export interface Point { x: number; y: number }

export interface Rect { x: number; y: number; w: number; h: number }

export interface Viewport {
  panX: number;  // screen px offset
  panY: number;
  scale: number; // screen px per mm
}

// Clipboard entry for copy/paste
export interface Clipboard {
  components: EditorComponent[];
  wires: EditorWire[];
  labels: EditorLabel[];
  texts: EditorText[];
}

// History for undo/redo
export interface EditorHistory {
  past: EditorState[];   // previous states (oldest first)
  future: EditorState[]; // states after current (for redo)
}

// -------------------------------------------------------------------------
// Symbol palette — extended with all common types
// -------------------------------------------------------------------------

export interface PaletteEntry {
  kind: PlaceKind;
  label: string;
  libId: string;
  defaultValue: string;
  defaultDesignatorPrefix: string;
}

export const PALETTE: PaletteEntry[] = [
  // Passives
  { kind: 'resistor',  label: 'R',      libId: 'Device:R',            defaultValue: '10k',    defaultDesignatorPrefix: 'R' },
  { kind: 'capacitor', label: 'C',      libId: 'Device:C',            defaultValue: '100n',   defaultDesignatorPrefix: 'C' },
  { kind: 'inductor',  label: 'L',      libId: 'Device:L',            defaultValue: '10u',    defaultDesignatorPrefix: 'L' },
  // Semiconductors
  { kind: 'diode',     label: 'D',      libId: 'Device:D',            defaultValue: '1N4148', defaultDesignatorPrefix: 'D' },
  { kind: 'led',       label: 'LED',    libId: 'Device:LED',          defaultValue: 'LED',    defaultDesignatorPrefix: 'D' },
  { kind: 'npn',       label: 'NPN',    libId: 'Device:Q_NPN_BCE',    defaultValue: '2N3904', defaultDesignatorPrefix: 'Q' },
  { kind: 'pnp',       label: 'PNP',    libId: 'Device:Q_PNP_BCE',    defaultValue: '2N3906', defaultDesignatorPrefix: 'Q' },
  { kind: 'nmos',      label: 'NMOS',   libId: 'Device:Q_NMOS_GSD',   defaultValue: '2N7002', defaultDesignatorPrefix: 'Q' },
  { kind: 'pmos',      label: 'PMOS',   libId: 'Device:Q_PMOS_GSD',   defaultValue: 'BS250',  defaultDesignatorPrefix: 'Q' },
  { kind: 'opamp',     label: 'OpAmp',  libId: 'Amplifier_Operational:LM358', defaultValue: 'LM358', defaultDesignatorPrefix: 'U' },
  // Passives misc
  { kind: 'switch',    label: 'SW',     libId: 'Device:SW_Push',      defaultValue: 'SW',     defaultDesignatorPrefix: 'SW' },
  { kind: 'crystal',   label: 'XTAL',   libId: 'Device:Crystal',      defaultValue: '8MHz',   defaultDesignatorPrefix: 'Y' },
  { kind: 'fuse',      label: 'F',      libId: 'Device:Fuse',         defaultValue: '1A',     defaultDesignatorPrefix: 'F' },
  // Power
  { kind: 'power',     label: '+V',     libId: 'power:+5V',           defaultValue: '+5V',    defaultDesignatorPrefix: '#PWR' },
  { kind: 'gnd',       label: 'GND',    libId: 'power:GND',           defaultValue: 'GND',    defaultDesignatorPrefix: '#PWR' },
  // Net label (special — not a component)
  { kind: 'label',     label: 'Net',    libId: '',                    defaultValue: 'NET',    defaultDesignatorPrefix: '' },
];

export const DESIGNATOR_PREFIX: Record<PlaceKind, string> = Object.fromEntries(
  PALETTE.map((p) => [p.kind, p.defaultDesignatorPrefix]),
) as Record<PlaceKind, string>;

// Power symbol variants for the power palette
export const POWER_SYMBOLS = [
  { libId: 'power:GND',   value: 'GND',   label: 'GND' },
  { libId: 'power:+3.3V', value: '+3.3V', label: '+3.3V' },
  { libId: 'power:+5V',   value: '+5V',   label: '+5V' },
  { libId: 'power:+12V',  value: '+12V',  label: '+12V' },
  { libId: 'power:-12V',  value: '-12V',  label: '-12V' },
  { libId: 'power:VCC',   value: 'VCC',   label: 'VCC' },
  { libId: 'power:VDD',   value: 'VDD',   label: 'VDD' },
  { libId: 'power:VBUS',  value: 'VBUS',  label: 'VBUS' },
  { libId: 'power:VBAT',  value: 'VBAT',  label: 'VBAT' },
];
