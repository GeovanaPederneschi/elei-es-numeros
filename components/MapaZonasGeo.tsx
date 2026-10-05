"use client";

// Zonas eleitorais no mapa real do município.
// O TSE não publica limites das zonas, mas publica as coordenadas dos locais de votação.
// Cada ponto do município é atribuído ao local de votação mais próximo (diagrama de Voronoi),
// as células são pintadas conforme a zona do local e recortadas no contorno do município.

import { ReactNode, useMemo, useState } from "react";
import { Delaunay } from "d3-delaunay";
import type { Feature, Geometry, Polygon, MultiPolygon } from "geojson";
import MapaGeo, { PontoMapa } from "./MapaGeo";
import MapaZonas from "./MapaZonas";
import { DicaPadrao, Pintura, useGeometria } from "./MapaAreas";
import { AreaCalc } from "@/lib/analise";
import { useApi } from "@/lib/cliente";
import { SEM_DADOS } from "@/lib/cores";
import { titulo } from "@/lib/shared";

type Local = [string, string, string, string, string, number, number, number];

const RAD = Math.PI / 180;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2)) / RAD;
const invMercY = (y: number) => (2 * Math.atan(Math.exp(y * RAD)) - Math.PI / 2) / RAD;

function dentroAnel(x: number, y: number, anel: number[][]) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function dentro(lon: number, lat: number, g: Geometry): boolean {
  const pols = g.type === "Polygon" ? [(g as Polygon).coordinates] : g.type === "MultiPolygon" ? (g as MultiPolygon).coordinates : [];
  return pols.some((p) => dentroAnel(lon, lat, p[0]) && !p.slice(1).some((buraco) => dentroAnel(lon, lat, buraco)));
}

function caixa(g: Geometry) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const pols = g.type === "Polygon" ? [(g as Polygon).coordinates] : (g as MultiPolygon).coordinates;
  for (const p of pols) for (const [lon, lat] of p[0]) {
    x0 = Math.min(x0, lon); x1 = Math.max(x1, lon);
    y0 = Math.min(y0, mercY(lat)); y1 = Math.max(y1, mercY(lat));
  }
  return [x0, y0, x1, y1];
}

export default function MapaZonasGeo({
  calc,
  uf,
  mun,
  pintura,
  destaque,
  onSelecionar,
  selecionado,
}: {
  calc: AreaCalc[];
  uf: string;
  mun: string;
  pintura: Pintura;
  destaque?: string;
  onSelecionar?: (ac: AreaCalc) => void;
  selecionado?: string;
}) {
  const [modo, setModo] = useState<"mapa" | "blocos">("mapa");
  const locais = useApi<{ ano: number; ibge?: string; locais: Local[] }>(uf && mun && uf !== "zz" ? `/api/locais?uf=${uf}&mun=${mun}` : null);
  const geo = useGeometria("mun", uf);
  const porZona = useMemo(() => new Map(calc.map((ac) => [ac.area.cd, ac])), [calc]);

  const desenho = useMemo(() => {
    const ibge = locais.dados?.ibge;
    const contorno = ibge ? geo.feats?.find((f) => f.properties.id === ibge) : undefined;
    if (!contorno || !locais.dados?.locais.length) return null;
    const pts = locais.dados.locais.filter((l) => dentro(l[6], l[5], contorno.geometry));
    if (pts.length < 1) return null;

    const [x0, y0, x1, y1] = caixa(contorno.geometry);
    const mx = (x1 - x0) * 0.05 + 1e-4;
    const my = (y1 - y0) * 0.05 + 1e-4;
    const coords = pts.map((l) => [l[6], mercY(l[5])] as [number, number]);
    const d = Delaunay.from(coords);
    const v = d.voronoi([x0 - mx, y0 - my, x1 + mx, y1 + my]);

    const celulas: Feature<Geometry, { id: string; nome: string }>[] = [];
    pts.forEach((l, i) => {
      const anel = v.cellPolygon(i);
      if (!anel) return;
      celulas.push({
        type: "Feature",
        properties: { id: `c${i}`, nome: `${titulo(l[2])} (Zona ${+l[0]})` },
        geometry: { type: "Polygon", coordinates: [anel.map(([x, y]) => [x, invMercY(y)])] },
      });
    });

    // divisas entre zonas: arestas de Voronoi entre locais de zonas diferentes
    const seg: number[][][] = [];
    const prox = (e: number) => (e % 3 === 2 ? e - 2 : e + 1);
    for (let e = 0; e < d.halfedges.length; e++) {
      const o = d.halfedges[e];
      if (o < e) continue;
      const p = d.triangles[e];
      const q = d.triangles[prox(e)];
      if (pts[p][0] === pts[q][0]) continue;
      const t1 = Math.floor(e / 3);
      const t2 = Math.floor(o / 3);
      const a = [v.circumcenters[2 * t1], v.circumcenters[2 * t1 + 1]];
      const b = [v.circumcenters[2 * t2], v.circumcenters[2 * t2 + 1]];
      seg.push([[a[0], invMercY(a[1])], [b[0], invMercY(b[1])]]);
    }

    // rótulo de cada zona no centro dos seus locais (ponderado pelo eleitorado)
    const centros = new Map<string, { x: number; y: number; w: number }>();
    for (const l of pts) {
      const w = Math.max(1, l[7]);
      const c = centros.get(l[0]) ?? { x: 0, y: 0, w: 0 };
      c.x += l[6] * w; c.y += l[5] * w; c.w += w;
      centros.set(l[0], c);
    }
    const marcadores = [...centros.entries()].map(([z, c]) => ({ lon: c.x / c.w, lat: c.y / c.w, texto: String(+z) }));
    const maxEl = Math.max(1, ...pts.map((l) => l[7]));
    const pontos: PontoMapa[] = pts.map((l, i) => ({ id: `p${i}`, lon: l[6], lat: l[5], r: 1.5 + 3 * Math.sqrt(l[7] / maxEl), fill: "rgba(255,255,255,0.9)" }));
    return { contorno, pts, celulas, linhas: { type: "MultiLineString", coordinates: seg } as Geometry, marcadores, pontos };
  }, [locais.dados, geo.feats]);

  const zonaDaCelula = (id: string) => desenho?.pts[+id.slice(1)]?.[0];
  const acDe = (z?: string) => (z ? porZona.get(z) : undefined);

  const dicaLocal = (l: Local, extra?: ReactNode) => {
    const ac = acDe(l[0]);
    const info = (
      <small className="secundario">
        📍 {titulo(l[2])}
        {l[3] ? ` — ${titulo(l[3])}` : ""}
        {l[4] ? `, ${titulo(l[4])}` : ""}
        {l[7] ? ` · ${l[7].toLocaleString("pt-BR")} eleitores` : ""}
      </small>
    );
    if (!ac) return <div><strong>Zona {+l[0]}</strong><br />{info}{extra}</div>;
    return pintura.dica ? <div>{pintura.dica(ac)}{info}</div> : <DicaPadrao ac={ac} destaque={destaque} extra={info} />;
  };

  const blocos = (
    <MapaZonas
      blocos={calc.map((ac) => ({ id: ac.area.cd, rotulo: ac.area.nome, peso: ac.area.totais.eleitorado || ac.validos, fill: pintura.pintar(ac) }))}
      tooltip={(id) => {
        const ac = porZona.get(id)!;
        return pintura.dica ? pintura.dica(ac) : <DicaPadrao ac={ac} destaque={destaque} />;
      }}
      selecionado={selecionado}
      onClick={(id) => onSelecionar?.(porZona.get(id)!)}
    />
  );

  const carregando = locais.carregando || (!geo.feats && !geo.erro);
  const semMapa = !carregando && !desenho;

  return (
    <div className="zonas-geo">
      <div className="segmentado zonas-modo" role="group" aria-label="Visualização das zonas">
        <button type="button" aria-pressed={modo === "mapa"} onClick={() => setModo("mapa")} disabled={semMapa}>
          Mapa das zonas
        </button>
        <button type="button" aria-pressed={modo === "blocos" || semMapa} onClick={() => setModo("blocos")}>
          Blocos
        </button>
      </div>
      {modo === "blocos" || semMapa ? (
        <>
          {semMapa && (
            <p className="nota">
              {locais.erro ? `Não foi possível obter os locais de votação (${locais.erro}).` : "Sem coordenadas dos locais de votação para este município."} Mostrando as zonas em blocos.
            </p>
          )}
          {blocos}
        </>
      ) : carregando || !desenho ? (
        <div className="mapa carregando-mapa">
          <div className="pulso" />
          <span>Carregando locais de votação…</span>
        </div>
      ) : (
        <>
          <MapaGeo
            features={desenho.celulas}
            recorte={desenho.contorno}
            linhas={desenho.linhas}
            marcadores={desenho.marcadores}
            contornoFino
            fill={(id) => {
              const ac = acDe(zonaDaCelula(id));
              return ac ? pintura.pintar(ac) : SEM_DADOS;
            }}
            tooltip={(id) => dicaLocal(desenho.pts[+id.slice(1)])}
            onClick={(id) => {
              const ac = acDe(zonaDaCelula(id));
              if (ac) onSelecionar?.(ac);
            }}
            pontos={desenho.pontos}
            tooltipPonto={(id) => dicaLocal(desenho.pts[+id.slice(1)])}
            descricao="Mapa aproximado das zonas eleitorais do município"
          />
          <p className="nota">
            Áreas aproximadas: cada ponto do município foi atribuído ao local de votação mais próximo. Os pontos brancos são os {desenho.pts.length} locais de
            votação (cadastro do TSE de {locais.dados?.ano}). O TSE não publica limites oficiais das zonas.
          </p>
        </>
      )}
    </div>
  );
}
