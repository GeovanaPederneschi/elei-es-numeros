import type { MetadataRoute } from "next";
import { eleicoesCache, resultadoCache } from "@/lib/cache";
import { CAPITAIS, SITE_URL, ufsDoCargo, urlResultado } from "@/lib/seo";
import { CARGOS, Eleicao } from "@/lib/shared";

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const itens: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/resultados`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/historico`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/candidatos`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/comparar`, changeFrequency: "weekly", priority: 0.6 },
  ];
  const eleicoes = await eleicoesCache().catch(() => [] as Eleicao[]);
  const vistos = new Set<string>();
  const add = (path: string, ano: number, prioridade: number) => {
    if (vistos.has(path)) return;
    vistos.add(path);
    itens.push({
      url: `${SITE_URL}${path}`,
      changeFrequency: ano >= anoAtual ? "daily" : "yearly",
      priority: Math.max(0.3, prioridade - (anoAtual - ano) * 0.03),
    });
  };
  for (const e of eleicoes) {
    for (const cargo of e.cargos) {
      const abr = CARGOS[cargo]?.abrangencia;
      if (abr === "mun") {
        for (const [uf, nome] of Object.entries(CAPITAIS)) add(urlResultado(e.ano, cargo, uf, nome, e.turno), e.ano, 0.7);
        continue;
      }
      add(urlResultado(e.ano, cargo, "br", undefined, e.turno), e.ano, 0.85);
      for (const u of ufsDoCargo(cargo)) add(urlResultado(e.ano, cargo, u.sigla.toLowerCase(), undefined, e.turno), e.ano, 0.7);
    }
  }
  // Perfis dos candidatos a presidente da eleição mais recente
  const recente = eleicoes.filter((e) => e.cargos.includes(1)).sort((a, b) => b.ano - a.ano || a.turno - b.turno)[0];
  if (recente) {
    try {
      const r = (await resultadoCache(recente.id, 1, "br")).dados;
      for (const c of r.candidatos)
        itens.push({ url: `${SITE_URL}/candidato?ele=${recente.id}&cargo=1&uf=br&n=${c.n}`, changeFrequency: "daily", priority: 0.6 });
    } catch {}
  }
  return itens;
}
