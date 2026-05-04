/**
 * Schematic symbol registry — KiCad lib_id → SVG glyph + pin anchors.
 *
 * Symbols are drawn in the symbol's local frame centred on (0,0).
 * render.ts wraps each fragment in a <g transform=".."> to position it.
 *
 * Design conventions:
 *   - Stroke width 0.5mm (slightly heavier than V0, better at small sizes)
 *   - Pins project exactly 5mm from the body edge to wire endpoints
 *   - All symbols drawn in KiCad's default orientation (rot=0):
 *       2-pin passives: pins top (−y) and bottom (+y), body between ±3mm
 *       BJT: base left, collector top, emitter bottom
 *       MOSFET: gate left, drain top, source bottom
 *       Op-amp: inputs left (− upper, + lower), output right
 *       GND: pin enters from above at (0,0)
 *       Power rail: pin exits downward at (0,0)
 *
 * Symbol families covered:
 *   resistor, capacitor, capacitor_polarised, inductor, diode, led,
 *   zener, schottky, fuse, crystal, battery, switch, bjt_npn, bjt_pnp,
 *   mosfet_n, mosfet_p, opamp, comparator, voltage_ref, ldo, dcdc,
 *   gnd, power_rail, connector, ic, transformer, unknown
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PinAnchor {
  number: string;
  dx: number;
  dy: number;
}

export interface SymbolDraw {
  svg: string;
  pins: PinAnchor[];
  halfWidth: number;
  halfHeight: number;
  family: SymbolFamily;
}

export type SymbolFamily =
  | 'resistor'
  | 'capacitor'
  | 'capacitor_polarised'
  | 'inductor'
  | 'diode'
  | 'led'
  | 'zener'
  | 'schottky'
  | 'fuse'
  | 'crystal'
  | 'battery'
  | 'switch'
  | 'bjt_npn'
  | 'bjt_pnp'
  | 'mosfet_n'
  | 'mosfet_p'
  | 'opamp'
  | 'comparator'
  | 'voltage_ref'
  | 'ldo'
  | 'dcdc'
  | 'gnd'
  | 'power_rail'
  | 'connector'
  | 'ic'
  | 'transformer'
  | 'unknown';

export function drawSymbol(libId: string, value: string): SymbolDraw {
  const family = familyForLibId(libId, value);
  switch (family) {
    case 'resistor':          return drawResistor();
    case 'capacitor':         return drawCapacitor(false);
    case 'capacitor_polarised': return drawCapacitor(true);
    case 'inductor':          return drawInductor();
    case 'diode':             return drawDiode('diode');
    case 'led':               return drawDiode('led');
    case 'zener':             return drawDiode('zener');
    case 'schottky':          return drawDiode('schottky');
    case 'fuse':              return drawFuse();
    case 'crystal':           return drawCrystal();
    case 'battery':           return drawBattery();
    case 'switch':            return drawSwitch();
    case 'bjt_npn':           return drawBJT(true);
    case 'bjt_pnp':           return drawBJT(false);
    case 'mosfet_n':          return drawMOSFET(true);
    case 'mosfet_p':          return drawMOSFET(false);
    case 'opamp':             return drawOpAmp();
    case 'comparator':        return drawOpAmp(); // same shape
    case 'voltage_ref':       return drawIC();
    case 'ldo':               return drawIC();
    case 'dcdc':              return drawIC();
    case 'gnd':               return drawGround();
    case 'power_rail':        return drawPowerRail(value);
    case 'connector':         return drawConnector();
    case 'ic':                return drawIC();
    case 'transformer':       return drawTransformer();
    default:                  return drawUnknown();
  }
}

// No-connect marker (X) drawn at world coords by render.ts
export function noConnectSvg(x: number, y: number): string {
  const d = 1.4;
  return (
    `<line x1="${n(x - d)}" y1="${n(y - d)}" x2="${n(x + d)}" y2="${n(y + d)}" ` +
    `stroke="currentColor" stroke-width="0.5" stroke-linecap="round" opacity="0.55"/>` +
    `<line x1="${n(x + d)}" y1="${n(y - d)}" x2="${n(x - d)}" y2="${n(y + d)}" ` +
    `stroke="currentColor" stroke-width="0.5" stroke-linecap="round" opacity="0.55"/>`
  );
}

// ---------------------------------------------------------------------------
// Family resolution — case-insensitive prefix / exact matching
// ---------------------------------------------------------------------------

function familyForLibId(libId: string, value: string): SymbolFamily {
  const id = libId.toLowerCase();
  const v = value.trim().toUpperCase();

  // Power symbols -------------------------------------------------------
  if (id.startsWith('power:')) {
    if (v === 'GND' || v === 'GNDA' || v === 'GNDD' || v === 'EARTH' ||
        v === '0' || v === 'AGND' || v === 'PGND' || v === 'DGND' ||
        v === 'SGND' || v === 'CHASSIS' || v === 'PE') return 'gnd';
    return 'power_rail';
  }

  // Resistor ------------------------------------------------------------
  if (/^device:r(_small|_us|_small_us|_potentiometer|_pack\d*|_us_small)?$/.test(id) ||
      id === 'device:r_variable' || id === 'device:r_photo') {
    return 'resistor';
  }

  // Capacitor -----------------------------------------------------------
  if (id === 'device:c' || id === 'device:c_small' || id === 'device:c_us') {
    return 'capacitor';
  }
  if (id === 'device:cp' || id === 'device:cp_small' || id === 'device:c_polarized' ||
      id === 'device:c_polarized_us') {
    return 'capacitor_polarised';
  }

  // Inductor ------------------------------------------------------------
  if (/^device:l(_small|_core_iron|_core_ferrite|_coupled)?$/.test(id)) {
    return 'inductor';
  }

  // Diodes --------------------------------------------------------------
  if (id === 'device:d' || id === 'device:d_small') return 'diode';
  if (id === 'device:d_zener' || id === 'device:d_zener_small') return 'zener';
  if (id === 'device:d_schottky' || id === 'device:d_schottky_small') return 'schottky';
  if (id === 'device:led' || id === 'device:led_small' || id === 'device:led_alt' ||
      id.startsWith('device:led_rgb') || id === 'device:led_bidir') return 'led';
  if (id === 'device:d_tvs' || id === 'device:d_tvs_small') return 'zener'; // TVS shown as zener

  // Fuse ----------------------------------------------------------------
  if (id === 'device:fuse' || id === 'device:fuse_small' || id === 'device:polyfuse' ||
      id.startsWith('fuse:')) return 'fuse';

  // Crystal / resonator -------------------------------------------------
  if (id === 'device:crystal' || id === 'device:crystal_gnd' ||
      id === 'device:crystal_small' || id === 'device:resonator' ||
      id.startsWith('crystal:')) return 'crystal';

  // Battery -------------------------------------------------------------
  if (id === 'device:battery' || id === 'device:battery_cell' ||
      id.startsWith('battery:')) return 'battery';

  // Switch --------------------------------------------------------------
  if (id === 'device:sw_push' || id === 'device:sw_spdt' || id === 'device:sw_dpdt' ||
      id === 'device:sw_dpst' || id.startsWith('switch:')) return 'switch';

  // Transformer ---------------------------------------------------------
  if (id === 'device:transformer' || id.startsWith('transformer:')) return 'transformer';

  // Op-amp / amplifier --------------------------------------------------
  if (id.startsWith('amplifier_operational:') || id.startsWith('amplifier_audio:') ||
      id.startsWith('amplifier_instrumentation:')) return 'opamp';
  if (id.startsWith('comparator:')) return 'comparator';

  // Regulators ----------------------------------------------------------
  if (id.startsWith('regulator_linear:')) return 'ldo';
  if (id.startsWith('regulator_switching:')) return 'dcdc';

  // Voltage references --------------------------------------------------
  if (id.startsWith('reference_voltage:')) return 'voltage_ref';

  // MCU / logic / memory / sensor → generic IC -------------------------
  if (id.startsWith('mcu_') || id.startsWith('sensor:') || id.startsWith('sensor_') ||
      id.startsWith('interface_') || id.startsWith('memory_') ||
      id.startsWith('logic_') || id.startsWith('display:') ||
      id.startsWith('rf_module:') || id.startsWith('wireless:')) return 'ic';

  // BJTs ----------------------------------------------------------------
  if (id.startsWith('device:q_npn') || id.startsWith('transistor_bjt:bc') ||
      id.startsWith('transistor_bjt:2n') || id.startsWith('transistor_bjt:s8')) return 'bjt_npn';
  if (id.startsWith('device:q_pnp') || id.startsWith('transistor_bjt:bd13') ||
      id.startsWith('transistor_bjt:mje')) return 'bjt_pnp';

  // MOSFETs -------------------------------------------------------------
  if (id.startsWith('device:q_nmos') || id.startsWith('transistor_fet:irf') ||
      id.startsWith('transistor_fet:2n7') || id.startsWith('transistor_fet:bs170') ||
      id.startsWith('transistor_fet:ao') || id.startsWith('transistor_fet:si2')) return 'mosfet_n';
  if (id.startsWith('device:q_pmos') || id.startsWith('transistor_fet:bss') ||
      id.startsWith('transistor_fet:irf9') || id.startsWith('transistor_fet:dmg')) return 'mosfet_p';

  // Connectors ----------------------------------------------------------
  if (id.startsWith('connector:') || id.startsWith('connector_generic:')) return 'connector';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// 2-pin passives
// ---------------------------------------------------------------------------

function drawResistor(): SymbolDraw {
  // IEEE 315 US-style zigzag. Body: y = -3..+3, six peaks.
  const s: string[] = [];
  s.push(L(0, -5, 0, -3));
  s.push(L(0, 3, 0, 5));
  const pk = 1.25;
  const pts: [number, number][] = [
    [0, -3], [pk, -2.5], [-pk, -1.5], [pk, -0.5],
    [-pk, 0.5], [pk, 1.5], [-pk, 2.5], [0, 3],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    s.push(L(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1]));
  }
  return { svg: s.join(''), pins: [pin('1', 0, -5), pin('2', 0, 5)],
           halfWidth: 2, halfHeight: 5, family: 'resistor' };
}

function drawCapacitor(polarised: boolean): SymbolDraw {
  const s: string[] = [];
  const plateHW = 2.2;
  s.push(L(0, -5, 0, -0.7));
  s.push(L(0, 0.7, 0, 5));
  // Top plate (straight)
  s.push(L(-plateHW, -0.7, plateHW, -0.7));
  if (polarised) {
    // Bottom plate: curved arc (IEC style concave)
    s.push(
      `<path d="M ${n(-plateHW)} ${n(0.7)} Q 0 ${n(0.7 + 1.4)} ${n(plateHW)} ${n(0.7)}" ` +
      `fill="none" stroke="currentColor" stroke-width="0.5" stroke-linecap="round"/>`,
    );
    // "+" marker
    s.push(L(plateHW + 0.8, -1.6, plateHW + 1.6, -1.6));
    s.push(L(plateHW + 1.2, -2, plateHW + 1.2, -1.2));
  } else {
    s.push(L(-plateHW, 0.7, plateHW, 0.7));
  }
  return { svg: s.join(''), pins: [pin('1', 0, -5), pin('2', 0, 5)],
           halfWidth: polarised ? 3.5 : 2.5, halfHeight: 5, family: polarised ? 'capacitor_polarised' : 'capacitor' };
}

function drawInductor(): SymbolDraw {
  // 4 right-facing arcs (humps), r=0.8
  const s: string[] = [];
  s.push(L(0, -5, 0, -3.2));
  s.push(L(0, 3.2, 0, 5));
  const r = 0.8;
  for (let k = 0; k < 4; k++) {
    const cy = -3.2 + k * (2 * r) + r;
    s.push(
      `<path d="M 0 ${n(cy - r)} A ${r} ${r} 0 0 1 0 ${n(cy + r)}" ` +
      `fill="none" stroke="currentColor" stroke-width="0.5" stroke-linecap="round"/>`,
    );
  }
  return { svg: s.join(''), pins: [pin('1', 0, -5), pin('2', 0, 5)],
           halfWidth: 1.2, halfHeight: 5, family: 'inductor' };
}

type DiodeKind = 'diode' | 'led' | 'zener' | 'schottky';

function drawDiode(kind: DiodeKind): SymbolDraw {
  // Anode at top (pin A, dy=-5), cathode at bottom (pin K, dy=+5)
  const s: string[] = [];
  s.push(L(0, -5, 0, -2));
  s.push(L(0, 2, 0, 5));
  // Triangle: apex at bottom (+2), base at top (−2), width ±2
  s.push(
    `<polygon points="0,${n(2)} ${n(-2)},${n(-2)} ${n(2)},${n(-2)}" ` +
    `fill="none" stroke="currentColor" stroke-width="0.5"/>`,
  );
  // Cathode bar
  if (kind === 'zener') {
    // Zener: bent cathode bar
    s.push(L(-2.4, 2, -1.2, 2));
    s.push(L(-1.2, 2, 2, 2));
    s.push(L(2, 2, 2.4, 1.4));
  } else if (kind === 'schottky') {
    // Schottky: S-shaped cathode bar
    s.push(L(-2.4, 2, -2.4, 1.4));
    s.push(L(-2.4, 2, 2.4, 2));
    s.push(L(2.4, 2, 2.4, 2.6));
  } else {
    s.push(L(-2.4, 2, 2.4, 2));
  }
  if (kind === 'led') {
    // Two angled arrows emanating from body
    const arrow = (ox: number, oy: number) =>
      `<path d="M ${n(ox)} ${n(oy)} L ${n(ox + 1.8)} ${n(oy - 1.8)}" ` +
      `stroke="currentColor" stroke-width="0.4" stroke-linecap="round"/>` +
      `<path d="M ${n(ox + 1.8)} ${n(oy - 1.8)} L ${n(ox + 0.9)} ${n(oy - 1.8)} ` +
      `M ${n(ox + 1.8)} ${n(oy - 1.8)} L ${n(ox + 1.8)} ${n(oy - 0.9)}" ` +
      `stroke="currentColor" stroke-width="0.35" stroke-linecap="round"/>`;
    s.push(arrow(2.4, -0.2));
    s.push(arrow(2.4, 0.8));
  }
  return {
    svg: s.join(''), pins: [pin('A', 0, -5), pin('K', 0, 5)],
    halfWidth: kind === 'led' ? 4.5 : 2.6, halfHeight: 5,
    family: kind,
  };
}

function drawFuse(): SymbolDraw {
  const s: string[] = [];
  s.push(L(0, -5, 0, -2.2));
  s.push(L(0, 2.2, 0, 5));
  s.push(
    `<rect x="-1.1" y="-2.2" width="2.2" height="4.4" rx="0.4" ` +
    `fill="none" stroke="currentColor" stroke-width="0.5"/>`,
  );
  // Wavy fuse element
  s.push(
    `<path d="M 0 -2.2 C 0.9 -1.5 -0.9 -0.5 0 0 C 0.9 0.5 -0.9 1.5 0 2.2" ` +
    `fill="none" stroke="currentColor" stroke-width="0.5" stroke-linecap="round"/>`,
  );
  return { svg: s.join(''), pins: [pin('1', 0, -5), pin('2', 0, 5)],
           halfWidth: 1.5, halfHeight: 5, family: 'fuse' };
}

function drawCrystal(): SymbolDraw {
  // IEC style: two vertical bars flanking a rectangle
  const s: string[] = [];
  s.push(L(0, -5, 0, -2.5));
  s.push(L(0, 2.5, 0, 5));
  s.push(L(-1.8, -2.5, 1.8, -2.5));
  s.push(
    `<rect x="-0.9" y="-2" width="1.8" height="4" fill="none" stroke="currentColor" stroke-width="0.5"/>`,
  );
  s.push(L(-1.8, 2.5, 1.8, 2.5));
  return { svg: s.join(''), pins: [pin('1', 0, -5), pin('2', 0, 5)],
           halfWidth: 2, halfHeight: 5, family: 'crystal' };
}

function drawBattery(): SymbolDraw {
  // Two cells: alternating long-thin (−) and short-thick (+) plates
  const s: string[] = [];
  s.push(L(0, -5, 0, -2.6));
  s.push(L(0, 2.6, 0, 5));
  // Cell 1
  s.push(L(-2.4, -2.6, 2.4, -2.6));
  s.push(`<line x1="${n(-1.4)}" y1="-1.8" x2="${n(1.4)}" y2="-1.8" stroke="currentColor" stroke-width="0.9" stroke-linecap="round"/>`);
  // Cell 2
  s.push(L(-2.4, 1.0, 2.4, 1.0));
  s.push(`<line x1="${n(-1.4)}" y1="${n(1.8)}" x2="${n(1.4)}" y2="${n(1.8)}" stroke="currentColor" stroke-width="0.9" stroke-linecap="round"/>`);
  // + near top pin
  s.push(L(-0.7, -4.4, 0.7, -4.4));
  s.push(L(0, -5, 0, -3.8));
  return { svg: s.join(''), pins: [pin('1', 0, -5), pin('2', 0, 5)],
           halfWidth: 2.6, halfHeight: 5, family: 'battery' };
}

function drawSwitch(): SymbolDraw {
  const s: string[] = [];
  s.push(L(0, -5, 0, -1.8));
  s.push(L(0, 1.8, 0, 5));
  // Terminal dots
  s.push(`<circle cx="0" cy="${n(-1.8)}" r="0.4" fill="currentColor"/>`);
  s.push(`<circle cx="0" cy="${n(1.8)}" r="0.4" fill="currentColor"/>`);
  // Movable arm — slightly open
  s.push(L(0, -1.8, 1.4, -3.5));
  return { svg: s.join(''), pins: [pin('1', 0, -5), pin('2', 0, 5)],
           halfWidth: 2, halfHeight: 5, family: 'switch' };
}

// ---------------------------------------------------------------------------
// 3-pin actives — BJT
// ---------------------------------------------------------------------------

function drawBJT(npn: boolean): SymbolDraw {
  const s: string[] = [];
  s.push(`<circle cx="0" cy="0" r="4" fill="none" stroke="currentColor" stroke-width="0.5"/>`);
  // Base lead
  s.push(L(-5, 0, -1.6, 0));
  // Vertical junction bar
  s.push(L(-1.6, -2.2, -1.6, 2.2));
  // Collector slant
  s.push(L(-1.6, -1.2, 2.6, -3.2));
  s.push(L(2.6, -3.2, 2.6, -5));
  // Emitter slant
  s.push(L(-1.6, 1.2, 2.6, 3.2));
  s.push(L(2.6, 3.2, 2.6, 5));
  // Arrow on emitter
  s.push(arrowOnSeg(-1.6, 1.2, 2.6, 3.2, npn));
  return {
    svg: s.join(''),
    pins: [pin('B', -5, 0), pin('C', 2.6, -5), pin('E', 2.6, 5)],
    halfWidth: 5, halfHeight: 5,
    family: npn ? 'bjt_npn' : 'bjt_pnp',
  };
}

// ---------------------------------------------------------------------------
// 3-pin MOSFET
// ---------------------------------------------------------------------------

function drawMOSFET(nch: boolean): SymbolDraw {
  const s: string[] = [];
  s.push(`<circle cx="0" cy="0" r="4" fill="none" stroke="currentColor" stroke-width="0.5"/>`);
  // Gate lead + insulated bar
  s.push(L(-5, 0, -2.8, 0));
  s.push(L(-2.8, -2.2, -2.8, 2.2));
  // Gap (insulation — drawn as whitespace by not connecting gate bar to channel)
  // Three channel strokes (enhancement mode)
  s.push(L(-1.8, -2.2, -1.8, -0.8));
  s.push(L(-1.8, -0.3, -1.8, 0.3));
  s.push(L(-1.8, 0.8, -1.8, 2.2));
  // Drain leg
  s.push(L(-1.8, -1.8, 2.6, -1.8));
  s.push(L(2.6, -1.8, 2.6, -5));
  // Source leg
  s.push(L(-1.8, 1.8, 2.6, 1.8));
  s.push(L(2.6, 1.8, 2.6, 5));
  // Body arrow (G bar → channel)
  s.push(arrowOnSeg(-2.8, 0, -1.8, 0, nch));
  return {
    svg: s.join(''),
    pins: [pin('G', -5, 0), pin('D', 2.6, -5), pin('S', 2.6, 5)],
    halfWidth: 5, halfHeight: 5,
    family: nch ? 'mosfet_n' : 'mosfet_p',
  };
}

// ---------------------------------------------------------------------------
// Op-amp / comparator (5-pin triangle)
// ---------------------------------------------------------------------------

function drawOpAmp(): SymbolDraw {
  const s: string[] = [];
  // Triangle body
  s.push(
    `<polygon points="${n(-5)},${n(-4.5)} ${n(-5)},${n(4.5)} ${n(5.5)},0" ` +
    `fill="none" stroke="currentColor" stroke-width="0.5"/>`,
  );
  // Input pin stubs
  s.push(L(-8, -2.2, -5, -2.2));
  s.push(L(-8, 2.2, -5, 2.2));
  // Output stub
  s.push(L(5.5, 0, 8, 0));
  // Power supply stubs
  s.push(L(0, -2.5, 0, -5));
  s.push(L(0, 2.5, 0, 5));
  // − and + labels inside triangle
  s.push(L(-4.4, -2.2, -3.4, -2.2));            // minus
  s.push(L(-4.4, 2.2, -3.4, 2.2));              // plus H
  s.push(L(-3.9, 1.7, -3.9, 2.7));              // plus V
  return {
    svg: s.join(''),
    pins: [pin('-', -8, -2.2), pin('+', -8, 2.2), pin('OUT', 8, 0),
           pin('V+', 0, -5), pin('V-', 0, 5)],
    halfWidth: 8, halfHeight: 5,
    family: 'opamp',
  };
}

// ---------------------------------------------------------------------------
// Power: GND (KiCad 3-line style) and power rail flag
// ---------------------------------------------------------------------------

function drawGround(): SymbolDraw {
  // 3-line "comb" — most common KiCad GND style
  const s: string[] = [];
  s.push(L(0, -3, 0, 0));
  s.push(L(-3, 0, 3, 0));
  s.push(L(-2, 1.2, 2, 1.2));
  s.push(L(-1, 2.4, 1, 2.4));
  return {
    svg: s.join(''),
    pins: [pin('1', 0, -3)],
    halfWidth: 3, halfHeight: 3,
    family: 'gnd',
  };
}

function drawPowerRail(value: string): SymbolDraw {
  // KiCad-style power flag: vertical stub + horizontal bar at top
  const s: string[] = [];
  s.push(L(0, 0, 0, -3));
  s.push(L(-2, -3, 2, -3));
  s.push(
    `<text x="${n(2.6)}" y="${n(-2.4)}" font-size="2.6" font-weight="600" ` +
    `fill="currentColor" font-family="system-ui,-apple-system,sans-serif">${esc(value)}</text>`,
  );
  return {
    svg: s.join(''),
    pins: [pin('1', 0, 0)],
    halfWidth: Math.max(6, value.length * 1.8 + 3),
    halfHeight: 3,
    family: 'power_rail',
  };
}

// ---------------------------------------------------------------------------
// Connector
// ---------------------------------------------------------------------------

function drawConnector(): SymbolDraw {
  const s: string[] = [];
  s.push(`<rect x="-1.2" y="-3.2" width="6" height="6.4" rx="0.6" fill="none" stroke="currentColor" stroke-width="0.5"/>`);
  s.push(L(-5, -1.6, -1.2, -1.6));
  s.push(L(-5, 1.6, -1.2, 1.6));
  s.push(`<circle cx="-1.2" cy="-1.6" r="0.45" fill="currentColor"/>`);
  s.push(`<circle cx="-1.2" cy="1.6" r="0.45" fill="currentColor"/>`);
  return {
    svg: s.join(''),
    pins: [pin('1', -5, -1.6), pin('2', -5, 1.6)],
    halfWidth: 5, halfHeight: 3.5,
    family: 'connector',
  };
}

// ---------------------------------------------------------------------------
// Generic IC (rectangular body)
// ---------------------------------------------------------------------------

function drawIC(): SymbolDraw {
  const W = 16, H = 10;
  const s: string[] = [];
  s.push(
    `<rect x="${n(-W / 2)}" y="${n(-H / 2)}" width="${W}" height="${H}" rx="1" ry="1" ` +
    `fill="none" stroke="currentColor" stroke-width="0.5"/>`,
  );
  // Notch (pin-1 marker)
  s.push(
    `<path d="M ${n(-W / 2 + 1.5)} ${n(-H / 2)} A 1.5 1.5 0 0 1 ${n(-W / 2 + 4.5)} ${n(-H / 2)}" ` +
    `fill="none" stroke="currentColor" stroke-width="0.5"/>`,
  );
  for (const dy of [-2.5, 0, 2.5]) {
    s.push(L(-(W / 2 + 3), dy, -W / 2, dy));
    s.push(L(W / 2, dy, W / 2 + 3, dy));
  }
  return {
    svg: s.join(''),
    pins: [
      pin('1', -(W / 2 + 3), -2.5), pin('2', -(W / 2 + 3), 0),
      pin('3', -(W / 2 + 3), 2.5),  pin('4', W / 2 + 3, -2.5),
      pin('5', W / 2 + 3, 0),        pin('6', W / 2 + 3, 2.5),
    ],
    halfWidth: W / 2 + 3, halfHeight: H / 2,
    family: 'ic',
  };
}

// ---------------------------------------------------------------------------
// Transformer (two coupled inductors)
// ---------------------------------------------------------------------------

function drawTransformer(): SymbolDraw {
  const s: string[] = [];
  // Primary coil (left side, x = -2.5)
  s.push(L(-2.5, -5, -2.5, -3.2));
  for (let k = 0; k < 4; k++) {
    const cy = -3.2 + k * 1.6 + 0.8;
    s.push(
      `<path d="M -2.5 ${n(cy - 0.8)} A 0.8 0.8 0 0 0 -2.5 ${n(cy + 0.8)}" ` +
      `fill="none" stroke="currentColor" stroke-width="0.5"/>`,
    );
  }
  s.push(L(-2.5, 3.2, -2.5, 5));
  // Secondary coil (right side, x = +2.5)
  s.push(L(2.5, -5, 2.5, -3.2));
  for (let k = 0; k < 4; k++) {
    const cy = -3.2 + k * 1.6 + 0.8;
    s.push(
      `<path d="M 2.5 ${n(cy - 0.8)} A 0.8 0.8 0 0 1 2.5 ${n(cy + 0.8)}" ` +
      `fill="none" stroke="currentColor" stroke-width="0.5"/>`,
    );
  }
  s.push(L(2.5, 3.2, 2.5, 5));
  // Core lines (two vertical bars between coils)
  s.push(L(-0.6, -3.5, -0.6, 3.5));
  s.push(L(0.6, -3.5, 0.6, 3.5));
  return {
    svg: s.join(''),
    pins: [pin('P1', -2.5, -5), pin('P2', -2.5, 5), pin('S1', 2.5, -5), pin('S2', 2.5, 5)],
    halfWidth: 3, halfHeight: 5,
    family: 'transformer',
  };
}

// ---------------------------------------------------------------------------
// Unknown fallback
// ---------------------------------------------------------------------------

function drawUnknown(): SymbolDraw {
  const W = 14, H = 8;
  const s: string[] = [];
  s.push(
    `<rect x="${n(-W / 2)}" y="${n(-H / 2)}" width="${W}" height="${H}" rx="1" ry="1" ` +
    `fill="none" stroke="currentColor" stroke-width="0.5" stroke-dasharray="2 1.5"/>`,
  );
  s.push(L(-(W / 2 + 3), 0, -W / 2, 0));
  s.push(L(W / 2, 0, W / 2 + 3, 0));
  // ? mark
  s.push(
    `<text x="0" y="${n(H / 2 - 1.5)}" text-anchor="middle" font-size="3.5" ` +
    `font-family="system-ui" fill="currentColor" opacity="0.4">?</text>`,
  );
  return {
    svg: s.join(''),
    pins: [pin('1', -(W / 2 + 3), 0), pin('2', W / 2 + 3, 0)],
    halfWidth: W / 2 + 3, halfHeight: H / 2,
    family: 'unknown',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function L(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="currentColor" stroke-width="0.5" stroke-linecap="round"/>`;
}

function pin(number: string, dx: number, dy: number): PinAnchor {
  return { number, dx, dy };
}

function arrowOnSeg(
  x1: number, y1: number, x2: number, y2: number, forward: boolean,
): string {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const tx = x1 + dx * 0.6, ty = y1 + dy * 0.6;
  const sz = 1.4;
  const sx = forward ? ux : -ux, sy = forward ? uy : -uy;
  const c = -Math.sqrt(3) / 2, sn = 0.5;
  return (
    `<polygon points="${n(tx)},${n(ty)} ` +
    `${n(tx + (sx * c - sy * sn) * sz)},${n(ty + (sx * sn + sy * c) * sz)} ` +
    `${n(tx + (sx * c + sy * sn) * sz)},${n(ty + (-sx * sn + sy * c) * sz)}" ` +
    `fill="currentColor" stroke="none"/>`
  );
}

function n(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3).replace(/\.?0+$/, '');
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
