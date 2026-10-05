import type { Metadata } from "next";
import { Suspense } from "react";
import Comparador from "@/components/Comparador";
import { Carregando } from "@/components/Paineis";

export const metadata: Metadata = {
  title: "Comparar eleições: quanto cada candidato cresceu ou caiu",
  description: "Compare o desempenho de candidatos e partidos entre duas eleições, estado a estado e município a município, em pontos percentuais. Ex.: Lula 2022 x 2026.",
  alternates: { canonical: "/comparar" },
  openGraph: { title: "Comparar eleições: quanto cada candidato cresceu ou caiu", description: "Compare o desempenho de candidatos e partidos entre duas eleições, estado a estado e município a município, em pontos percentuais. Ex.: Lula 2022 x 2026.", url: "/comparar" },
};

export default function Pagina() {
  return (
    <Suspense fallback={<Carregando />}>
      <Comparador />
    </Suspense>
  );
}
