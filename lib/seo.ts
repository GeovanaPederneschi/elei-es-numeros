// Utilitários de SEO: URL do site, endereços amigáveis e textos.

import { CARGOS, Eleicao, UFS, UF_POR_SIGLA, nomeUF, normalizar } from "./shared";

export const SITE_NOME = "Eleições em Números";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
  "http://localhost:3000"
).replace(/\/$/, "");

export const CARGO_SLUG: Record<number, string> = {
  1: "presidente",
  3: "governador",
  5: "senador",
  6: "deputado-federal",
  7: "deputado-estadual",
  8: "deputado-distrital",
  11: "prefeito",
  13: "vereador",
};

export const SLUG_CARGO: Record<string, number> = Object.fromEntries(Object.entries(CARGO_SLUG).map(([k, v]) => [v, +k]));

export function slug(s: string): string {
  return normalizar(s).toLowerCase().replace(/\s+/g, "-");
}

/** Capitais (para páginas de prefeito/vereador). O DF não tem eleição municipal. */
export const CAPITAIS: Record<string, string> = {
  ac: "Rio Branco", al: "Maceió", ap: "Macapá", am: "Manaus", ba: "Salvador", ce: "Fortaleza", es: "Vitória", go: "Goiânia",
  ma: "São Luís", mt: "Cuiabá", ms: "Campo Grande", mg: "Belo Horizonte", pa: "Belém", pb: "João Pessoa", pr: "Curitiba",
  pe: "Recife", pi: "Teresina", rj: "Rio de Janeiro", rn: "Natal", rs: "Porto Alegre", ro: "Porto Velho", rr: "Boa Vista",
  sc: "Florianópolis", sp: "São Paulo", se: "Aracaju", to: "Palmas",
};

/** /resultados/2026/presidente/sp/2-turno */
export function urlResultado(ano: number, cargo: number, uf = "br", munNome?: string, turno = 1): string {
  const partes = ["/resultados", String(ano), CARGO_SLUG[cargo]];
  const abr = CARGOS[cargo]?.abrangencia;
  if (uf && uf !== "br") partes.push(uf.toLowerCase());
  else if (turno === 2 || abr !== "br") partes.push("brasil");
  if (munNome) partes.push(slug(munNome));
  if (turno === 2) partes.push("2-turno");
  return partes.join("/");
}

export interface RotaResultado {
  ano: number;
  cargo: number;
  turno: number;
  uf: string; // "br" ou sigla
  munSlug?: string;
}

export function lerRota(ano: string, cargoSlug: string, local: string[] = []): RotaResultado | null {
  const cargo = SLUG_CARGO[cargoSlug];
  if (!cargo || !/^\d{4}$/.test(ano)) return null;
  const partes = [...local];
  let turno = 1;
  if (partes[partes.length - 1] === "2-turno") {
    turno = 2;
    partes.pop();
  }
  const ufParte = (partes[0] ?? "brasil").toLowerCase();
  const uf = ufParte === "brasil" ? "br" : ufParte;
  if (uf !== "br" && uf !== "zz" && !UF_POR_SIGLA[uf]) return null;
  return { ano: +ano, cargo, turno, uf, munSlug: partes[1] };
}

export function eleicaoDaRota(lista: Eleicao[], r: RotaResultado): Eleicao | undefined {
  return lista.find((e) => e.ano === r.ano && e.turno === r.turno && e.cargos.includes(r.cargo));
}

export function nomeLocal(uf: string, munNome?: string) {
  if (munNome) return `${munNome} (${uf.toUpperCase()})`;
  return uf === "br" ? "Brasil" : uf === "zz" ? "Exterior" : nomeUF(uf);
}

export function tituloResultado(ano: number, cargo: number, turno: number, uf: string, munNome?: string) {
  const local = nomeLocal(uf, munNome);
  return `Resultado da eleição para ${CARGOS[cargo]?.nome.toLowerCase()} ${ano} em ${local}${turno === 2 ? " – 2º turno" : ""}`;
}

export function ufsDoCargo(cargo: number) {
  return UFS.filter((u) => (cargo === 8 ? u.sigla === "DF" : cargo === 7 || cargo >= 11 ? u.sigla !== "DF" : true));
}
