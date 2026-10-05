import type { Metadata } from "next";
import Link from "next/link";
import { eleicoesCache } from "@/lib/cache";
import { CAPITAIS, urlResultado } from "@/lib/seo";
import { CARGOS, Eleicao } from "@/lib/shared";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Resultados de todas as eleições do Brasil",
  description:
    "Resultados oficiais das eleições brasileiras para presidente, governador, senador, deputados, prefeito e vereador, de 2000 a 2026, com mapas por estado, município e zona eleitoral.",
  alternates: { canonical: "/resultados" },
};

export default async function IndiceResultados() {
  const eleicoes = await eleicoesCache().catch(() => [] as Eleicao[]);
  const anos = [...new Set(eleicoes.map((e) => e.ano))].sort((a, b) => b - a);
  return (
    <>
      <header className="titulo-pagina">
        <h1>Resultados das eleições no Brasil</h1>
        <p className="secundario">Escolha o ano e o cargo. Todas as páginas têm mapa interativo e dados oficiais do TSE.</p>
      </header>
      <div className="indice-eleicoes">
        {anos.map((ano) => {
          const doAno = eleicoes.filter((e) => e.ano === ano);
          const cargos = [...new Set(doAno.flatMap((e) => e.cargos))].sort((a, b) => a - b);
          const municipal = doAno.some((e) => e.tipo === "municipal");
          return (
            <section key={ano} className="cartao">
              <h2>
                Eleições {municipal ? "municipais" : "gerais"} {ano}
              </h2>
              <ul className="links-seo">
                {cargos.map((c) => (
                  <li key={c}>
                    <Link href={urlResultado(ano, c, CARGOS[c]?.abrangencia === "mun" ? "sp" : "br", CARGOS[c]?.abrangencia === "mun" ? CAPITAIS.sp : undefined)}>
                      {CARGOS[c]?.nome}
                    </Link>
                  </li>
                ))}
                {doAno.some((e) => e.turno === 2) && (
                  <li>
                    <Link href={urlResultado(ano, municipal ? 11 : 1, municipal ? "sp" : "br", municipal ? CAPITAIS.sp : undefined, 2)}>2º turno</Link>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
