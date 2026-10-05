"use client";

// Página principal de resultados: seletores + mapa interativo + painel lateral.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import MapaAreas from "./MapaAreas";
import {
  BarraApuracao,
  BlocoTotais,
  Carregando,
  Erro,
  LegendaLider,
  LegendaSequencial,
  ListaCandidatos,
  TabelaAreas,
  pinturaCandidato,
  pinturaLider,
} from "./Paineis";
import { BuscaMunicipio, SeletorEleicao, SeletorUF } from "./Seletores";
import { AreaCalc, calcularTodas } from "@/lib/analise";
import { qs, useApi, useDistribuicao } from "@/lib/cliente";
import { degrausSequenciais } from "@/lib/cores";
import { CARGOS, Distribuicao, Eleicao, MunicipioInfo, Resultado, corPartido, fmtNum, fmtPct, nomeUF, titulo } from "@/lib/shared";

export function useEleicoes() {
  return useApi<Eleicao[]>("/api/eleicoes");
}

export function eleicaoPadrao(lista: Eleicao[], cargo?: number): Eleicao | undefined {
  const comCargo = lista.filter((e) => !cargo || e.cargos.includes(cargo));
  const anoMax = Math.max(...comCargo.map((e) => e.ano));
  return comCargo.filter((e) => e.ano === anoMax).sort((a, b) => a.turno - b.turno)[0];
}

export default function Explorador() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { dados: eleicoes, erro: erroEle } = useEleicoes();

  const ir = useCallback(
    (mudancas: Record<string, string | number | undefined>) => {
      const atual: Record<string, string | undefined> = Object.fromEntries(sp.entries());
      const novo = { ...atual, ...mudancas } as Record<string, string | number | undefined>;
      router.push(`${pathname}?${qs(novo)}`, { scroll: false });
    },
    [sp, router, pathname]
  );

  if (erroEle) return <Erro msg={erroEle} />;
  if (!eleicoes) return <Carregando texto="Carregando eleições disponíveis…" />;
  if (!eleicoes.length) return <Erro msg="Nenhuma eleição disponível." />;

  const cargoParam = sp.get("cargo") ? +sp.get("cargo")! : undefined;
  const ele = eleicoes.find((e) => e.id === sp.get("ele")) ?? eleicaoPadrao(eleicoes, cargoParam ?? 1) ?? eleicoes[0];
  const cargo = cargoParam && ele.cargos.includes(cargoParam) ? cargoParam : ele.cargos[0];
  const abr = CARGOS[cargo]?.abrangencia ?? "uf";
  let uf = (sp.get("uf") || (abr === "mun" ? "sp" : "br")).toLowerCase();
  if (abr === "mun" && (uf === "br" || uf === "zz")) uf = "sp";
  if (abr !== "br" && uf === "zz") uf = "br";
  const mun = sp.get("mun") || undefined;
  const nivelBR = sp.get("nivel") === "mun" ? "mun" : undefined;
  const cand = sp.get("cand") || undefined;

  return (
    <Painel
      key={`${ele.id}-${cargo}`}
      eleicoes={eleicoes}
      ele={ele}
      cargo={cargo}
      uf={uf}
      mun={mun}
      nivelBR={nivelBR}
      cand={cand}
      ir={ir}
    />
  );
}

function Painel({
  eleicoes,
  ele,
  cargo,
  uf,
  mun,
  nivelBR,
  cand,
  ir,
}: {
  eleicoes: Eleicao[];
  ele: Eleicao;
  cargo: number;
  uf: string;
  mun?: string;
  nivelBR?: "mun";
  cand?: string;
  ir: (m: Record<string, string | number | undefined>) => void;
}) {
  const abr = CARGOS[cargo]?.abrangencia ?? "uf";
  const temResumo = abr === "br" || (uf !== "br" && (abr !== "mun" || !!mun));
  const resumo = useApi<Resultado>(temResumo ? `/api/resultado?${qs({ ele: ele.id, cargo, uf, mun })}` : null);
  const nivelPedido = uf === "br" && abr === "br" ? nivelBR : undefined;
  const dist = useDistribuicao<Distribuicao>({ ele: ele.id, cargo, uf, mun, nivel: nivelPedido, n: cand });
  const munInfo = useApi<Record<string, MunicipioInfo[]>>(mun && uf !== "br" ? `/api/municipios?ele=${ele.id}&uf=${uf}` : null);
  const nomeMun = munInfo.dados?.[uf]?.find((m) => m.cd === mun)?.nome;

  const calc = useMemo(() => (dist.dados ? calcularTodas(dist.dados) : []), [dist.dados]);
  const candidatos = resumo.dados?.candidatos ?? [];
  const candSel = cand ? candidatos.find((c) => c.n === cand) : undefined;
  const porArea = calc.some((c) => c.area.cands);

  const pintura = useMemo(() => {
    if (candSel && !porArea) {
      const max = Math.max(...calc.map((ac) => ac.ranking.find((r) => r.n === candSel.n)?.pct ?? 0), 1);
      return { p: pinturaCandidato(candSel.n, corPartido(candSel.partido), degrausSequenciais(max)), degraus: degrausSequenciais(max) };
    }
    return { p: pinturaLider() };
  }, [candSel, porArea, calc]);

  const nivel = dist.dados?.nivel;
  const unidade = nivel === "uf" ? "estados" : nivel === "zona" ? "zonas" : nivel === "exterior" ? "cidades" : "municípios";
  const rotuloArea = nivel === "uf" ? "Estado" : nivel === "zona" ? "Zona" : nivel === "exterior" ? "Cidade" : "Município";

  const selecionar = (ac: AreaCalc) => {
    if (nivel === "uf") ir({ uf: ac.area.cd, mun: undefined, nivel: undefined });
    else if (nivel === "mun" || nivel === "exterior") ir({ uf: ac.area.uf ?? uf, mun: ac.area.cd, nivel: undefined });
  };
  const podeSelecionar = () => nivel !== "zona";

  const local = mun ? `${titulo(nomeMun ?? "Município")}${uf === "zz" ? " (exterior)" : ` · ${uf.toUpperCase()}`}` : nomeUF(uf);
  const exterior = abr === "br" && uf === "br" && nivel === "uf" ? calc.find((c) => c.area.cd === "zz") : undefined;
  const calcMapa = exterior ? calc.filter((c) => c !== exterior) : calc;
  const perfil = (c: { n: string; nome: string }) =>
    `/candidato?${qs({ ele: ele.id, cargo, uf: abr === "br" ? "br" : uf, mun: abr === "mun" ? mun : undefined, n: c.n, nome: c.nome })}`;

  return (
    <div className="explorador">
      <section className="barra-filtros">
        <SeletorEleicao eleicoes={eleicoes} ele={ele} cargo={cargo} onMudar={(e, c) => ir({ ele: e.id, cargo: c, cand: undefined, mun: CARGOS[c]?.abrangencia === "mun" ? mun : undefined })} />
        <div className="seletores">
          <SeletorUF
            uf={uf}
            cargo={cargo}
            incluirBrasil={abr !== "mun"}
            incluirExterior={abr === "br"}
            onMudar={(u) => ir({ uf: u, mun: undefined, nivel: undefined })}
          />
          {uf !== "br" && <BuscaMunicipio ele={ele.id} uf={uf} mun={mun} rotulo={uf === "zz" ? "Cidade" : "Município"} onMudar={(m) => ir({ mun: m?.cd })} />}
        </div>
      </section>

      <nav className="migalhas" aria-label="Navegação por abrangência">
        {abr !== "mun" && (
          <button type="button" className="link" onClick={() => ir({ uf: "br", mun: undefined })} disabled={uf === "br"}>
            Brasil
          </button>
        )}
        {uf !== "br" && (
          <>
            {abr !== "mun" && <span>›</span>}
            <button type="button" className="link" onClick={() => ir({ mun: undefined })} disabled={!mun}>
              {nomeUF(uf)}
            </button>
          </>
        )}
        {mun && (
          <>
            <span>›</span>
            <span>{titulo(nomeMun ?? mun)}</span>
          </>
        )}
      </nav>

      <header className="titulo-resultado">
        <div>
          <p className="sobretitulo">
            {ele.ano} · {ele.turno}º turno {ele.recente ? <span className="ao-vivo">dados do TSE</span> : null}
          </p>
          <h1>
            {CARGOS[cargo]?.nome} — {local}
          </h1>
        </div>
        {abr === "br" && uf === "br" && (
          <div className="segmentado" role="group" aria-label="Detalhamento do mapa">
            <button type="button" aria-pressed={!nivelBR} onClick={() => ir({ nivel: undefined })}>
              Por estado
            </button>
            <button type="button" aria-pressed={nivelBR === "mun"} onClick={() => ir({ nivel: "mun" })}>
              Por município
            </button>
          </div>
        )}
      </header>

      <div className="grade-resultado">
        <section className="cartao cartao-mapa" aria-label="Mapa">
          {dist.erro ? (
            <Erro msg={dist.erro} dica="Talvez o TSE ainda não tenha publicado este recorte (ex.: 2º turno ainda não realizado)." />
          ) : !dist.dados ? (
            <Carregando texto={nivelBR === "mun" ? "Carregando os 5.570 municípios…" : undefined} />
          ) : dist.dados.aviso ? (
            <div className="aviso">{dist.dados.aviso}</div>
          ) : (
            <>
              <div className="mapa-cabecalho">
                <small className="secundario">
                  {candSel ? (
                    <>
                      Colorido pelo desempenho de <b>{titulo(candSel.nome)}</b>.{" "}
                      <button type="button" className="link" onClick={() => ir({ cand: undefined })}>
                        Voltar para “quem venceu”
                      </button>
                    </>
                  ) : porArea ? (
                    "Cor do partido do 1º colocado em cada local. Clique para ver o detalhe."
                  ) : (
                    "Cor de quem venceu em cada local. Clique em um candidato ao lado para ver só o desempenho dele."
                  )}
                </small>
              </div>
              <MapaAreas
                calc={calcMapa}
                nivel={dist.dados.nivel}
                uf={uf}
                pintura={pintura.p}
                destaque={cand}
                onSelecionar={selecionar}
                podeSelecionar={podeSelecionar}
              />
              {candSel && pintura.degraus ? (
                <LegendaSequencial cor={corPartido(candSel.partido)} degraus={pintura.degraus} nome={titulo(candSel.nome)} />
              ) : (
                <LegendaLider calc={calcMapa} unidade={unidade} />
              )}
              {exterior && (
                <button type="button" className="cartao-exterior" onClick={() => ir({ uf: "zz", mun: undefined })}>
                  <span>🌎 Votos no exterior</span>
                  <span>
                    {exterior.lider ? (
                      <>
                        <i className="bolinha" style={{ background: exterior.lider.cor }} /> {titulo(exterior.lider.nome)} {fmtPct(exterior.lider.pct)}
                      </>
                    ) : null}{" "}
                    · {fmtNum(exterior.area.totais.comparecimento)} votantes →
                  </span>
                </button>
              )}
            </>
          )}
        </section>

        <aside className="cartao cartao-lateral" aria-label="Resultado">
          {temResumo ? (
            resumo.erro ? (
              <Erro msg={resumo.erro} />
            ) : !resumo.dados ? (
              <Carregando />
            ) : (
              <>
                <BarraApuracao t={resumo.dados.totais} />
                <ListaCandidatos
                  candidatos={candidatos}
                  selecionado={cand}
                  onSelecionar={porArea ? undefined : (c) => ir({ cand: cand === c.n ? undefined : c.n })}
                  linkPerfil={perfil}
                />
                <BlocoTotais t={resumo.dados.totais} />
              </>
            )
          ) : (
            <ResumoPorArea calc={calc} unidade={unidade} perfil={perfil} abr={abr} />
          )}
        </aside>
      </div>

      {dist.dados && calc.length > 0 && (
        <section className="cartao">
          <h2>Resultado por {rotuloArea.toLowerCase()}</h2>
          <TabelaAreas
            calc={calc}
            rotuloArea={rotuloArea}
            destaque={candSel && !porArea ? { n: candSel.n, nome: candSel.nome } : undefined}
            onSelecionar={nivel !== "zona" ? selecionar : undefined}
          />
        </section>
      )}
    </div>
  );
}

/** Quando cada área tem seus próprios candidatos (ex.: governadores no mapa do Brasil, prefeitos no mapa do estado). */
function ResumoPorArea({ calc, unidade, perfil, abr }: { calc: AreaCalc[]; unidade: string; perfil: (c: { n: string; nome: string }) => string; abr: string }) {
  if (!calc.length) return <Carregando />;
  const porPartido = new Map<string, number>();
  for (const ac of calc) if (ac.lider) porPartido.set(ac.lider.partido || "?", (porPartido.get(ac.lider.partido || "?") ?? 0) + 1);
  const partidos = [...porPartido.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...partidos.map((p) => p[1]));
  return (
    <div>
      <h2>1º colocado por partido</h2>
      <p className="secundario">Número de {unidade} em que cada partido ficou em 1º lugar.</p>
      <ol className="barras-partido">
        {partidos.map(([p, q]) => (
          <li key={p}>
            <span className="rotulo">{p}</span>
            <span className="barra">
              <span style={{ width: `${(100 * q) / max}%`, background: corPartido(p) }} />
            </span>
            <b>{q}</b>
          </li>
        ))}
      </ol>
      {abr === "uf" && (
        <>
          <h3>Mais votados em cada estado</h3>
          <ul className="lista-simples">
            {calc
              .slice()
              .sort((a, b) => a.area.nome.localeCompare(b.area.nome))
              .map((ac) =>
                ac.lider ? (
                  <li key={ac.area.cd}>
                    <span>{ac.area.nome}</span>
                    <Link href={perfil(ac.lider).replace("uf=br", `uf=${ac.area.cd}`)}>
                      <i className="bolinha" style={{ background: ac.lider.cor }} /> {titulo(ac.lider.nome)} <small>{ac.lider.partido}</small>
                    </Link>
                  </li>
                ) : null
              )}
          </ul>
        </>
      )}
    </div>
  );
}
