import { describe, expect, it } from 'vitest';
import {
  buildCircuitSummaryKbChunk,
  circuitSummarySourceId,
} from '@/lib/ai/kb';

describe('kb summary sync helpers', () => {
  it('builds a public circuit summary chunk with structured metadata', () => {
    const payload = buildCircuitSummaryKbChunk({
      circuitId: 'c1',
      ownerId: 'u1',
      title: 'USB LED indicator',
      visibility: 'public',
      aiSummary: 'A small USB-powered LED indicator circuit.',
      aiSummaryStruct: {
        topology: 'led indicator',
        rails: ['VBUS', 'GND'],
        intent: 'Show when USB power is present.',
        category: 'interface',
        design_notes: 'Series resistor limits LED current.',
        concerns: ['No reverse-polarity protection.'],
        key_components: [
          { designator: 'R1', value: '1k', role: 'LED current limit' },
          { designator: 'D1', value: 'LED', role: 'indicator' },
        ],
        summary_text: 'A simple power-present indicator using one resistor and one LED.',
      },
    });

    expect(payload).not.toBeNull();
    expect(payload?.source_id).toBe(circuitSummarySourceId('c1'));
    expect(payload?.content).toContain('USB LED indicator');
    expect(payload?.content).toContain('A simple power-present indicator');
    expect(payload?.metadata).toMatchObject({
      schematic_id: 'c1',
      owner_id: 'u1',
      title: 'USB LED indicator',
      visibility: 'public',
      topology: 'led indicator',
      category: 'interface',
      rails: ['VBUS', 'GND'],
    });
    expect(payload?.content_sha256).toHaveLength(64);
  });

  it('skips non-public circuits so private summaries never enter retrieval', () => {
    expect(
      buildCircuitSummaryKbChunk({
        circuitId: 'c2',
        ownerId: 'u2',
        title: 'Private lab note',
        visibility: 'private',
        aiSummary: 'Secret circuit',
        aiSummaryStruct: { summary_text: 'Secret circuit' },
      }),
    ).toBeNull();
  });
});
