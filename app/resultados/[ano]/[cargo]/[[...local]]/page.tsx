// Páginas de resultado com endereço amigável (ex.: /resultados/2026/presidente/sp).
// O resumo em texto vem pronto do servidor (bom para buscadores) e o mapa interativo carrega em seguida.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Explorador from "@/components/Explorador";
import { Carregando } from "@/components/Paineis";
import { eleicoesCache, municipiosCache, resultadoCache } from "@/lib/cache";
import { CAPITAIS, SITE_NOME, SITE_URL, eleicaoDaRota, lerRota, nomeLocal, slug, tituloResultado, ufsDoCargo, urlResultado } from "@/lib/seo";
import { CARGOS, Eleicao, MunicipioInfo, Resultado, fmtNum, fmtPct, titulo } from "@/lib/shared";

export const revalidate = 3600;

type Params = { ano: string; cargo: string; local?: string[] };

async function contexto(p: Params) {
  const rota = lerRota(p.ano, p.cargo, p.local);
  if (!rota) return null;
  const eleicoes = await eleicoesCache().catch(() => [] as Eleicao[]);
  const ele = eleicaoDaRota(eleicoes, rota);
  if (!ele) return null;
  let mun: MunicipioInfo | undefined;
  if (rota.munSlug && rota.uf !== "br") {
    const todos = await municipiosCache(ele.id).catch(() => ({}) as Record<string, MunicipioInfo[]>);
    mun = (todos[rota.uf] ?? []).find((m) => slug(m.nome) === rota.munSlug);
    if (!mun) return null;
  }
  return { rota, ele, eleicoes, mun };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const c = await contexto(await params);
  if (!c) return { title: "Resultado não encontrado" };
  const { rota, mun } = c;
  const munNome = mun ? titulo(mun.nome) : undefined;
  const t = tituloResultado(rota.ano, rota.cargo, rota.turno, rota.uf, munNome);
  const local = nomeLocal(rota.uf, munNome);
  const descricao = `Veja quem venceu a eleição para ${CARGOS[rota.cargo]?.nome.toLowerCase()} em ${local} em ${rota.ano}${rota.turno === 2 ? " (2º turno)" : ""}: votos e percentual de cada candidato, mapa interativo por ${rota.uf === "br" ? "estado e município" : mun ? "zona eleitoral" : "município"}, comparecimento, brancos e nulos. Dados oficiais do TSE.`;
  const url = urlResultado(rota.ano, rota.cargo, rota.uf, munNome, rota.turno);
  return {
    title: t,
    description: descricao,
    alternates: { canonical: url },
    keywords: [`eleição ${rota.ano}`, `resultado ${CARGOS[rota.cargo]?.nome.toLowerCase()} ${rota.ano}`, `apuração ${local}`, `votos ${local}`, "TSE", "mapa eleitoral"],
    openGraph: { title: t, description: descricao, url, type: "article", siteName: SITE_NOME, locale: "pt_BR" },
    twitter: { card: "summary_large_image", title: t, description: descricao },
  };
}

export default async function PaginaResultado({ params }: { params: Promise<Params> }) {
  const p = await params;
  const c = await contexto(p);
  if (!c) notFound();
  const { rota, ele, eleicoes, mun } = c;
  const munNome = mun ? titulo(mun.nome) : undefined;
  const abr = CARGOS[rota.cargo]?.abrangencia;
  const temResumo = abr === "br" || (rota.uf !== "br" && (abr !== "mun" || !!mun));
  const url = urlResultado(rota.ano, rota.cargo, rota.uf, munNome, rota.turno);

  // Navegação interna (ajuda o buscador a descobrir as outras páginas)
  const outrosTurnos = eleicoes.filter((e) => e.ano === rota.ano && e.cargos.includes(rota.cargo)).map((e) => e.turno);
  const outrosAnos = [...new Set(eleicoes.filter((e) => e.cargos.includes(rota.cargo) && e.turno === 1).map((e) => e.ano))].sort((a, b) => b - a);
  const outrosCargos = [...new Set(eleicoes.filter((e) => e.ano === rota.ano && e.turno === 1).flatMap((e) => e.cargos))].sort((a, b) => a - b);

  const migalhas = [
    { nome: "Início", url: "/" },
    { nome: "Resultados", url: "/resultados" },
    { nome: `${CARGOS[rota.cargo]?.nome} ${rota.ano}`, url: urlResultado(rota.ano, rota.cargo, abr === "mun" ? "sp" : "br", abr === "mun" ? "São Paulo" : undefined) },
    ...(rota.uf !== "br" && abr !== "mun" ? [{ nome: nomeLocal(rota.uf), url: urlResultado(rota.ano, rota.cargo, rota.uf, undefined, rota.turno) }] : []),
    ...(mun ? [{ nome: munNome!, url }] : []),
  ];

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: migalhas.map((m, i) => ({ "@type": "ListItem", position: i + 1, name: m.nome, item: `${SITE_URL}${m.url}` })),
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: tituloResultado(rota.ano, rota.cargo, rota.turno, rota.uf, munNome),
      description: `Votação por candidato para ${CARGOS[rota.cargo]?.nome.toLowerCase()} em ${nomeLocal(rota.uf, munNome)}, eleições ${rota.ano}.`,
      url: `${SITE_URL}${url}`,
      inLanguage: "pt-BR",
      temporalCoverage: String(rota.ano),
      spatialCoverage: { "@type": "Place", name: nomeLocal(rota.uf, munNome) },
      isAccessibleForFree: true,
      creator: { "@type": "GovernmentOrganization", name: "Tribunal Superior Eleitoral", url: "https://www.tse.jus.br" },
      license: "https://dadosabertos.tse.jus.br",
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="migalhas-seo" aria-label="Você está em">
        {migalhas.map((m, i) => (
          <span key={m.url + i}>
            {i > 0 && " › "}
            {i < migalhas.length - 1 ? <Link href={m.url}>{m.nome}</Link> : m.nome}
          </span>
        ))}
      </nav>

      <section className="cartao resumo-seo">
        <h1>{tituloResultado(rota.ano, rota.cargo, rota.turno, rota.uf, munNome)}</h1>
        {temResumo ? (
          <Suspense fallback={<p className="secundario">Carregando o resumo oficial do TSE…</p>}>
            <ResumoTexto ele={ele} cargo={rota.cargo} uf={rota.uf} mun={mun?.cd} local={nomeLocal(rota.uf, munNome)} />
          </Suspense>
        ) : (
          <p className="lead">
            Mapa com o 1º colocado em cada {rota.uf === "br" ? "estado" : "município"} na eleição para {CARGOS[rota.cargo]?.nome.toLowerCase()} de {rota.ano}.
          </p>
        )}

        {outrosTurnos.length > 1 && (
          <ul className="links-seo" aria-label="Turnos">
            {outrosTurnos.sort().map((t) => (
              <li key={t}>
                <Link href={urlResultado(rota.ano, rota.cargo, rota.uf, munNome, t)} aria-current={t === rota.turno ? "page" : undefined}>
                  {t}º turno
                </Link>
              </li>
            ))}
          </ul>
        )}
        {abr !== "mun" && (
          <ul className="links-seo" aria-label="Estados">
            {abr === "br" || rota.uf !== "br" ? (
              <li>
                <Link href={urlResultado(rota.ano, rota.cargo, "br", undefined, rota.turno)} aria-current={rota.uf === "br" ? "page" : undefined}>
                  Brasil
                </Link>
              </li>
            ) : null}
            {ufsDoCargo(rota.cargo).map((u) => (
              <li key={u.sigla}>
                <Link href={urlResultado(rota.ano, rota.cargo, u.sigla.toLowerCase(), undefined, rota.turno)} aria-current={rota.uf === u.sigla.toLowerCase() && !mun ? "page" : undefined}>
                  {u.sigla}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {abr === "mun" && (
          <ul className="links-seo" aria-label="Capitais">
            {Object.entries(CAPITAIS).map(([uf, nome]) => (
              <li key={uf}>
                <Link href={urlResultado(rota.ano, rota.cargo, uf, nome, rota.turno)} aria-current={munNome && slug(munNome) === slug(nome) ? "page" : undefined}>
                  {nome}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <ul className="links-seo" aria-label="Outros cargos e anos">
          {outrosCargos
            .filter((cg) => cg !== rota.cargo)
            .map((cg) => (
              <li key={cg}>
                <Link href={urlResultado(rota.ano, cg, CARGOS[cg]?.abrangencia === "br" ? "br" : rota.uf === "br" && CARGOS[cg]?.abrangencia === "mun" ? "sp" : rota.uf)}>
                  {CARGOS[cg]?.nome} {rota.ano}
                </Link>
              </li>
            ))}
          {outrosAnos
            .filter((a) => a !== rota.ano)
            .slice(0, 6)
            .map((a) => (
              <li key={a}>
                <Link href={urlResultado(a, rota.cargo, rota.uf)}>
                  {CARGOS[rota.cargo]?.nome} {a}
                </Link>
              </li>
            ))}
        </ul>
      </section>

      <Suspense fallback={<Carregando />}>
        <Explorador embutido padrao={{ ele: ele.id, cargo: rota.cargo, uf: abr === "mun" && rota.uf === "br" ? "sp" : rota.uf, mun: mun?.cd }} />
      </Suspense>
    </>
  );
}

async function ResumoTexto({ ele, cargo, uf, mun, local }: { ele: Eleicao; cargo: number; uf: string; mun?: string; local: string }) {
  let r: Resultado;
  try {
    r = (await resultadoCache(ele.id, cargo, uf, mun)).dados;
  } catch {
    return <p className="lead">Resultado oficial do TSE para {local}. Use o mapa abaixo para explorar os votos.</p>;
  }
  const [a, b] = r.candidatos;
  const t = r.totais;
  const segundo = r.candidatos.filter((c) => /2º/.test(c.situacao));
  const eleitos = r.candidatos.filter((c) => c.eleito);
  return (
    <>
      {a && (
        <p className="lead">
          <strong>{titulo(a.nome)}</strong> ({a.partido}) {eleitos.includes(a) ? "venceu" : "ficou em 1º lugar"} com <strong>{fmtPct(a.pct)}</strong> dos votos válidos
          ({fmtNum(a.votos)} votos)
          {b ? (
            <>
              , à frente de <strong>{titulo(b.nome)}</strong> ({b.partido}), com {fmtPct(b.pct)} ({fmtNum(b.votos)} votos)
            </>
          ) : null}
          .{segundo.length >= 2 ? ` ${segundo.map((c) => titulo(c.nome)).join(" e ")} disputam o 2º turno.` : ""}
          {eleitos.length > 1 ? ` Eleitos: ${eleitos.slice(0, 12).map((c) => titulo(c.nome)).join(", ")}${eleitos.length > 12 ? "…" : ""}.` : ""}
        </p>
      )}
      {t.eleitorado ? (
        <p className="secundario">
          Eleitorado: {fmtNum(t.eleitorado)} · comparecimento: {fmtNum(t.comparecimento)} ({fmtPct((100 * t.comparecimento) / t.eleitorado)}) · abstenção:{" "}
          {fmtPct((100 * t.abstencao) / t.eleitorado)} · brancos: {fmtNum(t.brancos)} · nulos: {fmtNum(t.nulos)}
          {t.secoesPct !== undefined && t.secoesPct < 100 ? ` · ${fmtPct(t.secoesPct)} das seções totalizadas` : ""}
        </p>
      ) : null}
      <details>
        <summary>Votação de todos os candidatos ({r.candidatos.length})</summary>
        <div className="rolagem-x">
          <table className="tabela compacta">
            <thead>
              <tr>
                <th>Candidato</th>
                <th>Partido</th>
                <th>Número</th>
                <th className="num">Votos</th>
                <th className="num">% válidos</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {r.candidatos.slice(0, 200).map((c) => (
                <tr key={c.n}>
                  <td>
                    <Link href={`/candidato?ele=${ele.id}&cargo=${cargo}&uf=${uf}${mun ? `&mun=${mun}` : ""}&n=${c.n}`}>{titulo(c.nome)}</Link>
                  </td>
                  <td>{c.partido}</td>
                  <td>{c.n}</td>
                  <td className="num">{fmtNum(c.votos)}</td>
                  <td className="num">{fmtPct(c.pct)}</td>
                  <td>{c.situacao || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

