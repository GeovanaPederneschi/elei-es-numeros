import { Suspense } from "react";
import PerfilCandidato from "@/components/PerfilCandidato";
import { Carregando } from "@/components/Paineis";

export default function Pagina() {
  return (
    <Suspense fallback={<Carregando />}>
      <PerfilCandidato />
    </Suspense>
  );
}
