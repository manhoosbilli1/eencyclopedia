import { describe, expect, it } from 'vitest';
import {
  buildChatUserPrompt,
  formatCalculatorReply,
  materializeCircuitPromptContext,
  runCalculatorInvocation,
  stripModelOverride,
} from '@/lib/ai/router';

describe('router helpers', () => {
  it('strips explicit model overrides from the front of a chat message', () => {
    expect(stripModelOverride('/opus review this regulator')).toEqual({
      cleaned: 'review this regulator',
      modelOverride: 'opus',
    });
    expect(stripModelOverride('plain question')).toEqual({
      cleaned: 'plain question',
      modelOverride: null,
    });
  });

  it('builds a compact chat prompt with recent history and the latest message', () => {
    const prompt = buildChatUserPrompt({
      latestMessage: 'What is R1 doing here?',
      history: [
        { role: 'user', content: 'Explain the supply rail.' },
        { role: 'assistant', content: 'It powers the LED branch.' },
      ],
    });

    expect(prompt).toContain('Conversation so far:');
    expect(prompt).toContain('Turn 1 user: Explain the supply rail.');
    expect(prompt).toContain('Latest user message:');
    expect(prompt).toContain('What is R1 doing here?');
  });

  it('materializes a circuit prompt context from stored summary fields', () => {
    const context = materializeCircuitPromptContext({
      circuitId: 'c1',
      title: 'RC low-pass',
      aiSummary: 'A simple RC filter.',
      aiSummaryStruct: {
        topology: 'low-pass filter',
        rails: ['VIN', 'GND'],
        intent: 'Attenuate high-frequency content.',
        design_notes: 'Single-pole filter.',
        key_components: [{ designator: 'R1', value: '10k', role: 'series resistor' }],
      },
    });

    expect(context).toMatchObject({
      id: 'c1',
      title: 'RC low-pass',
      topology: 'low-pass filter',
      rails: ['VIN', 'GND'],
      intent: 'Attenuate high-frequency content.',
    });
    expect(context?.key_components[0]).toMatchObject({
      designator: 'R1',
      value: '10k',
      role: 'series resistor',
    });
  });

  it('formats deterministic calculator output into the chat response shape', () => {
    const invocation = {
      tool: 'calc.ledResistor' as const,
      args: { Vsupply: 3.3, Vf: 2, If: 0.01 },
    };
    const result = runCalculatorInvocation(invocation);
    const reply = formatCalculatorReply({
      invocation,
      result,
      mode: 'both',
    });

    expect(reply).toContain('**Direct answer**');
    expect(reply).toContain('**Derivation**');
    expect(reply).toContain('**Intuition**');
    expect(reply).toContain('**Citations**');
    expect(reply).toContain('Verify before use in production');
  });
});
