import { z } from 'zod';

export type VoyageInputType = 'query' | 'document';

const EmbeddingResponseSchema = z.object({
  data: z
    .array(
      z.object({
        embedding: z.array(z.number()),
      }),
    )
    .min(1),
});

export class VoyageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoyageError';
  }
}

export async function embedText(args: {
  input: string;
  inputType: VoyageInputType;
}): Promise<number[]> {
  const { serverEnv } = await import('@/lib/env');

  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverEnv.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: args.input,
      model: serverEnv.VOYAGE_MODEL,
      input_type: args.inputType,
      output_dimension: serverEnv.VOYAGE_EMBED_DIM,
      truncation: true,
    }),
  });

  if (!response.ok) {
    throw new VoyageError(`Voyage embeddings failed with ${response.status}.`);
  }

  const payload = EmbeddingResponseSchema.safeParse(await response.json());
  if (!payload.success) {
    throw new VoyageError('Voyage returned an unexpected embeddings payload.');
  }

  return payload.data.data[0]?.embedding ?? [];
}
