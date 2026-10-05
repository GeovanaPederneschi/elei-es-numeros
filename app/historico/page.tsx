import { Suspense } from "react";
import Historico from "@/components/Historico";
import { Carregando } from "@/components/Paineis";

export default function Pagina() {
  return (
    <Suspense fallback={<Carregando />}>
      <Historico />
    </Suspense>
  );
}
