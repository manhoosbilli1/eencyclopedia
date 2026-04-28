// app/test/page.tsx
import SymbolRenderer from '@/components/ui/SymbolRenderer';

export default function TestPage() {
  return (
    <div>
      <h1>Test Symbol</h1>
      <svg width={400} height={400}>
        <SymbolRenderer libId='"4001"' />
      </svg>
    </div>
  );
}