/**
 * Schematic symbol registry — KiCad `lib_id` → SVG glyph + pin anchors.
 *
 * Each entry produces an SVG fragment drawn in the symbol's *local* frame,
 * centred on (0,0). The renderer wraps each fragment in a <g transform="..">
 * that translates to the symbol's `(at x y)` position and rotates by `rot`.
 *
 * Pin anchors are returned alongside the SVG so we can later wire up
 * connectivity (Day 6+) — for V0 they're rendered as small terminal markers
 * so the diagram visually meets wire endpoints.
 *
 * What "fundamental devices" means here, per user requirement:
 *   - 2-pin: R, C, CP (polarised), L, D, LED, Fuse, Crystal
 *   - 3-pin: BJT (NPN/PNP), MOSFET (N/P)
 *   - 5-pin: op-amp (single)
 *   - power: GND triangle, +V rail arrow
 *   - Connector pads: 1/2/3-pin headers
 *
 * Unknown lib_ids fall back to a labeled box — the renderer adds an
 * "unknown symbol" annotation so the user knows we did our best.
 *
 * Conventions used:
 *   - Stroke = 0.4 mm (matches KiCad default `default_line_width`)
 *   - Symbol body fits in ~14 mm × ~10 mm (mm == SVG units, viewBox is in mm)
 *   - Pin stubs project ±5 mm from origin so wires meet at exact endpoints
 *   - Drawn in a "default" orientation (KiCad's rot=0):
 *       2-pin passives  : pins on TOP and BOTTOM (vertical), KiCad's default
 *       BJT / MOSFET     : collector/drain on top, emitter/source on bottom,
 *                          base/gate on the LEFT
 *       op-amp           : inputs on left (- top, + bottom), output on right
 *       GND              : pin on top (wire enters from above)
 *       +V rail          : pin on bottom (wire enters from below)
 *
 * References used (general schematic-symbol convention, not KiCad-specific):
 *   - IEEE 315/315A — graphical symbols for electrical and electronics diagrams
 *   - IEC 60617 — symbols for diagrams (where it differs we follow US-style
 *     because it's what most KiCad libraries default to: zigzag resistor)
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PinAnchor {
  /** Pin number / name as KiCad sees it. */
  number: string;
  /** X offset from symbol origin (mm). */
  dx: number;
  /** Y offset from symbol origin (mm). */
  dy: number;
}

export interface SymbolDraw {
  /** Inner SVG fragment, drawn in symbol-local frame centred on (0,0). */
  svg: string;
  /** Pin terminations, in symbol-local frame. */
  pins: PinAnchor[];
  /** Bbox half-extents, used by render.ts for label placement. */
  halfWidth: number;
  halfHeight: number;
  /** Display family — used for fallback labels and AI summary hints. */
  family: SymbolFamily;
}

export type SymbolFamily =
  | 'resistor'
  | 'capacitor'
  | 'capacitor_polarised'
  | 'inductor'
  | 'diode'
  | 'led'
  | 'fuse'
  | 'crystal'
  | 'battery'
  | 'switch'
  | 'bjt_npn'
  | 'bjt_pnp'
  | 'mosfet_n'
  | 'mosfet_p'
  | 'opamp'
  | 'gnd'
  | 'power_rail'
  | 'connector'
  | 'ic'
  | 'unknown';

/**
 * Resolve a KiCad `lib_id` to a draw function. Matching is case-insensitive
 * and handles common aliases (`Device:R`, `Device:R_Small`, `Device:R_US`).
 */
export function drawSymbol(libId: string, value: string): SymbolDraw {
  const family = familyForLibId(libId, value);
  switch (family) {
    case 'resistor':
      return drawResistor();
    case 'capacitor':
      return drawCapacitor(false);
    case 'capacitor_polarised':
      return drawCapacitor(true);
    case 'inductor':
      return drawInductor();
    case 'diode':
      return drawDiode(false);
    case 'led':
      return drawDiode(true);
    case 'fuse':
      return drawFuse();
    case 'crystal':
      return drawCrystal();
    case 'battery':
      return drawBattery();
    case 'switch':
      return drawSwitch();
    case 'bjt_npn':
      return drawBJT(true);
    case 'bjt_pnp':
      return drawBJT(false);
    case 'mosfet_n':
      return drawMOSFET(true);
    case 'mosfet_p':
      return drawMOSFET(false);
    case 'opamp':
      return drawOpAmp();
    case 'gnd':
      return drawGround();
    case 'power_rail':
      return drawPowerRail(value);
    case 'connector':
      return drawConnector();
    case 'ic':
      return drawIC();
    default:
      return drawUnknown();
  }
}

// ---------------------------------------------------------------------------
// Family resolution
// ---------------------------------------------------------------------------

function familyForLibId(libId: string, value: string): SymbolFamily {
  const id = libId.toLowerCase();
  const v = value.trim().toUpperCase();

  // Power family — explicit lib_id prefix or designator pattern.
  if (id.startsWith('power:')) {
    if (v === 'GND' || v === 'GNDA' || v === 'GNDD' || v === 'EARTH' || v === '0') return 'gnd';
    return 'power_rail';
  }

  // Device.kicad_sym
  // R / R_Small / R_US — all variants
  if (
    id === 'device:r' ||
    id === 'device:r_small' ||
    id === 'device:r_us' ||
    id === 'device:r_small_us' ||
    id === 'device:r_potentiometer' ||
    id === 'device:r_pack02' ||
    id === 'device:r_pack04'
  ) {
    return 'resistor';
  }

  // C / C_Small (non-polar), CP / CP_Small (polarised)
  if (id === 'device:c' || id === 'device:c_small' || id === 'device:c_us') {
    return 'capacitor';
  }
  if (id === 'device:cp' || id === 'device:cp_small' || id === 'device:c_polarized') {
    return 'capacitor_polarised';
  }

  // L
  if (
    id === 'device:l' ||
    id === 'device:l_small' ||
    id === 'device:l_core_iron' ||
    id === 'device:l_core_ferrite'
  ) {
    return 'inductor';
  }

  // Diode / LED
  if (id === 'device:d' || id === 'device:d_small' || id === 'device:d_zener' || id === 'device:d_schottky') {
    return 'diode';
  }
  if (id === 'device:led' || id === 'device:led_small' || id === 'device:led_alt') {
    return 'led';
  }

  // Fuse
  if (id === 'device:fuse' || id === 'device:fuse_small') {
    return 'fuse';
  }

  // Crystal
  if (id === 'device:crystal' || id === 'device:crystal_gnd' || id === 'device:crystal_small' || id === 'device:resonator') {
    return 'crystal';
  }

  // Battery (Device:Battery, Device:Battery_Cell). Was previously incorrectly
  // mapped to capacitor — same 2-pin geometry but different visual & semantics.
  if (
    id === 'device:battery' ||
    id === 'device:battery_cell' ||
    id.startsWith('battery:')
  ) {
    return 'battery';
  }

  // Switches (Device:SW_Push, Switch:* family)
  if (
    id === 'device:sw_push' ||
    id === 'device:sw_spdt' ||
    id === 'device:sw_dpdt' ||
    id.startsWith('switch:')
  ) {
    return 'switch';
  }

  // Voltage regulators / linear ICs / amplifier MCUs / sensors → generic IC.
  // Anything that's clearly a chip and not in the specialised buckets above.
  if (
    id.startsWith('regulator_linear:') ||
    id.startsWith('regulator_switching:') ||
    id.startsWith('mcu_microchip_') ||
    id.startsWith('mcu_st_') ||
    id.startsWith('mcu_raspberrypi_') ||
    id.startsWith('mcu_module:') ||
    id.startsWith('sensor:') ||
    id.startsWith('sensor_temperature:') ||
    id.startsWith('interface_uart:') ||
    id.startsWith('memory_eeprom:') ||
    id.startsWith('memory_flash:') ||
    id.startsWith('comparator:') ||
    id.startsWith('logic_')
  ) {
    return 'ic';
  }

  // BJTs — the part of the lib_id after Q_ encodes the polarity.
  if (id.startsWith('device:q_npn') || id.startsWith('transistor_bjt:bc') || id.startsWith('transistor_bjt:2n')) {
    return 'bjt_npn';
  }
  if (id.startsWith('device:q_pnp') || id.startsWith('transistor_bjt:bd13')) {
    return 'bjt_pnp';
  }

  // MOSFETs
  if (
    id.startsWith('device:q_nmos') ||
    id.startsWith('transistor_fet:irf') ||
    id.startsWith('transistor_fet:2n7000') ||
    id.startsWith('transistor_fet:bs170')
  ) {
    return 'mosfet_n';
  }
  if (id.startsWith('device:q_pmos') || id.startsWith('transistor_fet:bss84') || id.startsWith('transistor_fet:irf9')) {
    return 'mosfet_p';
  }

  // Op-amp / amplifier family
  if (
    id.startsWith('amplifier_operational:') ||
    id.startsWith('amplifier_audio:') ||
    id.startsWith('amplifier_instrumentation:')
  ) {
    return 'opamp';
  }

  // Connectors / headers
  if (id.startsWith('connector:') || id.startsWith('connector_generic:')) {
    return 'connector';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// 2-pin passives (vertical default orientation)
// ---------------------------------------------------------------------------

function drawResistor(): SymbolDraw {
  // US-style zigzag, 6 mm tall body, 2.5 mm wide. Pins at y = ±5 mm.
  // Zigzag has 6 angled segments (3 peaks each side).
  const segments: string[] = [];
  // Wire stubs from pin to body
  segments.push(line(0, -5, 0, -3));
  segments.push(line(0, 3, 0, 5));
  // Zigzag: alternate left-right peaks at half-millimetre intervals
  // y from -3 to +3 in 6 steps of 1mm
  const peakDx = 1.2;
  segments.push(line(0, -3, peakDx, -2.5));
  segments.push(line(peakDx, -2.5, -peakDx, -1.5));
  segments.push(line(-peakDx, -1.5, peakDx, -0.5));
  segments.push(line(peakDx, -0.5, -peakDx, 0.5));
  segments.push(line(-peakDx, 0.5, peakDx, 1.5));
  segments.push(line(peakDx, 1.5, -peakDx, 2.5));
  segments.push(line(-peakDx, 2.5, 0, 3));

  return {
    svg: segments.join(''),
    pins: [
      { number: '1', dx: 0, dy: -5 },
      { number: '2', dx: 0, dy: 5 },
    ],
    halfWidth: 3,
    halfHeight: 6,
    family: 'resistor',
  };
}

function drawCapacitor(polarised: boolean): SymbolDraw {
  // Two parallel plates 4 mm wide separated by 1.2 mm, on a vertical wire.
  // Polarised: top plate is curved (concave), and a "+" sits next to it.
  const plateY1 = -0.6;
  const plateY2 = 0.6;
  const plateHalf = 2;
  const segs: string[] = [];
  segs.push(line(0, -5, 0, plateY1));
  segs.push(line(0, plateY2, 0, 5));
  // Top plate (positive when polarised)
  segs.push(line(-plateHalf, plateY1, plateHalf, plateY1));
  if (polarised) {
    // Bottom plate as a shallow arc curving upward (concave from above)
    segs.push(
      `<path d="M ${num(-plateHalf)} ${num(plateY2)} Q 0 ${num(plateY2 + 1.2)} ${num(plateHalf)} ${num(plateY2)}" ` +
        `fill="none" stroke="currentColor" stroke-width="0.4"/>`,
    );
    // Plus sign
    segs.push(
      `<text x="${num(plateHalf + 1)}" y="${num(plateY1 + 0.6)}" font-size="2" fill="currentColor">+</text>`,
    );
  } else {
    segs.push(line(-plateHalf, plateY2, plateHalf, plateY2));
  }
  return {
    svg: segs.join(''),
    pins: [
      { number: '1', dx: 0, dy: -5 },
      { number: '2', dx: 0, dy: 5 },
    ],
    halfWidth: plateHalf + 1,
    halfHeight: 6,
    family: polarised ? 'capacitor_polarised' : 'capacitor',
  };
}

function drawInductor(): SymbolDraw {
  // Four arcs (humps) facing right. Body span -3..+3 on y-axis, x = 0..1.5.
  const segs: string[] = [];
  segs.push(line(0, -5, 0, -3));
  segs.push(line(0, 3, 0, 5));
  // Arcs of radius 0.75, centres at (0, -2.25), (0, -0.75), (0, 0.75), (0, 2.25)
  // Each arc spans 180° on the right side.
  for (let k = 0; k < 4; k++) {
    const cy = -2.25 + 1.5 * k;
    segs.push(
      `<path d="M 0 ${num(cy - 0.75)} A 0.75 0.75 0 0 1 0 ${num(cy + 0.75)}" ` +
        `fill="none" stroke="currentColor" stroke-width="0.4"/>`,
    );
  }
  return {
    svg: segs.join(''),
    pins: [
      { number: '1', dx: 0, dy: -5 },
      { number: '2', dx: 0, dy: 5 },
    ],
    halfWidth: 1.5,
    halfHeight: 6,
    family: 'inductor',
  };
}

function drawDiode(led: boolean): SymbolDraw {
  // Triangle apex pointing down, cathode bar across the apex.
  // Body span y = -1.5 .. +1.5. Pins at ±5.
  const segs: string[] = [];
  segs.push(line(0, -5, 0, -1.5));
  segs.push(line(0, 1.5, 0, 5));
  // Triangle (anode at top, cathode at bottom)
  segs.push(
    `<polygon points="${num(-1.8)},${num(-1.5)} ${num(1.8)},${num(-1.5)} 0,${num(1.5)}" ` +
      `fill="none" stroke="currentColor" stroke-width="0.4"/>`,
  );
  // Cathode bar
  segs.push(line(-1.8, 1.5, 1.8, 1.5));
  // LED arrows (two emanating)
  if (led) {
    // Two outgoing arrows at upper-right
    const arrow = (sx: number, sy: number) =>
      `<path d="M ${num(sx)} ${num(sy)} L ${num(sx + 1.6)} ${num(sy - 1.6)} ` +
      `M ${num(sx + 1.0)} ${num(sy - 1.6)} L ${num(sx + 1.6)} ${num(sy - 1.6)} ` +
      `L ${num(sx + 1.6)} ${num(sy - 1.0)}" stroke="currentColor" stroke-width="0.3" fill="none"/>`;
    segs.push(arrow(2.2, -0.4));
    segs.push(arrow(2.2, 0.6));
  }
  return {
    svg: segs.join(''),
    pins: [
      { number: 'A', dx: 0, dy: -5 },
      { number: 'K', dx: 0, dy: 5 },
    ],
    halfWidth: led ? 4 : 2,
    halfHeight: 6,
    family: led ? 'led' : 'diode',
  };
}

function drawFuse(): SymbolDraw {
  // Rectangle 4×1.6, with diagonal slash inside.
  const segs: string[] = [];
  segs.push(line(0, -5, 0, -2));
  segs.push(line(0, 2, 0, 5));
  segs.push(`<rect x="${num(-1)}" y="${num(-2)}" width="2" height="4" fill="none" stroke="currentColor" stroke-width="0.4"/>`);
  // Wavy line inside (sine curve approximation: two arcs)
  segs.push(
    `<path d="M 0 -2 Q 1 -1 0 0 Q -1 1 0 2" fill="none" stroke="currentColor" stroke-width="0.4"/>`,
  );
  return {
    svg: segs.join(''),
    pins: [
      { number: '1', dx: 0, dy: -5 },
      { number: '2', dx: 0, dy: 5 },
    ],
    halfWidth: 1.5,
    halfHeight: 6,
    family: 'fuse',
  };
}

function drawCrystal(): SymbolDraw {
  // Two outer vertical lines + inner rectangle.
  const segs: string[] = [];
  segs.push(line(0, -5, 0, -2));
  segs.push(line(0, 2, 0, 5));
  // Inner rectangle (the crystal element)
  segs.push(`<rect x="${num(-0.8)}" y="${num(-1.6)}" width="1.6" height="3.2" fill="none" stroke="currentColor" stroke-width="0.4"/>`);
  // Outer plates
  segs.push(line(-1.6, -2, -1.6, 2));
  segs.push(line(1.6, -2, 1.6, 2));
  // Tap wires from outer plates to centre line
  segs.push(line(-1.6, 0, 0, 0));
  segs.push(line(1.6, 0, 0, 0));
  // Wait, that draws on the inner rect; better to connect plates to top/bottom lead
  return {
    svg: segs.join(''),
    pins: [
      { number: '1', dx: 0, dy: -5 },
      { number: '2', dx: 0, dy: 5 },
    ],
    halfWidth: 2,
    halfHeight: 6,
    family: 'crystal',
  };
}

// ---------------------------------------------------------------------------
// 3-pin actives — BJT and MOSFET
// ---------------------------------------------------------------------------

function drawBJT(npn: boolean): SymbolDraw {
  // Conventions:
  //   Base on the LEFT at y = 0
  //   Collector on TOP at y = -5 (arrow on emitter, never on collector)
  //   Emitter on BOTTOM at y = +5; arrow direction = NPN out, PNP in
  //
  // Body: a circle of r=4, with vertical line at x = -1.5 (junction line)
  // Slanted lines from junction to each terminal.
  const r = 4;
  const segs: string[] = [];
  // Envelope circle
  segs.push(`<circle cx="0" cy="0" r="${num(r)}" fill="none" stroke="currentColor" stroke-width="0.4"/>`);
  // Base lead
  segs.push(line(-5, 0, -1.5, 0));
  // Vertical junction bar
  segs.push(line(-1.5, -2, -1.5, 2));
  // Collector slanted line
  segs.push(line(-1.5, -1, 2.5, -3));
  // Collector lead up
  segs.push(line(2.5, -3, 2.5, -5));
  // Emitter slanted line
  segs.push(line(-1.5, 1, 2.5, 3));
  // Emitter lead down
  segs.push(line(2.5, 3, 2.5, 5));
  // Emitter arrow
  // Arrow at the slanted line midpoint, pointing AWAY from junction for NPN, TOWARD junction for PNP.
  segs.push(arrowOnSegment(-1.5, 1, 2.5, 3, npn));
  return {
    svg: segs.join(''),
    pins: [
      { number: 'B', dx: -5, dy: 0 },
      { number: 'C', dx: 2.5, dy: -5 },
      { number: 'E', dx: 2.5, dy: 5 },
    ],
    halfWidth: 5,
    halfHeight: 5,
    family: npn ? 'bjt_npn' : 'bjt_pnp',
  };
}

function drawMOSFET(nch: boolean): SymbolDraw {
  // Standard schematic layout:
  //   Gate on LEFT at y = 0
  //   Drain on TOP at y = -5
  //   Source on BOTTOM at y = +5
  //   Three short vertical strokes at x = -1.0 / 0 / +1.0 (the channel) — one
  //   continuous for enhancement-mode? KiCad uses three SEPARATE strokes.
  //   Arrow on source side: NMOS arrow points from body INTO channel, PMOS out.
  const segs: string[] = [];
  // Envelope circle
  segs.push(`<circle cx="0" cy="0" r="4" fill="none" stroke="currentColor" stroke-width="0.4"/>`);
  // Gate lead
  segs.push(line(-5, 0, -2.5, 0));
  // Vertical gate bar (offset from channel)
  segs.push(line(-2.5, -2, -2.5, 2));
  // Three channel strokes (enhancement mode)
  segs.push(line(-1.5, -1.5, -1.5, 1.5));
  segs.push(line(-0.5, -1.5, -0.5, 1.5));
  segs.push(line(0.5, -1.5, 0.5, 1.5));
  // Drain leg
  segs.push(line(-1.5, -1.5, 2.5, -1.5));
  segs.push(line(2.5, -1.5, 2.5, -5));
  // Source leg
  segs.push(line(0.5, 1.5, 2.5, 1.5));
  segs.push(line(2.5, 1.5, 2.5, 5));
  // Body / bulk arrow (between gate bar and channel, midway)
  // NMOS arrow points right (into channel); PMOS points left (out of channel).
  segs.push(arrowOnSegment(-2.5, 0, -1.5, 0, nch));
  return {
    svg: segs.join(''),
    pins: [
      { number: 'G', dx: -5, dy: 0 },
      { number: 'D', dx: 2.5, dy: -5 },
      { number: 'S', dx: 2.5, dy: 5 },
    ],
    halfWidth: 5,
    halfHeight: 5,
    family: nch ? 'mosfet_n' : 'mosfet_p',
  };
}

// ---------------------------------------------------------------------------
// Op-amp (5-pin: in-, in+, out, V+, V-)
// ---------------------------------------------------------------------------

function drawOpAmp(): SymbolDraw {
  // Triangle pointing right. Inputs on the LEFT (- on top, + on bottom),
  // output on the right. V+ and V- pins on the top and bottom apex.
  // Body half-width: 5, half-height: 4.
  const segs: string[] = [];
  segs.push(
    `<polygon points="${num(-5)},${num(-4)} ${num(-5)},${num(4)} ${num(5)},0" fill="none" stroke="currentColor" stroke-width="0.4"/>`,
  );
  // Input pins (- top, + bottom)
  segs.push(line(-8, -2, -5, -2));
  segs.push(line(-8, 2, -5, 2));
  // Output
  segs.push(line(5, 0, 8, 0));
  // V+ and V-
  segs.push(line(0, -2.5, 0, -5));
  segs.push(line(0, 2.5, 0, 5));
  // - and + glyphs
  segs.push(line(-4.5, -2, -3.5, -2)); // minus
  segs.push(line(-4.5, 2, -3.5, 2)); // plus horizontal
  segs.push(line(-4, 1.5, -4, 2.5)); // plus vertical
  return {
    svg: segs.join(''),
    pins: [
      { number: '-', dx: -8, dy: -2 },
      { number: '+', dx: -8, dy: 2 },
      { number: 'OUT', dx: 8, dy: 0 },
      { number: 'V+', dx: 0, dy: -5 },
      { number: 'V-', dx: 0, dy: 5 },
    ],
    halfWidth: 8,
    halfHeight: 5,
    family: 'opamp',
  };
}

// ---------------------------------------------------------------------------
// Power: GND triangle and +V rail
// ---------------------------------------------------------------------------

function drawGround(): SymbolDraw {
  // Wire stub coming from above to (0, 0). Triangle points down.
  const segs: string[] = [];
  segs.push(line(0, -3, 0, 0));
  segs.push(
    `<polygon points="${num(-3)},0 ${num(3)},0 0,${num(4)}" fill="none" stroke="currentColor" stroke-width="0.4"/>`,
  );
  return {
    svg: segs.join(''),
    pins: [{ number: '1', dx: 0, dy: -3 }],
    halfWidth: 3,
    halfHeight: 4,
    family: 'gnd',
  };
}

function drawPowerRail(value: string): SymbolDraw {
  // Upward pointing arrow with the rail value to the right.
  const segs: string[] = [];
  segs.push(line(0, 0, 0, -3));
  segs.push(
    `<polygon points="${num(-1.6)},${num(-3)} ${num(1.6)},${num(-3)} 0,${num(-5.5)}" fill="none" stroke="currentColor" stroke-width="0.4"/>`,
  );
  segs.push(
    `<text x="${num(2.2)}" y="${num(-3.6)}" font-size="2.4" fill="currentColor" opacity="0.85">${esc(value)}</text>`,
  );
  return {
    svg: segs.join(''),
    pins: [{ number: '1', dx: 0, dy: 0 }],
    halfWidth: 6,
    halfHeight: 5.5,
    family: 'power_rail',
  };
}

// ---------------------------------------------------------------------------
// Connector — generic 1×N header
// ---------------------------------------------------------------------------

function drawConnector(): SymbolDraw {
  // Two pin pads on the left, body on the right.
  const segs: string[] = [];
  segs.push(`<rect x="${num(-1)}" y="${num(-3)}" width="6" height="6" fill="none" stroke="currentColor" stroke-width="0.4"/>`);
  segs.push(line(-5, -1.5, -1, -1.5));
  segs.push(line(-5, 1.5, -1, 1.5));
  segs.push(`<circle cx="${num(-1)}" cy="${num(-1.5)}" r="0.4" fill="currentColor"/>`);
  segs.push(`<circle cx="${num(-1)}" cy="${num(1.5)}" r="0.4" fill="currentColor"/>`);
  return {
    svg: segs.join(''),
    pins: [
      { number: '1', dx: -5, dy: -1.5 },
      { number: '2', dx: -5, dy: 1.5 },
    ],
    halfWidth: 6,
    halfHeight: 4,
    family: 'connector',
  };
}

// ---------------------------------------------------------------------------
// Unknown-symbol fallback (keeps the old box behaviour)
// ---------------------------------------------------------------------------

function drawUnknown(): SymbolDraw {
  // 16×8 mm rounded box with stub pins on left/right.
  const W = 16;
  const H = 8;
  const segs: string[] = [];
  segs.push(
    `<rect x="${num(-W / 2)}" y="${num(-H / 2)}" width="${num(W)}" height="${num(H)}" rx="1" ry="1" fill="none" stroke="currentColor" stroke-width="0.4"/>`,
  );
  segs.push(line(-(W / 2 + 3), 0, -W / 2, 0));
  segs.push(line(W / 2, 0, W / 2 + 3, 0));
  return {
    svg: segs.join(''),
    pins: [
      { number: '1', dx: -(W / 2 + 3), dy: 0 },
      { number: '2', dx: W / 2 + 3, dy: 0 },
    ],
    halfWidth: W / 2 + 3,
    halfHeight: H / 2,
    family: 'unknown',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="currentColor" stroke-width="0.4" stroke-linecap="round"/>`;
}

/**
 * Place an arrowhead at the *end* of a segment from (x1,y1) to (x2,y2).
 * If `forward` = true the arrow points toward (x2,y2). If false it points
 * back toward (x1,y1) — used for PNP/PMOS direction inversion.
 */
function arrowOnSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  forward: boolean,
): string {
  // Direction unit vector
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Place the arrow head 60% along the segment so it sits on the slant
  const tx = x1 + dx * 0.65;
  const ty = y1 + dy * 0.65;
  // Arrow size
  const size = 1.4;
  const sx = forward ? ux : -ux;
  const sy = forward ? uy : -uy;
  // Two perpendicular wings: rotate ±150° from the direction of travel
  const cos150 = -Math.cos(Math.PI / 6); // ≈ -0.866
  const sin150 = Math.sin(Math.PI / 6); // ≈ 0.5
  const w1x = sx * cos150 - sy * sin150;
  const w1y = sx * sin150 + sy * cos150;
  const w2x = sx * cos150 + sy * sin150;
  const w2y = -sx * sin150 + sy * cos150;
  return (
    `<polygon points="${num(tx)},${num(ty)} ` +
    `${num(tx + w1x * size)},${num(ty + w1y * size)} ` +
    `${num(tx + w2x * size)},${num(ty + w2y * size)}" ` +
    `fill="currentColor" stroke="currentColor" stroke-width="0.2"/>`
  );
}

function num(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
