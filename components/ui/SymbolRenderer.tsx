// /components/SymbolRenderer.tsx
import { useEffect, useState } from 'react';
import { getSymbol } from '@/lib/symbols/registry';

export default function SymbolRenderer({ libId }) {
  const [sym, setSym] = useState<any>(null);

  useEffect(() => {
    getSymbol(libId).then(setSym);
  }, [libId]);

  if (!sym) return <div>Loading...</div>;

  return (
    <g>
      {sym.graphics.map((g, i) => {
        if (g.type === 'line') {
          return (
            <line
              key={i}
              x1={g.a.x}
              y1={g.a.y}
              x2={g.b.x}
              y2={g.b.y}
              stroke="black"
              strokeWidth={1}
            />
          );
        } else if (g.type === 'rect') {
          return (
            <rect
              key={i}
              x={Math.min(g.a.x, g.b.x)}
              y={Math.min(g.a.y, g.b.y)}
              width={Math.abs(g.b.x - g.a.x)}
              height={Math.abs(g.b.y - g.a.y)}
              stroke="black"
              fill="none"
              strokeWidth={1}
            />
          );
        } else if (g.type === 'circle') {
          return (
            <circle
              key={i}
              cx={g.c.x}
              cy={g.c.y}
              r={g.r}
              stroke="black"
              fill="none"
              strokeWidth={1}
            />
          );
        } else if (g.type === 'arc') {
          // Approximate arc as line for now
          return (
            <line
              key={i}
              x1={g.a.x}
              y1={g.a.y}
              x2={g.b.x}
              y2={g.b.y}
              stroke="black"
              strokeWidth={1}
            />
          );
        } else if (g.type === 'text') {
          return (
            <text
              key={i}
              x={g.position.x}
              y={g.position.y}
              fontSize={g.size}
              fill="black"
            >
              {g.text}
            </text>
          );
        }
        return null;
      })}

      {sym.pins.map(p => (
        <circle key={p.id} cx={p.position.x} cy={p.position.y} r={2} fill="red" />
      ))}
    </g>
  );
}