"use client";

// O TSE não publica a geometria das zonas eleitorais; elas são exibidas como um
// mosaico interativo (cada bloco é uma zona, com área proporcional ao eleitorado).

import { ReactNode, useRef, useState } from "react";

export interface BlocoZona {
  id: string;
  rotulo: string;
  peso: number;
  fill: string;
}

export default function MapaZonas({
  blocos,
  tooltip,
  onClick,
  selecionado,
}: {
  blocos: BlocoZona[];
  tooltip: (id: string) => ReactNode;
  onClick?: (id: string) => void;
  selecionado?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [dica, setDica] = useState<{ id: string; x: number; y: number } | null>(null);
  const max = Math.max(1, ...blocos.map((b) => b.peso));
  const ordenados = [...blocos].sort((a, b) => +a.id - +b.id);

  const pos = (ev: { clientX: number; clientY: number }) => {
    const r = caixa.current!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  return (
    <div className="mapa mapa-zonas" ref={caixa} onMouseLeave={() => setDica(null)}>
      <div className="mosaico" role="list" aria-label="Zonas eleitorais">
        {ordenados.map((b) => {
          const lado = 56 + 64 * Math.sqrt(b.peso / max);
          return (
            <button
              type="button"
              role="listitem"
              key={b.id}
              className={`zona${selecionado === b.id ? " selecionada" : ""}${dica?.id === b.id ? " ativa" : ""}`}
              style={{ background: b.fill, width: lado, height: lado }}
              onPointerMove={(ev) => ev.pointerType !== "touch" && setDica({ id: b.id, ...pos(ev) })}
              onFocus={(ev) => {
                const r = (ev.target as HTMLElement).getBoundingClientRect();
                const c = caixa.current!.getBoundingClientRect();
                setDica({ id: b.id, x: r.left - c.left + r.width / 2, y: r.top - c.top + r.height / 2 });
              }}
              onBlur={() => setDica(null)}
              onClick={(ev) => {
                setDica({ id: b.id, ...pos(ev) });
                onClick?.(b.id);
              }}
              aria-label={b.rotulo}
            >
              <span>{b.rotulo.replace("Zona ", "")}</span>
            </button>
          );
        })}
      </div>
      {dica && (
        <div className="dica" style={{ left: Math.min(dica.x + 14, (caixa.current?.clientWidth ?? 600) - 250), top: dica.y + 14 }} role="tooltip">
          {tooltip(dica.id)}
        </div>
      )}
      <p className="nota">Cada bloco é uma zona eleitoral (tamanho proporcional ao eleitorado). O TSE não publica os limites geográficos das zonas.</p>
    </div>
  );
}
