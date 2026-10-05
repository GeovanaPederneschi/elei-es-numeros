// Malhas geográficas (GeoJSON) do IBGE: estados do Brasil ou municípios de um estado.
// Normaliza as propriedades para { id: código IBGE, nome } e reduz a precisão das coordenadas.

import { ok, falha, params } from "@/lib/api";
import { UF_POR_SIGLA, UF_POR_IBGE, UFS, normalizar } from "@/lib/shared";
import { MOCK, TSEError } from "@/lib/tse";
import * as mock from "@/lib/mock";

export const maxDuration = 30;

const IBGE = "https://servicodados.ibge.gov.br/api";

async function buscar(url: string) {
  const res = await fetch(url, {
    headers: { Accept: "application/json, application/vnd.geo+json" },
    next: { revalidate: 60 * 60 * 24 * 30 },
    signal: AbortSignal.timeout(25000),
  } as RequestInit);
  if (!res.ok) throw new TSEError(`Falha ao obter malha (${res.status})`);
  return res.json();
}

function arredondar(geom: any) {
  const r = (c: number[]) => [Math.round(c[0] * 1000) / 1000, Math.round(c[1] * 1000) / 1000];
  const anel = (a: number[][]) => {
    const out: number[][] = [];
    for (const p of a) {
      const q = r(p);
      const u = out[out.length - 1];
      if (!u || u[0] !== q[0] || u[1] !== q[1]) out.push(q);
    }
    return out.length >= 4 ? out : a.map(r);
  };
  if (geom.type === "Polygon") return { type: "Polygon", coordinates: geom.coordinates.map(anel) };
  if (geom.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: geom.coordinates.map((p: number[][][]) => p.map(anel)) };
  return geom;
}

function normalizarFC(fc: any, props: (p: any) => { id: string; nome: string; sigla?: string } | null) {
  return {
    type: "FeatureCollection",
    features: (fc.features ?? [])
      .map((f: any) => {
        const p = props(f.properties ?? {});
        if (!p || !f.geometry) return null;
        return { type: "Feature", properties: p, geometry: arredondar(f.geometry) };
      })
      .filter(Boolean),
  };
}

async function estados() {
  try {
    const fc = await buscar(`${IBGE}/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=UF`);
    return normalizarFC(fc, (p) => {
      const uf = UF_POR_IBGE[String(p.codarea)];
      return uf ? { id: uf.ibge, nome: uf.nome, sigla: uf.sigla } : null;
    });
  } catch {
    const fc = await buscar("https://cdn.jsdelivr.net/gh/codeforgermany/click_that_hood@main/public/data/brazil-states.geojson");
    const porNome = new Map(UFS.map((u) => [normalizar(u.nome), u]));
    return normalizarFC(fc, (p) => {
      const uf = (p.sigla && UF_POR_SIGLA[String(p.sigla).toLowerCase()]) || porNome.get(normalizar(p.name ?? p.nome ?? ""));
      return uf ? { id: uf.ibge, nome: uf.nome, sigla: uf.sigla } : null;
    });
  }
}

async function municipios(sigla: string) {
  const uf = UF_POR_SIGLA[sigla];
  if (!uf) throw new TSEError("UF inválida", 400);
  try {
    const [fc, nomes] = await Promise.all([
      buscar(`${IBGE}/v3/malhas/estados/${uf.ibge}?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=municipio`),
      buscar(`${IBGE}/v1/localidades/estados/${uf.ibge}/municipios`).catch(() => []),
    ]);
    const porId = new Map<string, string>((nomes as any[]).map((m) => [String(m.id), m.nome]));
    return normalizarFC(fc, (p) => ({ id: String(p.codarea), nome: porId.get(String(p.codarea)) ?? String(p.codarea) }));
  } catch {
    const fc = await buscar(`https://cdn.jsdelivr.net/gh/tbrugz/geodata-br@master/geojson/geojs-${uf.ibge}-mun.json`);
    return normalizarFC(fc, (p) => ({ id: String(p.id), nome: String(p.name ?? p.id) }));
  }
}

export async function GET(req: Request) {
  try {
    const sp = params(req);
    const tipo = sp.get("tipo") === "municipios" ? "municipios" : "estados";
    const uf = (sp.get("uf") || "").toLowerCase();
    if (MOCK) return ok(mock.malha(tipo, uf), 60);
    const fc = tipo === "estados" ? await estados() : await municipios(uf);
    return ok(fc, 60 * 60 * 24 * 7);
  } catch (e) {
    return falha(e);
  }
}
