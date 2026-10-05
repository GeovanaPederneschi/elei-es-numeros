"use client";

// Histórico das eleições presidenciais desde 1989 + eleições mais recentes direto da API do TSE.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import GraficoLinhas, { Serie } from "./GraficoLinhas";
import Trajetoria from "./Trajetoria";
import { APELIDOS, CandHist, EleicaoHist, PRESIDENTE_HISTORICO } from "@/data/presidente-historico";
import { buscar, qs } from "@/lib/cliente";
import { Eleicao, Resultado, corPartido, fmtNum, fmtPct, normalizar, titulo } from "@/lib/shared";

function pessoaDe(nome: string): string {
  const n = normalizar(nome);
  for (const [p, l] of Object.entries(APELIDOS)) if (l.some((x) => normalizar(x) === n)) return p;
  return n.toLowerCase().replace(/\s+/g, "-");
}

function useHistoricoCompleto() {
  const [extra, setExtra] = useState<(EleicaoHist & { id: string })[]>([]);
  useEffect(() => {
    let vivo = true;
    buscar<Eleicao[]>("/api/eleicoes")
      .then(async (lista) => {
        const ultimoHist = Math.max(...PRESIDENTE_HISTORICO.map((e) => e.ano));
        const novas = lista.filter((e) => e.cargos.includes(1) && e.ano > ultimoHist);
        const res = await Promise.all(
          novas.map(async (e) => {
            try {
              const r = await buscar<Resultado>(`/api/resultado?${qs({ ele: e.id, cargo: 1, uf: "br" })}`);
              if (!r.candidatos.length || !r.candidatos[0].votos) return null;
              return {
                id: e.id,
                ano: e.ano,
                turno: e.turno as 1 | 2,
                candidatos: r.candidatos.map(
                  (c): CandHist => ({
                    pessoa: pessoaDe(c.nome),
                    nome: titulo(c.nome),
                    partido: c.partido,
                    votos: c.votos,
                    pct: c.pct,
                    eleito: c.eleito,
                    segundoTurno: /2º|turno/i.test(c.situacao),
                  })
                ),
              };
            } catch {
              return null;
            }
          })
        );
        if (vivo) setExtra(res.filter(Boolean) as any);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);
  return useMemo(() => [...PRESIDENTE_HISTORICO, ...extra].sort((a, b) => a.ano - b.ano || a.turno - b.turno), [extra]);
}

// Cores fixas por pessoa: a cor do partido pelo qual mais concorreu
function corPessoa(dados: EleicaoHist[], pessoa: string): string {
  const conta = new Map<string, number>();
  for (const e of dados) for (const c of e.candidatos) if (c.pessoa === pessoa) conta.set(c.partido, (conta.get(c.partido) ?? 0) + 1);
  const p = [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return corPartido(p);
}

export default function Historico() {
  const dados = useHistoricoCompleto();
  const [turno, setTurno] = useState<1 | 2>(1);
  const [modo, setModo] = useState<"pessoa" | "partido">("pessoa");
  const [sel, setSel] = useState<string[]>(["lula", "bolsonaro", "fhc", "ciro"]);
  const [ano, setAno] = useState<number>(2022);
  const [pessoaTraj, setPessoaTraj] = useState("lula");

  const pessoas = useMemo(() => {
    const m = new Map<string, { nome: string; vezes: number; max: number }>();
    for (const e of dados)
      for (const c of e.candidatos) {
        const x = m.get(c.pessoa) ?? { nome: c.nome, vezes: 0, max: 0 };
        if (e.turno === 1) x.vezes++;
        x.max = Math.max(x.max, c.pct);
        x.nome = c.nome;
        m.set(c.pessoa, x);
      }
    return [...m.entries()].filter(([, v]) => v.vezes >= 2 || v.max >= 4).sort((a, b) => b[1].max - a[1].max);
  }, [dados]);

  const series: Serie[] = useMemo(() => {
    const eleicoes = dados.filter((e) => e.turno === turno);
    if (modo === "partido") {
      const partidos = new Map<string, Serie>();
      for (const e of eleicoes)
        for (const c of e.candidatos.slice(0, 4)) {
          const s = partidos.get(c.partido) ?? { id: c.partido, nome: c.partido, cor: corPartido(c.partido), pontos: [] };
          s.pontos.push({ x: e.ano, y: c.pct, rotulo: `${c.partido} (${c.nome})`, extra: `${fmtNum(c.votos)} votos` });
          partidos.set(c.partido, s);
        }
      return [...partidos.values()].filter((s) => s.pontos.length >= 2 || Math.max(...s.pontos.map((p) => p.y)) > 20);
    }
    return sel.map((p) => ({
      id: p,
      nome: pessoas.find((x) => x[0] === p)?.[1].nome ?? p,
      cor: corPessoa(dados, p),
      pontos: eleicoes.flatMap((e) =>
        e.candidatos.filter((c) => c.pessoa === p).map((c) => ({ x: e.ano, y: c.pct, rotulo: `${c.nome} (${c.partido})`, extra: `${fmtNum(c.votos)} votos${c.eleito ? " · eleito" : ""}` }))
      ),
    }));
  }, [dados, turno, modo, sel, pessoas]);

  const anos = [...new Set(dados.map((e) => e.ano))];
  const doAno = dados.filter((e) => e.ano === ano);
  const nomeTraj = APELIDOS[pessoaTraj]?.[0] ?? pessoaTraj;

  return (
    <div className="historico">
      <header className="titulo-pagina">
        <h1>Histórico das eleições presidenciais</h1>
        <p className="secundario">
          De 1989 até hoje. Percentuais sobre os votos válidos. Eleições mais recentes são lidas ao vivo da API do TSE.
        </p>
      </header>

      <section className="cartao">
        <div className="cabecalho-secao">
          <h2>Desempenho ao longo do tempo</h2>
          <div className="seletores">
            <div className="segmentado" role="group" aria-label="Agrupar por">
              <button type="button" aria-pressed={modo === "pessoa"} onClick={() => setModo("pessoa")}>
                Candidatos
              </button>
              <button type="button" aria-pressed={modo === "partido"} onClick={() => setModo("partido")}>
                Partidos
              </button>
            </div>
            <div className="segmentado" role="group" aria-label="Turno">
              <button type="button" aria-pressed={turno === 1} onClick={() => setTurno(1)}>
                1º turno
              </button>
              <button type="button" aria-pressed={turno === 2} onClick={() => setTurno(2)}>
                2º turno
              </button>
            </div>
          </div>
        </div>
        {modo === "pessoa" && (
          <div className="chips" role="group" aria-label="Candidatos no gráfico">
            {pessoas.map(([p, v]) => {
              const ativo = sel.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  className="chip"
                  aria-pressed={ativo}
                  style={ativo ? { borderColor: corPessoa(dados, p), boxShadow: `inset 0 -3px 0 ${corPessoa(dados, p)}` } : undefined}
                  onClick={() => setSel(ativo ? sel.filter((x) => x !== p) : [...sel, p].slice(-8))}
                >
                  {v.nome}
                </button>
              );
            })}
          </div>
        )}
        <GraficoLinhas series={series.filter((s) => s.pontos.length)} rotuloX={(x) => String(x)} maxY={turno === 2 ? 70 : 70} />
      </section>

      <section className="cartao">
        <div className="cabecalho-secao">
          <h2>Resultado de cada eleição</h2>
          <div className="chips" role="group" aria-label="Ano">
            {anos.map((a) => (
              <button key={a} type="button" className="chip" aria-pressed={a === ano} onClick={() => setAno(a)}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="grade-turnos">
          {doAno.map((e) => (
            <div key={e.turno}>
              <h3>
                {e.turno}º turno{" "}
                {"id" in e ? (
                  <Link href={`/?${qs({ ele: (e as any).id, cargo: 1 })}`}>ver no mapa →</Link>
                ) : e.ano >= 2022 ? (
                  <Link href={`/?${qs({ cargo: 1 })}`}>ver no mapa →</Link>
                ) : null}
              </h3>
              <ol className="barras-partido">
                {e.candidatos.map((c) => (
                  <li key={c.pessoa}>
                    <span className="rotulo">
                      {c.nome} <small className="secundario">{c.partido}</small>
                      {c.eleito && <em className="selo eleito">Eleito</em>}
                    </span>
                    <span className="barra">
                      <span style={{ width: `${c.pct}%`, background: corPartido(c.partido) }} />
                    </span>
                    <b className="num">{fmtPct(c.pct)}</b>
                    <small className="secundario num">{fmtNum(c.votos)}</small>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="cartao">
        <div className="cabecalho-secao">
          <h2>Trajetória e variação em pontos percentuais</h2>
          <label className="campo">
            <span>Candidato</span>
            <select value={pessoaTraj} onChange={(e) => setPessoaTraj(e.target.value)}>
              {pessoas.map(([p, v]) => (
                <option key={p} value={p}>
                  {v.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Trajetoria key={pessoaTraj} nome={nomeTraj} ufEditavel />
      </section>
    </div>
  );
}
