// Dados sintéticos para desenvolvimento offline (TSE_MOCK=1).
// Seguem o mesmo formato JSON publicado pelo TSE, para exercitar os parsers.

import { Eleicao, MunicipioInfo, UFS } from "./shared";

export function eleicoes(): Eleicao[] {
  return [
    { id: "9001", ano: 2026, turno: 1, tipo: "federal", nome: "Eleição Geral Federal 2026 - 1º turno", cargos: [1], recente: true },
    { id: "9002", ano: 2026, turno: 1, tipo: "estadual", nome: "Eleição Geral Estadual 2026 - 1º turno", cargos: [3, 5, 6, 7, 8], recente: true },
    { id: "619", ano: 2024, turno: 1, tipo: "municipal", nome: "Eleições Municipais 2024 - 1º turno", cargos: [11, 13] },
    { id: "544", ano: 2022, turno: 1, tipo: "federal", nome: "Eleição Geral Federal 2022 - 1º turno", cargos: [1] },
    { id: "545", ano: 2022, turno: 2, tipo: "federal", nome: "Eleição Geral Federal 2022 - 2º turno", cargos: [1] },
    { id: "546", ano: 2022, turno: 1, tipo: "estadual", nome: "Eleição Geral Estadual 2022 - 1º turno", cargos: [3, 5, 6, 7, 8] },
  ];
}

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const CANDS: Record<string, [string, string, string][]> = {
  "1": [
    ["13", "LULA", "PT"],
    ["22", "BOLSONARO", "PL"],
    ["15", "SIMONE TEBET", "MDB"],
    ["12", "CIRO GOMES", "PDT"],
    ["30", "FELIPE D'AVILA", "NOVO"],
  ],
  "3": [
    ["10", "TARCÍSIO", "REPUBLICANOS"],
    ["13", "HADDAD", "PT"],
    ["40", "RODRIGO GARCIA", "PSDB"],
  ],
  "5": [
    ["133", "MÁRCIO FRANÇA", "PSB"],
    ["222", "MARCOS PONTES", "PL"],
    ["555", "EDSON APARECIDO", "MDB"],
  ],
  "11": [
    ["15", "RICARDO NUNES", "MDB"],
    ["50", "GUILHERME BOULOS", "PSOL"],
    ["28", "PABLO MARÇAL", "PRTB"],
    ["40", "TABATA AMARAL", "PSB"],
  ],
};

function candidatosPara(cargo: number) {
  if (CANDS[String(cargo)]) return CANDS[String(cargo)];
  const nomes = ["ANA SILVA", "JOÃO SOUZA", "MARIA LIMA", "PEDRO ALVES", "CARLA DIAS", "PAULO ROCHA", "LUCIA MELO", "RAFAEL COSTA"];
  const parts = ["13", "22", "45", "15", "50", "10", "55", "44"];
  return nomes.map((nm, i) => [parts[i] + String(100 + i * 7).padStart(3, "0").slice(0, cargo === 6 ? 2 : 3), nm, ""] as [string, string, string]);
}

function cand(cargo: number, ano: number, seed: string, totalValidos: number) {
  const r = rng(seed);
  const base = candidatosPara(cargo);
  const pesos = base.map((_, i) => Math.pow(0.55, i) * (0.6 + r() * 0.8) * (ano === 2022 && i < 2 ? 1 : 1));
  const s = pesos.reduce((a, b) => a + b, 0);
  return base.map(([n, nm], i) => {
    const vap = Math.round((pesos[i] / s) * totalValidos);
    return { n, nm, cc: base[i][2] ? `${base[i][2]} - Coligação` : "", vap: String(vap), pvap: ((100 * vap) / totalValidos).toFixed(2).replace(".", ","), e: i === 0 ? "s" : "n", st: i === 0 ? "Eleito" : "Não eleito" };
  });
}

function bloco(cargo: number, ano: number, seed: string, eleitorado: number) {
  const r = rng(seed + "t");
  const c = Math.round(eleitorado * (0.75 + r() * 0.12));
  const vb = Math.round(c * 0.02);
  const vn = Math.round(c * 0.03);
  const vv = c - vb - vn;
  return { e: String(eleitorado), c: String(c), a: String(eleitorado - c), vb: String(vb), tvn: String(vn), vv: String(vv), pst: "100,00", dg: "05/10/2026", hg: "21:00:00", cand: cand(cargo, ano, seed, vv) };
}

export function municipios(): Record<string, MunicipioInfo[]> {
  const out: Record<string, MunicipioInfo[]> = {};
  for (const u of UFS) {
    out[u.sigla.toLowerCase()] = Array.from({ length: 12 }, (_, i) => ({
      cd: String(10000 + +u.ibge * 100 + i).padStart(5, "0"),
      nome: i === 0 ? `CAPITAL ${u.sigla}` : `MUNICÍPIO ${i} ${u.sigla}`,
      ibge: `${u.ibge}${String(i).padStart(5, "0")}`,
      capital: i === 0,
      zonas: Array.from({ length: i === 0 ? 14 : 2 }, (_, z) => String(z + 1 + i * 3).padStart(4, "0")),
    }));
  }
  out["zz"] = [
    ["29539", "LISBOA"],
    ["29700", "MIAMI"],
    ["29750", "BOSTON"],
    ["29800", "TÓQUIO"],
    ["29810", "LONDRES"],
    ["29820", "BUENOS AIRES"],
    ["29830", "NOVA YORK"],
    ["29840", "PARIS"],
  ].map(([cd, nome]) => ({ cd, nome, zonas: ["0001"] }));
  return out;
}

export function resumoBruto(e: Eleicao, cargo: number, uf: string, mun?: string) {
  return bloco(cargo, e.ano, `${e.id}-${cargo}-${uf}-${mun ?? ""}`, mun ? 80000 : uf === "br" ? 150_000_000 : 5_000_000);
}

export function variaveis(e: Eleicao, uf: string, mun: string | undefined, cargo: number) {
  const abr: any[] = [];
  const m = municipios();
  if (mun) {
    const info = m[uf]?.find((x) => x.cd === mun);
    for (const z of info?.zonas ?? ["0001"]) abr.push({ tpabr: "ZONA", cdabr: z, ...bloco(cargo, e.ano, `${e.id}${cargo}${mun}${z}`, 60000) });
  } else if (uf === "br") {
    for (const u of [...UFS.map((x) => x.sigla.toLowerCase()), "zz"]) abr.push({ tpabr: "UF", cdabr: u.toUpperCase(), ...bloco(cargo, e.ano, `${e.id}${cargo}${u}`, u === "zz" ? 600000 : 4_000_000) });
  } else {
    for (const x of m[uf] ?? []) abr.push({ tpabr: "MU", cdabr: x.cd, ...bloco(cargo, e.ano, `${e.id}${cargo}${x.cd}`, uf === "zz" ? 30000 : 200000) });
  }
  return { abr };
}

/** Geometria sintética (quadrados) para testar o mapa sem acesso ao IBGE. */
export function malha(tipo: "estados" | "municipios", uf?: string) {
  const quad = (x: number, y: number, s: number) => [[[x, y], [x + s, y], [x + s, y - s], [x, y - s], [x, y]]];
  if (tipo === "estados") {
    return {
      type: "FeatureCollection",
      features: UFS.map((u, i) => ({
        type: "Feature",
        properties: { id: u.ibge, nome: u.nome, sigla: u.sigla },
        geometry: { type: "Polygon", coordinates: quad(-70 + (i % 6) * 6, 4 - Math.floor(i / 6) * 6, 5.5) },
      })),
    };
  }
  const info = UFS.find((u) => u.sigla.toLowerCase() === uf)!;
  return {
    type: "FeatureCollection",
    features: Array.from({ length: 12 }, (_, i) => ({
      type: "Feature",
      properties: { id: `${info.ibge}${String(i).padStart(5, "0")}`, nome: i === 0 ? `Capital ${info.sigla}` : `Município ${i} ${info.sigla}` },
      geometry: { type: "Polygon", coordinates: quad(-50 + (i % 4) * 1.1, -15 - Math.floor(i / 4) * 1.1, 1) },
    })),
  };
}
