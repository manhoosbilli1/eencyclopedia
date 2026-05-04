/**
 * /test — manual visual check for SymbolRenderer glyphs.
 * Not wired into nav; browse to /test in dev mode to eyeball glyphs.
 */
import SymbolRenderer from '@/components/ui/SymbolRenderer';

const DEMO_SYMBOLS: Array<{ libId: string; value: string }> = [
  { libId: 'Device:R', value: '10k' },
  { libId: 'Device:C', value: '100n' },
  { libId: 'Device:CP', value: '10u' },
  { libId: 'Device:L', value: '10u' },
  { libId: 'Device:D', value: '1N4148' },
  { libId: 'Device:LED', value: 'RED' },
  { libId: 'Device:Q_NPN_BCE', value: 'BC547' },
  { libId: 'Device:Q_PNP_BCE', value: 'BC557' },
  { libId: 'Device:Q_NMOS_GSD', value: '2N7000' },
  { libId: 'Device:Q_PMOS_GSD', value: 'BSS84' },
  { libId: 'Amplifier_Operational:LM358', value: 'LM358' },
  { libId: 'power:GND', value: 'GND' },
  { libId: 'power:+3V3', value: '+3V3' },
  { libId: 'Device:Battery', value: 'CR2032' },
  { libId: 'Device:SW_Push', value: 'BTN' },
  { libId: 'Regulator_Linear:LM7805', value: 'LM7805' },
  { libId: 'Device:Crystal', value: '16MHz' },
  { libId: 'Device:Fuse', value: '500mA' },
  { libId: 'Connector_Generic:Conn_01x02', value: 'J1' },
  { libId: 'Unknown:Whatever', value: 'U1' },
];

export default function TestPage() {
  return (
    <div style={{ padding: 32, fontFamily: 'system-ui' }}>
      <h1 style={{ marginBottom: 24 }}>Symbol Glyph Preview</h1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 16,
        }}
      >
        {DEMO_SYMBOLS.map(({ libId, value }) => (
          <div
            key={libId}
            style={{
              border: '1px solid #ddd',
              borderRadius: 8,
              padding: 12,
              textAlign: 'center',
            }}
          >
            <SymbolRenderer libId={libId} value={value} width={90} height={90} />
            <div style={{ fontSize: 11, marginTop: 6, color: '#666', wordBreak: 'break-all' }}>
              {libId}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
