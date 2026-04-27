import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion } from '@/lib/ai/rag';

describe('reciprocalRankFusion', () => {
  it('deduplicates equivalent summary hits across corpora and keeps the best-ranked results first', () => {
    const results = reciprocalRankFusion(
      [
        [
          {
            key: 'user_circuit_summary:schematic:1',
            source_type: 'user_circuit_summary',
            source_id: 'schematic:1',
            content: 'LED indicator summary',
          },
          {
            key: 'datasheet:lm358',
            source_type: 'datasheet',
            source_id: 'lm358',
            content: 'LM358 datasheet excerpt',
          },
        ],
        [
          {
            key: 'user_circuit_summary:schematic:1',
            source_type: 'user_circuit_summary',
            source_id: 'schematic:1',
            content: 'LED indicator summary',
          },
          {
            key: 'user_circuit_summary:schematic:2',
            source_type: 'user_circuit_summary',
            source_id: 'schematic:2',
            content: 'LDO regulator summary',
          },
        ],
      ],
      3,
    );

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({
      source_type: 'user_circuit_summary',
      source_id: 'schematic:1',
    });
    expect(results[1]).toMatchObject({
      source_type: 'datasheet',
      source_id: 'lm358',
    });
    expect(results[2]).toMatchObject({
      source_type: 'user_circuit_summary',
      source_id: 'schematic:2',
    });
  });
});
