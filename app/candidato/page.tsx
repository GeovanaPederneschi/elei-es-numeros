import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PerfilCandidato from "@/components/PerfilCandidato";
import { Carregando } from "@/components/Paineis";
import { eleicoesCache, resultadoCache } from "@/lib/cache";
import { SITE_URL, nomeLocal, urlResultado } from "@/lib/seo";
import { CARGOS, Candidato, Eleicao, fmtNum, fmtPct, titulo } from "@/lib/shared";

type SP = Promise<Record<string, string | string[] | undefined>>;

async function dados(sp: Record<string, string | string[] | undefined>) {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const ele = s("ele");
  const cargo = +(s("cargo") ?? 1);
  const uf = (s("uf") ?? "br").toLowerCase();
  const mun = s("mun");
  const n = s("n");
  if (!ele || !n) return null;
  try {
    const [eleicoes, r] = await Promise.all([eleicoesCache(), resultadoCache(ele, cargo, uf, mun)]);
    const e = eleicoes.find((x) => x.id === ele) as Eleicao | undefined;
    const c = r.dados.candidatos.find((x) => x.n === n);
    if (!e || !c) return null;
    const pos = r.dados.candidatos.indexOf(c) + 1;
    return { e, c, cargo, uf, mun, pos, url: `/candidato?ele=${ele}&cargo=${cargo}&uf=${uf}${mun ? `&mun=${mun}` : ""}&n=${n}` };
  } catch {
    return null;
  }
}

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const d = await dados(await searchParams);
  if (!d) return { title: "Perfil do candidato", robots: { index: false } };
  const nome = titulo(d.c.nome);
  const t = `${nome} (${d.c.partido}): votos para ${CARGOS[d.cargo]?.nome.toLowerCase()} em ${d.e.ano}, onde foi mais votado e trajetória`;
  const desc = `${nome} teve ${fmtNum(d.c.votos)} votos (${fmtPct(d.c.pct)} dos válidos) para ${CARGOS[d.cargo]?.nome.toLowerCase()} em ${nomeLocal(d.uf)} em ${d.e.ano}${d.e.turno === 2 ? " (2º turno)" : ""}. Veja o mapa de votação por estado, município e zona, e a trajetória em outras eleições.`;
  return { title: t, description: desc, alternates: { canonical: d.url }, openGraph: { title: t, description: desc, url: d.url, type: "profile" } };
}

export default async function Pagina({ searchParams }: { searchParams: SP }) {
  const d = await dados(await searchParams);
  return (
    <>
      {d && <ResumoCandidato c={d.c} e={d.e} cargo={d.cargo} uf={d.uf} pos={d.pos} url={d.url} />}
      <Suspense fallback={<Carregando />}>
        <PerfilCandidato />
      </Suspense>
    </>
  );
}

/** Resumo em texto e dados estruturados do candidato, renderizados no servidor. */
function ResumoCandidato({ c, e, cargo, uf, pos, url }: { c: Candidato; e: Eleicao; cargo: number; uf: string; pos: number; url: string }) {
  const nome = titulo(c.nome);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: nome,
    url: `${SITE_URL}${url}`,
    affiliation: { "@type": "PoliticalParty", name: c.partido },
    description: `${nome} (${c.partido}), candidato a ${CARGOS[cargo]?.nome.toLowerCase()} em ${e.ano}: ${fmtNum(c.votos)} votos (${fmtPct(c.pct)}).`,
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p className="secundario resumo-candidato">
        {nome} ({c.partido}, nº {c.n}) ficou em {pos}º lugar na eleição para {CARGOS[cargo]?.nome.toLowerCase()} de {e.ano} em {nomeLocal(uf)}, com{" "}
        {fmtNum(c.votos)} votos ({fmtPct(c.pct)} dos válidos). Situação: {c.situacao || (c.eleito ? "eleito" : "não eleito")}.{" "}
        <Link href={urlResultado(e.ano, cargo, uf, undefined, e.turno)}>Ver o resultado completo</Link>.
      </p>
    </>
  );
}
