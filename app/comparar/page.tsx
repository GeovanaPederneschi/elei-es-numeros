import { Suspense } from "react";
import Comparador from "@/components/Comparador";
import { Carregando } from "@/components/Paineis";

export default function Pagina() {
  return (
    <Suspense fallback={<Carregando />}>
      <Comparador />
    </Suspense>
  );
}
