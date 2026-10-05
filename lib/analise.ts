// Cálculos sobre a distribuição de votos (lado do navegador).

import { Area, Candidato, Distribuicao, corPartido } from "./shared";

export interface Posicao {
  n: string;
  votos: number;
  pct: number;
  nome: string;
  partido: string;
  cor: string;
  eleito?: boolean;
  situacao?: string;
}

export interface AreaCalc {
  area: Area;
  validos: number;
  ranking: Posicao[];
  lider?: Posicao;
}

export function indiceCandidatos(lista: Candidato[]): Map<string, Candidato> {
  return new Map(lista.map((c) => [c.n, c]));
}

export function calcularArea(area: Area, cands: Map<string, Candidato>): AreaCalc {
  const soma = Object.values(area.votos).reduce((a, b) => a + b, 0);
  const validos = area.totais.validos && area.totais.validos >= soma ? area.totais.validos : soma;
  const locais = area.cands ? indiceCandidatos(area.cands) : null;
  const ranking: Posicao[] = Object.entries(area.votos)
    .map(([n, votos]) => {
      const c = locais?.get(n) ?? cands.get(n);
      return {
        n,
        votos,
        pct: validos ? (100 * votos) / validos : 0,
        nome: c?.nome ?? `Nº ${n}`,
        partido: c?.partido ?? "",
        cor: corPartido(c?.partido),
        eleito: c?.eleito,
        situacao: c?.situacao,
      };
    })
    .sort((a, b) => b.votos - a.votos);
  return { area, validos, ranking, lider: ranking[0]?.votos ? ranking[0] : undefined };
}

export function calcularTodas(d: Distribuicao): AreaCalc[] {
  const idx = indiceCandidatos(d.candidatos);
  return d.areas.map((a) => calcularArea(a, idx));
}

export function pctCandidato(ac: AreaCalc, n: string): number | undefined {
  const p = ac.ranking.find((r) => r.n === n);
  if (p) return p.pct;
  return ac.area.cands ? undefined : 0;
}

export function votosCandidato(ac: AreaCalc, n: string): number {
  return ac.ranking.find((r) => r.n === n)?.votos ?? 0;
}

/** Contagem de vitórias por candidato (para a legenda "venceu em N ..."). */
export function vitorias(calc: AreaCalc[]) {
  const m = new Map<string, { pos: Posicao; qtd: number; chave: string }>();
  for (const ac of calc) {
    if (!ac.lider) continue;
    // Em eleições municipais cada município tem candidatos diferentes: agrupa por partido
    const chave = ac.area.cands ? ac.lider.partido || ac.lider.nome : ac.lider.n;
    const atual = m.get(chave);
    if (atual) atual.qtd++;
    else m.set(chave, { pos: ac.lider, qtd: 1, chave });
  }
  return [...m.values()].sort((a, b) => b.qtd - a.qtd);
}
