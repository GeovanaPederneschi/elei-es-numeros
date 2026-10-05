import { Suspense } from "react";
import BuscaCandidatos from "@/components/BuscaCandidatos";
import { Carregando } from "@/components/Paineis";

export default function Pagina() {
  return (
    <Suspense fallback={<Carregando />}>
      <BuscaCandidatos />
    </Suspense>
  );
}
