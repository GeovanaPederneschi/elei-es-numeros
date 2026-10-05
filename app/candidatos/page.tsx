import type { Metadata } from "next";
import { Suspense } from "react";
import BuscaCandidatos from "@/components/BuscaCandidatos";
import { Carregando } from "@/components/Paineis";

export const metadata: Metadata = {
  title: "Candidatos: busca, votos e trajetória",
  description: "Busque qualquer candidato e veja onde foi mais votado — por estado, município, zona eleitoral e exterior — e a trajetória em todas as eleições, com a variação em pontos percentuais.",
  alternates: { canonical: "/candidatos" },
  openGraph: { title: "Candidatos: busca, votos e trajetória", description: "Busque qualquer candidato e veja onde foi mais votado — por estado, município, zona eleitoral e exterior — e a trajetória em todas as eleições, com a variação em pontos percentuais.", url: "/candidatos" },
};

export default function Pagina() {
  return (
    <Suspense fallback={<Carregando />}>
      <BuscaCandidatos />
    </Suspense>
  );
}
