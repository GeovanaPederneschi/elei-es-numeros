"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { eleicaoPadrao, useEleicoes } from "./Explorador";
import { Carregando, Erro, ListaCandidatos } from "./Paineis";
import { BuscaMunicipio, SeletorEleicao, SeletorUF } from "./Seletores";
import Trajetoria from "./Trajetoria";
import { qs, useApi } from "@/lib/cliente";
import { CARGOS, Resultado, nomeUF } from "@/lib/shared";

export default function BuscaCandidatos() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { dados: eleicoes, erro } = useEleicoes();
  const [nome, setNome] = useState(sp.get("q") ?? "");
  const [ufNome, setUfNome] = useState("");
  const ir = useCallback(
    (m: Record<string, string | number | undefined>) => router.push(`${pathname}?${qs({ ...Object.fromEntries(sp.entries()), ...m })}`, { scroll: false }),
    [sp, router, pathname]
  );

  const cargoP = sp.get("cargo") ? +sp.get("cargo")! : 1;
  const ele = eleicoes?.find((e) => e.id === sp.get("ele")) ?? (eleicoes ? eleicaoPadrao(eleicoes, cargoP) ?? eleicoes[0] : undefined);
  const cargo = ele && ele.cargos.includes(cargoP) ? cargoP : ele?.cargos[0] ?? 1;
  const abr = CARGOS[cargo]?.abrangencia;
  let uf = (sp.get("uf") ?? (abr === "br" ? "br" : "sp")).toLowerCase();
  if (abr !== "br") uf = uf === "br" || uf === "zz" ? "sp" : uf;
  else uf = "br";
  const mun = abr === "mun" ? sp.get("mun") || undefined : undefined;
  const pronto = ele && (abr !== "mun" || mun);
  const resumo = useApi<Resultado>(pronto ? `/api/resultado?${qs({ ele: ele!.id, cargo, uf, mun })}` : null);
  const q = sp.get("q") ?? "";

  if (erro) return <Erro msg={erro} />;
  if (!eleicoes || !ele) return <Carregando />;

  const perfil = (c: { n: string; nome: string }) => `/candidato?${qs({ ele: ele.id, cargo, uf, mun, n: c.n, nome: c.nome })}`;

  return (
    <div className="candidatos-pagina">
      <header className="titulo-pagina">
        <h1>Candidatos</h1>
        <p className="secundario">Encontre um candidato para ver onde foi mais votado (estado, município, zona e exterior) e a trajetória dele.</p>
      </header>

      <section className="cartao">
        <h2>Buscar pelo nome em todas as eleições</h2>
        <form
          className="seletores"
          onSubmit={(e) => {
            e.preventDefault();
            ir({ q: nome.trim() || undefined });
          }}
        >
          <label className="campo cresce">
            <span>Nome de urna</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Lula, Tarcísio, Boulos, Simone Tebet" />
          </label>
          <SeletorUF uf={ufNome || "br"} incluirBrasil onMudar={(u) => setUfNome(u === "br" ? "" : u)} />
          <button className="botao" type="submit">
            Buscar
          </button>
        </form>
        {q && <Trajetoria key={q + ufNome} nome={q} uf={ufNome || undefined} />}
      </section>

      <section className="cartao">
        <h2>Navegar pela lista de candidatos</h2>
        <SeletorEleicao eleicoes={eleicoes} ele={ele} cargo={cargo} onMudar={(e, c) => ir({ ele: e.id, cargo: c })} />
        <div className="seletores">
          {abr !== "br" && <SeletorUF uf={uf} cargo={cargo} onMudar={(u) => ir({ uf: u, mun: undefined })} />}
          {abr === "mun" && <BuscaMunicipio ele={ele.id} uf={uf} mun={mun} onMudar={(m) => ir({ mun: m?.cd })} />}
        </div>
        {!pronto ? (
          <div className="aviso">Escolha um município para ver os candidatos a {CARGOS[cargo]?.nome.toLowerCase()}.</div>
        ) : resumo.erro ? (
          <Erro msg={resumo.erro} />
        ) : !resumo.dados ? (
          <Carregando />
        ) : (
          <>
            <p className="secundario">
              {resumo.dados.candidatos.length} candidatos a {CARGOS[cargo]?.nome.toLowerCase()} em {abr === "br" ? "todo o Brasil" : nomeUF(uf)}. Clique para abrir o perfil.
            </p>
            <ListaCandidatos candidatos={resumo.dados.candidatos} onSelecionar={(c) => router.push(perfil(c))} limite={30} />
          </>
        )}
      </section>
    </div>
  );
}
