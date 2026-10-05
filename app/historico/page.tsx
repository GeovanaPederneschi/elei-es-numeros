import type { Metadata } from "next";
import { Suspense } from "react";
import Historico from "@/components/Historico";
import { Carregando } from "@/components/Paineis";

export const metadata: Metadata = {
  title: "Histórico das eleições presidenciais desde 1989",
  description: "Todos os resultados das eleições para presidente do Brasil desde 1989: Collor, FHC, Lula, Dilma, Bolsonaro. Votos, percentuais, 1º e 2º turno e a evolução de cada candidato e partido.",
  alternates: { canonical: "/historico" },
  openGraph: { title: "Histórico das eleições presidenciais desde 1989", description: "Todos os resultados das eleições para presidente do Brasil desde 1989: Collor, FHC, Lula, Dilma, Bolsonaro. Votos, percentuais, 1º e 2º turno e a evolução de cada candidato e partido.", url: "/historico" },
};

export default function Pagina() {
  return (
    <Suspense fallback={<Carregando />}>
      <Historico />
    </Suspense>
  );
}
