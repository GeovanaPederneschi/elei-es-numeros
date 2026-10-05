// Trajetória em eleições antigas (dados abertos do TSE): um ano por requisição,
// para que o navegador busque vários anos em paralelo.

import { ok, falha, params, exigir } from "@/lib/api";
import { APELIDOS } from "@/data/presidente-historico";
import { resumoUFCache } from "@/lib/cache";
import { situacaoLegivel } from "@/lib/dadosabertos";
import { listarEleicoes } from "@/lib/tse";
import { CARGOS, Trajetoria, normalizar } from "@/lib/shared";

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const sp = params(req);
    exigir(sp, "nome", "uf", "ano");
    const ano = +sp.get("ano")!;
    const uf = sp.get("uf")!.toLowerCase();
    const mun = sp.get("mun") || undefined;
    const n = normalizar(sp.get("nome")!);
    const nomes = new Set([n]);
    for (const lista of Object.values(APELIDOS)) if (lista.some((x) => normalizar(x) === n)) lista.forEach((x) => nomes.add(normalizar(x)));

    const linhas = await resumoUFCache(ano, uf);
    const eleicoes = (await listarEleicoes()).filter((e) => e.ano === ano);
    const idDe = (turno: number, cargo: number) => eleicoes.find((e) => e.turno === turno && e.cargos.includes(cargo))?.id;

    const itens: Trajetoria[] = [];
    for (const [turno, cargo, m, munNome, num, nome, partido, votos, pct, sit] of linhas) {
      if (!nomes.has(normalizar(nome))) continue;
      if (!CARGOS[cargo]) continue;
      // prefeitos/vereadores: só no município pedido (evita homônimos de outras cidades)
      if (cargo >= 11 && mun && m !== mun.padStart(5, "0")) continue;
      if (cargo >= 11 && !mun) continue;
      const s = situacaoLegivel(sit);
      itens.push({ ano, turno, eleicao: idDe(turno, cargo), cargo, uf, mun: m || undefined, munNome: munNome || undefined, n: num, nome, partido, votos, pct, situacao: s.situacao, eleito: s.eleito, fonte: "historico" });
    }
    return ok({ ano, itens }, 60 * 60 * 24 * 7);
  } catch (e) {
    return falha(e);
  }
}
