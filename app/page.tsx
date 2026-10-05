import Link from "next/link";
import { Suspense } from "react";
import Explorador from "@/components/Explorador";
import { Carregando } from "@/components/Paineis";
import { eleicoesCache } from "@/lib/cache";
import { CAPITAIS, urlResultado } from "@/lib/seo";
import { CARGOS, Eleicao } from "@/lib/shared";

export const revalidate = 3600;

export default async function Inicio() {
  const eleicoes = await eleicoesCache().catch(() => [] as Eleicao[]);
  const anos = [...new Set(eleicoes.map((e) => e.ano))].sort((a, b) => b - a).slice(0, 4);
  return (
    <>
      <Suspense fallback={<Carregando />}>
        <Explorador />
      </Suspense>
      <section className="cartao">
        <h2>Resultados das eleições no Brasil</h2>
        <p className="secundario">
          Acompanhe a apuração e os resultados oficiais do TSE para presidente, governador, senador, deputados, prefeito e vereador, com mapas interativos por
          estado, município, zona eleitoral e exterior. Compare eleições e veja a trajetória de cada candidato.
        </p>
        {anos.map((ano) => {
          const doAno = eleicoes.filter((e) => e.ano === ano && e.turno === 1);
          const cargos = [...new Set(doAno.flatMap((e) => e.cargos))].sort((a, b) => a - b);
          return (
            <ul key={ano} className="links-seo" aria-label={`Eleições ${ano}`}>
              {cargos.map((c) => {
                const mun = CARGOS[c]?.abrangencia === "mun";
                return (
                  <li key={c}>
                    <Link href={urlResultado(ano, c, mun ? "sp" : "br", mun ? CAPITAIS.sp : undefined)}>
                      {CARGOS[c]?.nome} {ano}
                    </Link>
                  </li>
                );
              })}
            </ul>
          );
        })}
        <p>
          <Link href="/resultados">Ver todas as eleições →</Link>
        </p>
      </section>
    </>
  );
}
