"use client";

// Gráfico de linhas com eixo único, régua vertical e tooltip ao passar o mouse.

import { ReactNode, useMemo, useRef, useState } from "react";

export interface Serie {
  id: string;
  nome: string;
  cor: string;
  pontos: { x: number; y: number; rotulo?: string; extra?: ReactNode }[];
}

export default function GraficoLinhas({
  series,
  rotuloX,
  formatoY = (v) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
  altura = 300,
  maxY,
}: {
  series: Serie[];
  rotuloX: (x: number) => string;
  formatoY?: (v: number) => string;
  altura?: number;
  maxY?: number;
}) {
  const W = 760;
  const H = altura;
  const m = { t: 16, r: 18, b: 34, l: 44 };
  const ref = useRef<SVGSVGElement>(null);
  const [hx, setHx] = useState<number | null>(null);

  const xs = useMemo(() => [...new Set(series.flatMap((s) => s.pontos.map((p) => p.x)))].sort((a, b) => a - b), [series]);
  const ymax = maxY ?? Math.max(10, Math.ceil(Math.max(...series.flatMap((s) => s.pontos.map((p) => p.y))) / 10) * 10);
  // Eixo X categórico (uma posição por eleição), para não espremer eleições próximas
  const px = (x: number) => (xs.length <= 1 ? (m.l + W - m.r) / 2 : m.l + (xs.indexOf(x) / (xs.length - 1)) * (W - m.l - m.r));
  const py = (y: number) => m.t + (1 - y / ymax) * (H - m.t - m.b);
  const ticks = Array.from({ length: 5 }, (_, i) => (ymax / 4) * i);

  if (!xs.length) return <p className="secundario">Sem dados para o gráfico.</p>;

  const mover = (ev: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    let melhor = xs[0];
    for (const v of xs) if (Math.abs(px(v) - x) < Math.abs(px(melhor) - x)) melhor = v;
    setHx(melhor);
  };

  const noX = hx !== null ? series.map((s) => ({ s, p: s.pontos.find((p) => p.x === hx) })).filter((o) => o.p) : [];
  const esquerda = hx !== null && px(hx) > W * 0.6;

  return (
    <div className="grafico">
      {series.length > 1 && (
        <div className="legenda-itens">
          {series.map((s) => (
            <span key={s.id} className="legenda-item">
              <i className="bolinha" style={{ background: s.cor }} />
              {s.nome}
            </span>
          ))}
        </div>
      )}
      <div className="grafico-area">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} onPointerMove={mover} onPointerLeave={() => setHx(null)} role="img" aria-label="Gráfico de linhas">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={py(t)} y2={py(t)} className="grade" />
              <text x={m.l - 6} y={py(t) + 4} className="eixo" textAnchor="end">
                {formatoY(t)}
              </text>
            </g>
          ))}
          {xs.map((x) => (
            <text key={x} x={px(x)} y={H - 10} className="eixo" textAnchor="middle">
              {rotuloX(x)}
            </text>
          ))}
          {hx !== null && <line x1={px(hx)} x2={px(hx)} y1={m.t} y2={H - m.b} className="regua" />}
          {series.map((s) => {
            const pts = [...s.pontos].sort((a, b) => a.x - b.x);
            return (
              <g key={s.id}>
                <path d={pts.map((p, i) => `${i ? "L" : "M"}${px(p.x)},${py(p.y)}`).join("")} fill="none" stroke={s.cor} strokeWidth={2} strokeLinejoin="round" />
                {pts.map((p) => (
                  <circle key={p.x} cx={px(p.x)} cy={py(p.y)} r={hx === p.x ? 6 : 4.5} fill={s.cor} className="marcador" />
                ))}
                {series.length <= 4 && pts.length > 0 && (
                  <text x={px(pts[pts.length - 1].x)} y={py(pts[pts.length - 1].y) - 10} className="rotulo-direto" textAnchor="middle">
                    {formatoY(pts[pts.length - 1].y)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hx !== null && noX.length > 0 && (
          <div className="dica dica-grafico" style={esquerda ? { right: `${100 - (px(hx) / W) * 100 + 2}%` } : { left: `${(px(hx) / W) * 100 + 2}%` }}>
            <strong className="dica-titulo">{rotuloX(hx)}</strong>
            {noX
              .sort((a, b) => b.p!.y - a.p!.y)
              .map(({ s, p }) => (
                <div key={s.id} className="dica-linha">
                  <i className="bolinha" style={{ background: s.cor }} /> {p!.rotulo ?? s.nome}: <b>{formatoY(p!.y)}</b>
                  {p!.extra ? <div className="secundario">{p!.extra}</div> : null}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
