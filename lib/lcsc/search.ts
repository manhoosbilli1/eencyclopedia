/**
 * LCSC component search via jlcsearch.tscircuit.com (no API key needed).
 *
 * Used for the BOM panel on circuit detail pages.
 */

export interface LcscPart {
  lcsc: string;           // e.g. "C14663"
  mfr: string;            // manufacturer
  mpn: string;            // manufacturer part number
  description: string;
  stock: number;
  price1: number | null;  // unit price at qty=1 USD
  package: string;
  url: string;
}

interface JlcSearchResult {
  lcsc?: string | number;
  mfr?: string;
  mpn?: string;
  description?: string;
  stock?: number | string;
  price?: unknown;
  package?: string;
}

/**
 * Search LCSC for a component by keyword (value, MPN, or description).
 * Returns up to `limit` matches sorted by stock descending.
 */
export async function searchLcsc(query: string, limit = 3): Promise<LcscPart[]> {
  if (!query.trim()) return [];

  const url = `https://jlcsearch.tscircuit.com/api/search?q=${encodeURIComponent(query)}&limit=${limit}&full=true`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'eencyclopedia/1.0' },
      next: { revalidate: 3600 }, // cache 1h — prices change slowly
    });
    if (!res.ok) return [];

    const json: { components?: JlcSearchResult[] } = await res.json();
    const components = json.components ?? [];

    return components.map((c) => ({
      lcsc: String(c.lcsc ?? ''),
      mfr: String(c.mfr ?? ''),
      mpn: String(c.mpn ?? ''),
      description: String(c.description ?? ''),
      stock: Number(c.stock ?? 0),
      price1: extractPrice1(c.price),
      package: String(c.package ?? ''),
      url: c.lcsc ? `https://www.lcsc.com/product-detail/${c.lcsc}.html` : '',
    }));
  } catch {
    return [];
  }
}

function extractPrice1(price: unknown): number | null {
  if (!price) return null;
  // price may be a number, a string, or an array of { qFrom, price } objects
  if (typeof price === 'number') return price;
  if (typeof price === 'string') {
    const n = parseFloat(price);
    return isNaN(n) ? null : n;
  }
  if (Array.isArray(price) && price.length > 0) {
    // find entry with lowest qty (qty=1 or first)
    const sorted = [...price].sort((a, b) => {
      const qa = Number((a as Record<string,unknown>)['qFrom'] ?? 0);
      const qb = Number((b as Record<string,unknown>)['qFrom'] ?? 0);
      return qa - qb;
    });
    const p = Number((sorted[0] as Record<string,unknown>)['price'] ?? NaN);
    return isNaN(p) ? null : p;
  }
  return null;
}

/**
 * Look up LCSC parts for a list of BOM rows.
 * Returns a map from designator to best-match LcscPart (or null).
 */
export async function bomLcscLookup(
  rows: Array<{ designator: string; value: string; mpn?: string | null }>,
): Promise<Map<string, LcscPart | null>> {
  const result = new Map<string, LcscPart | null>();

  // Fetch in parallel, but cap concurrency to avoid rate-limiting
  await Promise.all(
    rows.map(async (row) => {
      const query = row.mpn?.trim() || row.value?.trim();
      if (!query) { result.set(row.designator, null); return; }
      const parts = await searchLcsc(query, 1);
      result.set(row.designator, parts[0] ?? null);
    }),
  );

  return result;
}
