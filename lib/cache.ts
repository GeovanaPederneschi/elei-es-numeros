// Cache persistente (Data Cache da Vercel, compartilhado entre instâncias e deploys).
// O tempo de vida depende do estado da apuração (ver ttlEleicao).

import { unstable_cache } from "next/cache";
import { resumoUF } from "./dadosabertos";
import { distribuicao, listarEleicoes, municipios, obterEleicao, resultado, ttlEleicao, MOCK, OpcoesDistribuicao } from "./tse";

const VERSAO = "v3"; // mude para invalidar tudo após alterar os parsers

function guardar<T>(chave: string[], ttl: number, fn: () => Promise<T>): Promise<T> {
  if (MOCK) return fn();
  return unstable_cache(fn, [VERSAO, ...chave], { revalidate: ttl, tags: ["tse"] })();
}

export async function eleicoesCache() {
  return guardar(["eleicoes"], 600, listarEleicoes);
}

export async function resultadoCache(ele: string, cargo: number, uf: string, mun?: string) {
  const ttl = await ttlEleicao(await obterEleicao(ele));
  return { ttl, dados: await guardar(["resultado", ele, String(cargo), uf, mun ?? ""], ttl, () => resultado(ele, cargo, uf, mun)) };
}

export async function distribuicaoCache(ele: string, cargo: number, uf: string, mun: string | undefined, opts: OpcoesDistribuicao) {
  const ttl = await ttlEleicao(await obterEleicao(ele));
  const chave = ["distribuicao", ele, String(cargo), uf, mun ?? "", opts.nivel ?? "", String(opts.top ?? ""), (opts.manter ?? []).join(",")];
  return { ttl, dados: await guardar(chave, ttl, () => distribuicao(ele, cargo, uf, mun, opts)) };
}

export async function municipiosCache(ele: string) {
  return guardar(["municipios", ele], 60 * 60 * 24, () => municipios(ele));
}

/** Resumo de todos os candidatos de uma UF num ano antigo (dados abertos): muda nunca, cache longo. */
export async function resumoUFCache(ano: number, uf: string) {
  return guardar(["resumo-uf", String(ano), uf.toLowerCase()], 60 * 60 * 24 * 30, () => resumoUF(ano, uf));
}
