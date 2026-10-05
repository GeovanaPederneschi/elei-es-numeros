"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import GraficoLinhas, { Serie } from "./GraficoLinhas";
import { Carregando, Erro } from "./Paineis";
import { SeletorUF } from "./Seletores";
import { qs, useApi } from "@/lib/cliente";
import { CARGOS, Trajetoria as T, corPartido, fmtNum, fmtPct, fmtPP, nomeUF, titulo } from "@/lib/shared";

// Ordem fixa de cores por cargo (identidade categórica)
const COR_CARGO: Record<number, string> = {
  1: "#2a78d6",
  3: "#c2410c",
  5: "#0f766e",
  6: "#7c3aed",
  7: "#b45309",
  8: "#b45309",
  11: "#be185d",
  13: "#4d7c0f",
};

const xDe = (t: T) => t.ano + (t.turno - 1) * 0.5;

export default function Trajetoria({ nome, uf, mun, ufEditavel }: { nome: string; uf?: string; mun?: string; ufEditavel?: boolean }) {
  const [ufBusca, setUfBusca] = useState(uf && uf !== "br" && uf !== "zz" ? uf : "");
  const { dados, erro, carregando } = useApi<{ itens: T[]; pessoa?: string }>(`/api/trajetoria?${qs({ nome, uf: ufBusca || undefined, mun })}`);
  const itens = dados?.itens ?? [];
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);

  const series: Serie[] = useMemo(() => {
    const porCargo = new Map<number, T[]>();
    for (const t of itens) porCargo.set(t.cargo, [...(porCargo.get(t.cargo) ?? []), t]);
    return [...porCargo.entries()].map(([cargo, lista]) => ({
      id: String(cargo),
      nome: CARGOS[cargo]?.nome ?? String(cargo),
      cor: COR_CARGO[cargo] ?? "#666",
      pontos: lista.map((t) => ({
        x: xDe(t),
        y: t.pct,
        rotulo: `${CARGOS[cargo]?.nome}${t.turno === 2 ? " (2º t.)" : ""}`,
        extra: `${fmtNum(t.votos)} votos · ${t.partido} · ${t.situacao || "–"}`,
      })),
    }));
  }, [itens]);

  if (erro) return <Erro msg={erro} />;

  // Padrão: última disputa vs. a anterior no mesmo cargo e turno
  const ultimo = itens[itens.length - 1];
  const anterior = ultimo ? itens.slice(0, -1).map((t, i) => ({ t, i })).reverse().find(({ t }) => t.cargo === ultimo.cargo && t.turno === ultimo.turno) : undefined;
  const ia = a ?? anterior?.i ?? (itens.length > 1 ? itens.length - 2 : 0);
  const ib = b ?? itens.length - 1;
  const ta = itens[ia];
  const tb = itens[ib];
  const rot = (t: T) => `${t.ano} · ${t.turno}º t. · ${CARGOS[t.cargo]?.nome} (${t.mun ? titulo(t.munNome ?? "município") : nomeUF(t.uf)})`;

  return (
    <div className="trajetoria">
      {ufEditavel && (
        <div className="seletores">
          <SeletorUF uf={ufBusca || "br"} incluirBrasil onMudar={(u) => setUfBusca(u === "br" ? "" : u)} />
          <small className="secundario">Escolha um estado para incluir disputas a deputado, senador e governador.</small>
        </div>
      )}
      {carregando && <Carregando texto="Procurando o candidato em todas as eleições…" />}
      {!carregando && itens.length === 0 && <p className="secundario">Nenhuma outra disputa encontrada com o nome “{titulo(nome)}”.</p>}
      {itens.length > 0 && (
        <>
          <GraficoLinhas series={series} rotuloX={(x) => (x % 1 ? `${Math.floor(x)} 2ºt` : String(x))} />

          {itens.length > 1 && ta && tb && (
            <div className="comparador">
              <label>
                <span>De</span>
                <select value={ia} onChange={(e) => setA(+e.target.value)}>
                  {itens.map((t, i) => (
                    <option key={i} value={i}>
                      {rot(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Para</span>
                <select value={ib} onChange={(e) => setB(+e.target.value)}>
                  {itens.map((t, i) => (
                    <option key={i} value={i}>
                      {rot(t)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="comparador-resultado">
                <div>
                  <small>Variação no percentual</small>
                  <b className={tb.pct - ta.pct >= 0 ? "positivo" : "negativo"}>{fmtPP(tb.pct - ta.pct)}</b>
                  <small className="secundario">
                    {fmtPct(ta.pct)} → {fmtPct(tb.pct)}
                  </small>
                </div>
                <div>
                  <small>Variação em votos</small>
                  <b className={tb.votos - ta.votos >= 0 ? "positivo" : "negativo"}>
                    {tb.votos - ta.votos >= 0 ? "+" : "−"}
                    {fmtNum(Math.abs(tb.votos - ta.votos))}
                  </b>
                  <small className="secundario">
                    {fmtNum(ta.votos)} → {fmtNum(tb.votos)}
                    {ta.votos ? ` (${fmtPct((100 * (tb.votos - ta.votos)) / ta.votos, 1)})` : ""}
                  </small>
                </div>
              </div>
              {ta.cargo !== tb.cargo && <small className="secundario">Atenção: cargos diferentes têm eleitorados e bases de cálculo diferentes.</small>}
            </div>
          )}

          <div className="rolagem-x">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Eleição</th>
                  <th>Cargo</th>
                  <th>Local</th>
                  <th>Partido</th>
                  <th className="num">Votos</th>
                  <th className="num">% válidos</th>
                  <th className="num">Δ vs. anterior (mesmo cargo)</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((t, i) => {
                  const ant = [...itens.slice(0, i)].reverse().find((x) => x.cargo === t.cargo && x.turno === t.turno);
                  const link = t.eleicao ? `/candidato?${qs({ ele: t.eleicao, cargo: t.cargo, uf: t.uf, mun: t.mun, n: t.n, nome: t.nome })}` : undefined;
                  return (
                    <tr key={i}>
                      <td>
                        {t.ano} · {t.turno}º t.
                      </td>
                      <td>{CARGOS[t.cargo]?.nome}</td>
                      <td>{t.mun ? titulo(t.munNome ?? t.mun) : nomeUF(t.uf)}</td>
                      <td>
                        <i className="bolinha" style={{ background: corPartido(t.partido) }} /> {t.partido}
                      </td>
                      <td className="num">{fmtNum(t.votos)}</td>
                      <td className="num">{fmtPct(t.pct)}</td>
                      <td className={`num ${ant ? (t.pct - ant.pct >= 0 ? "positivo" : "negativo") : ""}`}>{ant ? fmtPP(t.pct - ant.pct) : "–"}</td>
                      <td>
                        {t.eleito ? <em className="selo eleito">Eleito</em> : t.situacao || "–"} {link && <Link href={link}>mapa →</Link>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="nota">
            A busca é feita pelo nome de urna. Presidência desde 1989 vem da base histórica embutida; demais cargos vêm da API do TSE (2020 em diante) e, se
            gerada, da base histórica completa (<code>npm run historico</code>).
          </p>
        </>
      )}
    </div>
  );
}
