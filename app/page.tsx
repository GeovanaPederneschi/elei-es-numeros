import { Suspense } from "react";
import Explorador from "@/components/Explorador";
import { Carregando } from "@/components/Paineis";

export default function Inicio() {
  return (
    <Suspense fallback={<Carregando />}>
      <Explorador />
    </Suspense>
  );
}
