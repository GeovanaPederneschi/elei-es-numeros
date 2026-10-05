"use client";

// Compara o desempenho de um candidato (ou de dois candidatos) entre duas eleições,
// local a local, em pontos percentuais — com mapa divergente.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import MapaAreas, { Pintura } from "./MapaAreas";
import { eleicaoPadrao, useEleicoes } from "./Explorador";
import { Carregando, Erro, LegendaDivergente, TabelaAreas } from "./Paineis";
import { BuscaMunicipio, SeletorUF } from "./Seletores";
import { AreaCalc, calcularTodas, pctCandidato, votosCandidato } from "@/lib/analise";
import { qs, useApi, useDistribuicao } from "@/lib/cliente";
import { SEM_DADOS, corDivergente } from "@/lib/cores";
import { CARGOS, Candidato, Distribuicao, Eleicao, Resultado, corPartido, fmtNum, fmtPct, fmtPP, normalizar, nomeUF, rotuloEleicao, titulo } from "@/lib/shared";

export default function Comparador() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { dados: eleicoes, erro } = useEleicoes();
  const ir = useCallback(
    (m: Record<string, string | number | undefined>) => {
      const novo = { ...Object.fromEntries(sp.entries()), ...m };
      router.push(`${pathname}?${qs(novo)}`, { scroll: false });
    },
    [sp, router, pathname]
  );

  if (erro) return <Erro msg={erro} />;
  if (!eleicoes) return <Carregando />;

  const cargo = +(sp.get("cargo") ?? 1);
  const comCargo = eleicoes.filter((e) => e.cargos.includes(cargo));
  const ordenadas = [...comCargo].sort((a, b) => a.ano - b.ano || a.turno - b.turno);
  const ultima = eleicaoPadrao(eleicoes, cargo) ?? ordenadas[ordenadas.length - 1];
  const anteriores = ordenadas.filter((e) => e.ano < (ultima?.ano ?? 0) && e.turno === ultima?.turno);
  const padraoA = anteriores[anteriores.length - 1] ?? ordenadas[0];
  const A = comCargo.find((e) => e.id === sp.get("a")) ?? padraoA;
  const B = comCargo.find((e) => e.id === sp.get("b")) ?? (ultima?.id !== A?.id ? ultima : ordenadas[ordenadas.length - 1]);
  if (!A || !B) return <Erro msg="Não há eleições suficientes para comparar este cargo." />;

  const abr = CARGOS[cargo]?.abrangencia;
  let uf = (sp.get("uf") ?? (abr === "br" ? "br" : "sp")).toLowerCase();
  if (abr !== "br" && uf === "br") uf = "sp";
  const mun = abr === "mun" ? sp.get("mun") || undefined : sp.get("mun") || undefined;
  const nivel = uf === "br" && sp.get("nivel") === "mun" ? "mun" : undefined;

  const cargosDisp = [...new Set(eleicoes.flatMap((e) => e.cargos))].filter((c) => eleicoes.filter((e) => e.cargos.includes(c)).length >= 2).sort((a, b) => a - b);

  return (
    <div className="comparar">
      <header className="titulo-pagina">
        <h1>Comparar eleições</h1>
        <p className="secundario">Quanto um candidato (ou partido) cresceu ou caiu entre duas eleições — no total e em cada estado, município ou zona.</p>
      </header>

      <section className="cartao barra-filtros">
        <div className="seletores">
          <div className="segmentado cargos" role="group" aria-label="Cargo">
            {cargosDisp.map((c) => (
              <button key={c} type="button" aria-pressed={c === cargo} onClick={() => ir({ cargo: c, a: undefined, b: undefined, na: undefined, nb: undefined, mun: undefined, uf: undefined })}>
                {CARGOS[c]?.nome}
              </button>
            ))}
          </div>
        </div>
        <div className="seletores">
          <label className="campo">
            <span>Eleição A</span>
            <select value={A.id} onChange={(e) => ir({ a: e.target.value, na: undefined })}>
              {ordenadas.map((e) => (
                <option key={e.id} value={e.id}>
                  {rotuloEleicao(e)}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Eleição B</span>
            <select value={B.id} onChange={(e) => ir({ b: e.target.value, nb: undefined })}>
              {ordenadas.map((e) => (
                <option key={e.id} value={e.id}>
                  {rotuloEleicao(e)}
                </option>
              ))}
            </select>
          </label>
          <SeletorUF uf={uf} cargo={cargo} incluirBrasil={abr !== "mun"} onMudar={(u) => ir({ uf: u, mun: undefined, nivel: undefined })} />
          {uf !== "br" && <BuscaMunicipio ele={B.id} uf={uf} mun={mun} onMudar={(m) => ir({ mun: m?.cd })} />}
          {uf === "br" && abr === "br" && (
            <div className="segmentado" role="group" aria-label="Detalhamento">
              <button type="button" aria-pressed={!nivel} onClick={() => ir({ nivel: undefined })}>
                Por estado
              </button>
              <button type="button" aria-pressed={nivel === "mun"} onClick={() => ir({ nivel: "mun" })}>
                Por município
              </button>
            </div>
          )}
        </div>
      </section>

      {abr === "mun" && !mun ? (
        <div className="aviso">Escolha um município para comparar {CARGOS[cargo]?.nome.toLowerCase()} entre eleições (comparação por zona eleitoral).</div>
      ) : (
        <Comparacao key={`${A.id}-${B.id}-${cargo}-${uf}-${mun}-${nivel}`} A={A} B={B} cargo={cargo} uf={uf} mun={mun} nivel={nivel} na={sp.get("na") ?? undefined} nb={sp.get("nb") ?? undefined} ir={ir} />
      )}
    </div>
  );
}

function Comparacao({
  A,
  B,
  cargo,
  uf,
  mun,
  nivel,
  na,
  nb,
  ir,
}: {
  A: Eleicao;
  B: Eleicao;
  cargo: number;
  uf: string;
  mun?: string;
  nivel?: "mun";
  na?: string;
  nb?: string;
  ir: (m: Record<string, string | number | undefined>) => void;
}) {
  const ra = useApi<Resultado>(`/api/resultado?${qs({ ele: A.id, cargo, uf, mun })}`);
  const rb = useApi<Resultado>(`/api/resultado?${qs({ ele: B.id, cargo, uf, mun })}`);
  const ca = ra.dados?.candidatos ?? [];
  const cb = rb.dados?.candidatos ?? [];
  const candA = ca.find((c) => c.n === na) ?? ca[0];
  const candB = cb.find((c) => c.n === nb) ?? (candA ? cb.find((c) => normalizar(c.nome) === normalizar(candA.nome)) ?? cb.find((c) => c.partido === candA.partido) : undefined) ?? cb[0];

  const da = useDistribuicao<Distribuicao>(candA ? { ele: A.id, cargo, uf, mun, nivel, n: candA.n } : null);
  const db = useDistribuicao<Distribuicao>(candB ? { ele: B.id, cargo, uf, mun, nivel, n: candB.n } : null);

  const { calcB, diffs } = useMemo(() => {
    if (!da.dados || !db.dados || !candA || !candB) return { calcB: [] as AreaCalc[], diffs: new Map<string, { a?: number; b?: number; va: number; vb: number }>() };
    const calcA = new Map(calcularTodas(da.dados).map((ac) => [ac.area.cd, ac]));
    const calcB = calcularTodas(db.dados).filter((ac) => ac.area.cd !== "zz" || uf === "zz");
    const diffs = new Map<string, { a?: number; b?: number; va: number; vb: number }>();
    for (const ac of calcB) {
      const x = calcA.get(ac.area.cd);
      diffs.set(ac.area.cd, {
        a: x ? pctCandidato(x, candA.n) : undefined,
        b: pctCandidato(ac, candB.n),
        va: x ? votosCandidato(x, candA.n) : 0,
        vb: votosCandidato(ac, candB.n),
      });
    }
    return { calcB, diffs };
  }, [da.dados, db.dados, candA, candB, uf]);

  const diff = (ac: AreaCalc) => {
    const d = diffs.get(ac.area.cd);
    return d && d.a !== undefined && d.b !== undefined ? d.b - d.a : undefined;
  };

  const pintura: Pintura = useMemo(
    () => ({
      pintar: (ac) => {
        const v = diff(ac);
        return v === undefined ? SEM_DADOS : corDivergente(v);
      },
      dica: (ac) => {
        const d = diffs.get(ac.area.cd);
        const v = diff(ac);
        return (
          <div>
            <strong className="dica-titulo">{titulo(ac.area.nome)}</strong>
            <div>
              {A.ano} ({A.turno}º t.): <b>{fmtPct(d?.a)}</b> <small className="secundario">{fmtNum(d?.va)} votos</small>
            </div>
            <div>
              {B.ano} ({B.turno}º t.): <b>{fmtPct(d?.b)}</b> <small className="secundario">{fmtNum(d?.vb)} votos</small>
            </div>
            <div className={v === undefined ? "" : v >= 0 ? "positivo" : "negativo"}>
              <b>{fmtPP(v)}</b>
            </div>
          </div>
        );
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diffs, A, B]
  );

  if (ra.erro || rb.erro) return <Erro msg={(ra.erro || rb.erro)!} />;
  if (!ra.dados || !rb.dados) return <Carregando />;
  if (!candA || !candB) return <Erro msg="Sem candidatos para comparar." />;

  const delta = candB.pct - candA.pct;
  const lista = calcB.map((ac) => ({ ac, v: diff(ac) })).filter((x) => x.v !== undefined) as { ac: AreaCalc; v: number }[];
  const ganhos = [...lista].sort((a, b) => b.v - a.v).slice(0, 8);
  const perdas = [...lista].sort((a, b) => a.v - b.v).slice(0, 8);
  const unidade = da.dados?.nivel === "uf" ? "Estado" : da.dados?.nivel === "zona" ? "Zona" : da.dados?.nivel === "exterior" ? "Cidade" : "Município";

  return (
    <>
      <section className="grade-comparar">
        <EscolhaCandidato rotulo={`A · ${rotuloEleicao(A)}`} lista={ca} sel={candA} onMudar={(n) => ir({ na: n })} />
        <div className="cartao delta">
          <small>Variação de {titulo(candA.nome)}{candB.nome !== candA.nome ? ` → ${titulo(candB.nome)}` : ""} em {mun ? "no município" : nomeUF(uf)}</small>
          <b className={delta >= 0 ? "positivo" : "negativo"}>{fmtPP(delta)}</b>
          <small className="secundario">
            {fmtPct(candA.pct)} → {fmtPct(candB.pct)} · {candB.votos - candA.votos >= 0 ? "+" : "−"}
            {fmtNum(Math.abs(candB.votos - candA.votos))} votos
          </small>
        </div>
        <EscolhaCandidato rotulo={`B · ${rotuloEleicao(B)}`} lista={cb} sel={candB} onMudar={(n) => ir({ nb: n })} />
      </section>

      <section className="cartao">
        {da.erro || db.erro ? (
          <Erro msg={(da.erro || db.erro)!} />
        ) : !da.dados || !db.dados ? (
          <Carregando texto={nivel === "mun" ? "Carregando os 5.570 municípios das duas eleições…" : undefined} />
        ) : (
          <div className="grade-perfil">
            <div>
              <MapaAreas
                calc={calcB}
                nivel={db.dados.nivel}
                uf={uf}
                pintura={pintura}
                mun={mun}
                onSelecionar={db.dados.nivel === "uf" ? (ac) => ir({ uf: ac.area.cd, nivel: undefined }) : undefined}
                titulo={`${titulo(candA.nome)} ${A.ano} → ${titulo(candB.nome)} ${B.ano}`}
                legenda={<LegendaDivergente rotuloNeg={`perdeu (${A.ano}→${B.ano})`} rotuloPos="ganhou" />}
              />
            </div>
            <div>
              <ListaVariacao titulo="Onde mais cresceu" itens={ganhos} />
              <ListaVariacao titulo="Onde mais caiu" itens={perdas} />
            </div>
          </div>
        )}
      </section>

      {lista.length > 0 && (
        <section className="cartao">
          <h2>Variação por {unidade.toLowerCase()}</h2>
          <TabelaAreas
            calc={calcB}
            rotuloArea={unidade}
            destaque={{ n: candB.n, nome: `${candB.nome} (${B.ano})` }}
            colunaExtra={{ titulo: `Δ vs. ${A.ano}`, valor: diff, formatar: (v) => <span className={v >= 0 ? "positivo" : "negativo"}>{fmtPP(v)}</span> }}
          />
        </section>
      )}
    </>
  );
}

function EscolhaCandidato({ rotulo, lista, sel, onMudar }: { rotulo: string; lista: Candidato[]; sel: Candidato; onMudar: (n: string) => void }) {
  return (
    <div className="cartao escolha" style={{ borderTopColor: corPartido(sel.partido) }}>
      <small className="secundario">{rotulo}</small>
      <select value={sel.n} onChange={(e) => onMudar(e.target.value)} aria-label={rotulo}>
        {lista.map((c) => (
          <option key={c.n} value={c.n}>
            {titulo(c.nome)} ({c.partido}) — {fmtPct(c.pct, 1)}
          </option>
        ))}
      </select>
      <b>{fmtPct(sel.pct)}</b>
      <small className="secundario">{fmtNum(sel.votos)} votos</small>
    </div>
  );
}

function ListaVariacao({ titulo: t, itens }: { titulo: string; itens: { ac: AreaCalc; v: number }[] }) {
  const max = Math.max(1, ...itens.map((x) => Math.abs(x.v)));
  return (
    <div className="ranking">
      <h3>{t}</h3>
      <ol>
        {itens.map((x) => (
          <li key={x.ac.area.cd}>
            <span className="rotulo">
              {titulo(x.ac.area.nome)}
              {x.ac.area.uf && x.ac.area.cd.length > 2 ? <small className="secundario"> {x.ac.area.uf.toUpperCase()}</small> : null}
            </span>
            <span className="barra">
              <span style={{ width: `${(100 * Math.abs(x.v)) / max}%`, background: corDivergente(x.v >= 0 ? 25 : -25) }} />
            </span>
            <b className={`num ${x.v >= 0 ? "positivo" : "negativo"}`}>{fmtPP(x.v, 1)}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}
