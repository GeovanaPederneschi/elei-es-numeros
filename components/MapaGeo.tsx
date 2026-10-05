"use client";

// Mapa SVG interativo genérico: zoom (roda do mouse / botões / pinça), arrasto,
// tooltip ao passar o mouse (ou primeiro toque), clique para aprofundar e teclado.

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoIdentity, geoNaturalEarth1, geoPath, GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";

export interface PontoMapa {
  id: string;
  lon: number;
  lat: number;
  r: number;
  fill: string;
}

interface Props {
  features: Feature<Geometry, { id: string; nome: string; sigla?: string }>[];
  projecao?: "mercator" | "mundo";
  fill: (id: string) => string;
  tooltip: (id: string) => ReactNode;
  onClick?: (id: string) => void;
  clicavel?: (id: string) => boolean;
  selecionado?: string;
  rotulo?: (id: string) => string | undefined;
  pontos?: PontoMapa[];
  tooltipPonto?: (id: string) => ReactNode;
  onClickPonto?: (id: string) => void;
  largura?: number;
  altura?: number;
  contornoFino?: boolean;
  descricao?: string;
}

const RAD = Math.PI / 180;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * RAD) / 2)) / RAD;

function preProjetar(g: Geometry): Geometry {
  const p = (c: number[]) => [c[0], mercY(c[1])];
  switch (g.type) {
    case "Polygon":
      return { type: "Polygon", coordinates: g.coordinates.map((r) => r.map(p)) };
    case "MultiPolygon":
      return { type: "MultiPolygon", coordinates: g.coordinates.map((pl) => pl.map((r) => r.map(p))) };
    default:
      return g;
  }
}

export default function MapaGeo({
  features,
  projecao = "mercator",
  fill,
  tooltip,
  onClick,
  clicavel,
  selecionado,
  rotulo,
  pontos,
  tooltipPonto,
  onClickPonto,
  largura = 800,
  altura = 640,
  contornoFino,
  descricao,
}: Props) {
  const W = largura;
  const H = altura;
  const caixa = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [vista, setVista] = useState({ k: 1, x: 0, y: 0 });
  const [dica, setDica] = useState<{ tipo: "f" | "p"; id: string; x: number; y: number } | null>(null);
  const arrasto = useRef<{ x: number; y: number; vx: number; vy: number; moveu: boolean; id: number } | null>(null);
  const toques = useRef(new Map<number, { x: number; y: number }>());
  const pinca = useRef<{ d: number; k: number } | null>(null);

  const { caminhos, proj } = useMemo(() => {
    let proj: GeoProjection | ((c: [number, number]) => [number, number] | null);
    let path: ReturnType<typeof geoPath>;
    if (projecao === "mundo") {
      const fc = { type: "FeatureCollection", features } as FeatureCollection;
      const p = geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], fc);
      proj = p;
      path = geoPath(p);
      return {
        proj: (c: [number, number]) => p(c),
        caminhos: features.map((f) => ({ id: f.properties.id, nome: f.properties.nome, d: path(f) ?? "", c: path.centroid(f) })),
      };
    }
    const pf = features.map((f) => ({ ...f, geometry: preProjetar(f.geometry) }));
    const fc = { type: "FeatureCollection", features: pf } as FeatureCollection;
    const id = geoIdentity().reflectY(true).fitExtent([[8, 8], [W - 8, H - 8]], fc);
    path = geoPath(id);
    proj = (c: [number, number]) => id([c[0], mercY(c[1])]);
    return {
      proj,
      caminhos: pf.map((f) => ({ id: f.properties.id, nome: f.properties.nome, d: path(f) ?? "", c: path.centroid(f) })),
    };
  }, [features, projecao, W, H]);

  // Reinicia o zoom quando o conjunto de formas muda
  useEffect(() => setVista({ k: 1, x: 0, y: 0 }), [features]);

  // Converte coordenadas da tela para o sistema do SVG (correto também com o mapa esticado em tela cheia)
  const paraSvg = useCallback((cx: number, cy: number) => {
    const svg = svgRef.current!;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const zoomEm = useCallback((fator: number, px: number, py: number) => {
    setVista((v) => {
      const k = Math.max(1, Math.min(40, v.k * fator));
      const f = k / v.k;
      const x = px - (px - v.x) * f;
      const y = py - (py - v.y) * f;
      return k === 1 ? { k: 1, x: 0, y: 0 } : { k, x, y };
    });
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const roda = (ev: WheelEvent) => {
      if (!ev.ctrlKey && !ev.metaKey && vista.k === 1) return; // não prende a rolagem da página
      ev.preventDefault();
      const p = paraSvg(ev.clientX, ev.clientY);
      zoomEm(ev.deltaY < 0 ? 1.25 : 0.8, p.x, p.y);
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, [paraSvg, zoomEm, vista.k]);

  const posDica = (ev: { clientX: number; clientY: number }) => {
    const r = caixa.current!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  function aoPressionar(ev: React.PointerEvent) {
    toques.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (toques.current.size === 2) {
      const [a, b] = [...toques.current.values()];
      pinca.current = { d: Math.hypot(a.x - b.x, a.y - b.y), k: vista.k };
      arrasto.current = null;
      return;
    }
    arrasto.current = { x: ev.clientX, y: ev.clientY, vx: vista.x, vy: vista.y, moveu: false, id: ev.pointerId };
  }

  function aoMover(ev: React.PointerEvent) {
    if (toques.current.has(ev.pointerId)) toques.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinca.current && toques.current.size === 2) {
      const [a, b] = [...toques.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const centro = paraSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
      const alvo = Math.max(1, Math.min(40, (pinca.current.k * d) / pinca.current.d));
      zoomEm(alvo / vista.k, centro.x, centro.y);
      return;
    }
    const a = arrasto.current;
    if (!a || vista.k === 1) return;
    const escala = svgRef.current!.getScreenCTM()?.a || 1;
    const dx = (ev.clientX - a.x) / escala;
    const dy = (ev.clientY - a.y) / escala;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      a.moveu = true;
      setDica(null);
    }
    if (a.moveu) setVista((v) => ({ ...v, x: a.vx + dx, y: a.vy + dy }));
  }

  function aoSoltar(ev: React.PointerEvent) {
    toques.current.delete(ev.pointerId);
    if (toques.current.size < 2) pinca.current = null;
    setTimeout(() => (arrasto.current = null), 0);
  }

  function interagir(tipo: "f" | "p", id: string, ev: React.PointerEvent | React.MouseEvent) {
    if (arrasto.current?.moveu) return;
    const toque = "pointerType" in ev && ev.pointerType === "touch";
    if (toque && (!dica || dica.id !== id)) {
      setDica({ tipo, id, ...posDica(ev) });
      return;
    }
    if (tipo === "f") {
      if (onClick && (!clicavel || clicavel(id))) onClick(id);
    } else onClickPonto?.(id);
  }

  const larguraTraco = contornoFino ? 0.4 : 0.8;
  const conteudoDica = dica ? (dica.tipo === "f" ? tooltip(dica.id) : tooltipPonto?.(dica.id)) : null;

  return (
    <div className="mapa" ref={caixa} onMouseLeave={() => setDica(null)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={descricao ?? "Mapa interativo"}
        onPointerDown={aoPressionar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        style={{ cursor: vista.k > 1 ? "grab" : "default", touchAction: vista.k > 1 ? "none" : "pan-y" }}
      >
        <g transform={`translate(${vista.x},${vista.y}) scale(${vista.k})`}>
          {caminhos.map((c) => {
            const ativo = dica?.tipo === "f" && dica.id === c.id;
            const sel = selecionado === c.id;
            const pode = !!onClick && (!clicavel || clicavel(c.id));
            return (
              <path
                key={c.id}
                d={c.d}
                style={{ fill: fill(c.id) }}
                className={`forma${ativo ? " ativa" : ""}${sel ? " selecionada" : ""}${pode ? " clicavel" : ""}`}
                strokeWidth={ativo || sel ? 2 : larguraTraco}
                vectorEffect="non-scaling-stroke"
                tabIndex={pode ? 0 : -1}
                aria-label={c.nome}
                onPointerMove={(ev) => ev.pointerType !== "touch" && setDica({ tipo: "f", id: c.id, ...posDica(ev) })}
                onClick={(ev) => interagir("f", c.id, ev as any)}
                onPointerUp={(ev) => ev.pointerType === "touch" && interagir("f", c.id, ev)}
                onFocus={() => {
                  const r = svgRef.current!.getBoundingClientRect();
                  const cx = (vista.x + c.c[0] * vista.k) * (r.width / W);
                  const cy = (vista.y + c.c[1] * vista.k) * (r.height / H);
                  setDica({ tipo: "f", id: c.id, x: cx, y: cy });
                }}
                onBlur={() => setDica(null)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    if (pode) onClick!(c.id);
                  }
                }}
              />
            );
          })}
          {/* destaque por cima (borda da forma ativa/selecionada) */}
          {caminhos
            .filter((c) => c.id === selecionado || (dica?.tipo === "f" && dica.id === c.id))
            .map((c) => (
              <path key={"h" + c.id} d={c.d} className="contorno-ativo" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            ))}
          {rotulo &&
            caminhos.map((c) => {
              const t = rotulo(c.id);
              if (!t || !isFinite(c.c[0])) return null;
              return (
                <text key={"t" + c.id} x={c.c[0]} y={c.c[1]} className="rotulo-mapa" fontSize={11 / Math.sqrt(vista.k)} pointerEvents="none">
                  {t}
                </text>
              );
            })}
          {pontos?.map((p) => {
            const xy = proj([p.lon, p.lat]);
            if (!xy) return null;
            const ativo = dica?.tipo === "p" && dica.id === p.id;
            return (
              <circle
                key={"p" + p.id}
                cx={xy[0]}
                cy={xy[1]}
                r={Math.max(4, p.r) / Math.sqrt(vista.k)}
                style={{ fill: p.fill }}
                className={`ponto${ativo ? " ativa" : ""}`}
                vectorEffect="non-scaling-stroke"
                onPointerMove={(ev) => ev.pointerType !== "touch" && setDica({ tipo: "p", id: p.id, ...posDica(ev) })}
                onClick={(ev) => interagir("p", p.id, ev as any)}
                onPointerUp={(ev) => ev.pointerType === "touch" && interagir("p", p.id, ev)}
              />
            );
          })}
        </g>
      </svg>

      <div className="mapa-zoom" aria-label="Controles de zoom">
        <button type="button" onClick={() => zoomEm(1.5, W / 2, H / 2)} aria-label="Aproximar">
          +
        </button>
        <button type="button" onClick={() => zoomEm(1 / 1.5, W / 2, H / 2)} aria-label="Afastar">
          −
        </button>
        <button type="button" onClick={() => setVista({ k: 1, x: 0, y: 0 })} aria-label="Restaurar" title="Restaurar">
          ⟲
        </button>
      </div>

      <span className="mapa-ajuda">Ctrl + roda do mouse ou pinça para zoom · arraste para mover</span>

      {dica && conteudoDica && (
        <div
          className="dica"
          style={{
            left: Math.min(dica.x + 14, (caixa.current?.clientWidth ?? 600) - 250),
            top: dica.y + 14,
          }}
          role="tooltip"
        >
          {conteudoDica}
        </div>
      )}
    </div>
  );
}
