"use client";

import Link from "next/link";
import { ReactNode, useMemo, useState } from "react";
import { AreaCalc, pctCandidato, vitorias, votosCandidato } from "@/lib/analise";
import { DEGRAUS_DIV, DIV_MEIO, FAIXAS_LIDER, NEUTRO, SEM_DADOS, corDivergente, corLider, corSequencial } from "@/lib/cores";
import { Candidato, Totais, corPartido, fmtNum, fmtPct, titulo } from "@/lib/shared";
import { Pintura } from "./MapaAreas";

// ---------------------------------------------------------------------------
// Pinturas (como colorir o mapa)
// ---------------------------------------------------------------------------

export function pinturaLider(): Pintura {
  return { pintar: (ac) => (ac.lider ? corLider(ac.lider.cor, ac.lider.pct) : SEM_DADOS) };
}

export function pinturaCandidato(n: string, cor: string, degraus: number[]): Pintura {
  return {
    pintar: (ac) => {
      const p = pctCandidato(ac, n);
      return p === undefined ? SEM_DADOS : corSequencial(cor, p, degraus);
    },
  };
}

// ---------------------------------------------------------------------------
// Legendas
// ---------------------------------------------------------------------------

export function LegendaLider({ calc, unidade }: { calc: AreaCalc[]; unidade: string }) {
  const v = vitorias(calc).slice(0, 8);
  const agrupado = calc.some((c) => c.area.cands);
  if (!v.length) return null;
  return (
    <div className="legenda">
      <div className="legenda-itens">
        {v.map(({ pos, qtd, chave }) => (
          <span key={chave} className="legenda-item">
            <i className="bolinha" style={{ background: pos.cor }} />
            <b>{agrupado ? pos.partido || pos.nome : titulo(pos.nome)}</b>
            {!agrupado && pos.partido ? <small> {pos.partido}</small> : null}
            <small className="secundario">
              {" "}
              venceu em {qtd} {unidade}
            </small>
          </span>
        ))}
      </div>
      <div className="legenda-faixas" aria-label="Intensidade: percentual do primeiro colocado">
        <small className="secundario">Intensidade = % do 1º colocado:</small>
        {FAIXAS_LIDER.map((f) => (
          <span key={f.rotulo} className="faixa">
            <i style={{ background: corLider(v[0].pos.cor, f.ate - 1) }} />
            <small>{f.rotulo}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

export function LegendaSequencial({ cor, degraus, nome }: { cor: string; degraus: number[]; nome: string }) {
  return (
    <div className="legenda">
      <div className="legenda-faixas">
        <small className="secundario">% dos votos válidos de {nome}:</small>
        {degraus.map((d, i) => (
          <span key={d} className="faixa">
            <i style={{ background: corSequencial(cor, d - 0.01, degraus) }} />
            <small>{i === degraus.length - 1 ? `${i === 0 ? 0 : degraus[i - 1]}%+` : `${i === 0 ? 0 : degraus[i - 1]}–${d}%`}</small>
          </span>
        ))}
        <span className="faixa">
          <i style={{ background: SEM_DADOS }} />
          <small>não concorreu</small>
        </span>
      </div>
    </div>
  );
}

export function LegendaDivergente({ rotuloPos, rotuloNeg }: { rotuloPos: string; rotuloNeg: string }) {
  const passos = [...DEGRAUS_DIV].reverse().map((d) => -d + 0.1).concat([0], DEGRAUS_DIV.map((d) => d - 0.1));
  return (
    <div className="legenda">
      <div className="legenda-faixas">
        <small className="secundario">{rotuloNeg}</small>
        {passos.map((p, i) => (
          <span key={i} className="faixa">
            <i style={{ background: p === 0 ? DIV_MEIO : corDivergente(p * 1.01) }} />
          </span>
        ))}
        <small className="secundario">{rotuloPos}</small>
      </div>
      <small className="secundario">Degraus: ±0,5 · 2 · 5 · 10 · 20 pontos percentuais</small>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Totais (comparecimento, abstenção, brancos, nulos)
// ---------------------------------------------------------------------------

export function BlocoTotais({ t }: { t: Totais }) {
  const comp = t.comparecimento || 1;
  const itens: [string, number, number | undefined][] = [
    ["Eleitorado", t.eleitorado, undefined],
    ["Comparecimento", t.comparecimento, t.eleitorado ? (100 * t.comparecimento) / t.eleitorado : undefined],
    ["Abstenção", t.abstencao, t.eleitorado ? (100 * t.abstencao) / t.eleitorado : undefined],
    ["Válidos", t.validos, (100 * t.validos) / comp],
    ["Brancos", t.brancos, (100 * t.brancos) / comp],
    ["Nulos", t.nulos, (100 * t.nulos) / comp],
  ];
  return (
    <div className="totais">
      {itens.map(([r, v, p]) => (
        <div key={r} className="total">
          <small>{r}</small>
          <b>{fmtNum(v)}</b>
          {p !== undefined && <small className="secundario">{fmtPct(p)}</small>}
        </div>
      ))}
    </div>
  );
}

export function BarraApuracao({ t }: { t: Totais }) {
  if (t.secoesPct === undefined) return null;
  return (
    <div className="apuracao">
      <div className="apuracao-barra">
        <span style={{ width: `${Math.min(100, t.secoesPct)}%` }} />
      </div>
      <small>
        <b>{fmtPct(t.secoesPct)}</b> das seções totalizadas{t.atualizacao ? ` · atualizado em ${t.atualizacao}` : ""}
      </small>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lista de candidatos (barras)
// ---------------------------------------------------------------------------

export function ListaCandidatos({
  candidatos,
  selecionado,
  onSelecionar,
  linkPerfil,
  limite = 12,
}: {
  candidatos: Candidato[];
  selecionado?: string;
  onSelecionar?: (c: Candidato) => void;
  linkPerfil?: (c: Candidato) => string;
  limite?: number;
}) {
  const [busca, setBusca] = useState("");
  const [todos, setTodos] = useState(false);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? candidatos.filter((c) => `${c.nome} ${c.partido} ${c.n}`.toLowerCase().includes(q)) : candidatos;
  }, [busca, candidatos]);
  const max = Math.max(1, ...candidatos.map((c) => c.pct));
  const lista = todos || busca ? filtrados : filtrados.slice(0, limite);

  return (
    <div className="candidatos">
      {candidatos.length > limite && (
        <input className="busca" placeholder={`Buscar entre ${candidatos.length} candidatos (nome, partido ou número)`} value={busca} onChange={(e) => setBusca(e.target.value)} />
      )}
      <ol>
        {lista.map((c) => {
          const cor = corPartido(c.partido);
          const ativo = selecionado === c.n;
          return (
            <li key={c.n} className={`cand${ativo ? " ativo" : ""}`}>
              <button type="button" className="cand-botao" onClick={() => onSelecionar?.(c)} aria-pressed={ativo} title="Colorir o mapa por este candidato">
                <span className="avatar" style={{ background: cor }} aria-hidden>
                  {c.nome
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")}
                </span>
                <span className="cand-info">
                  <span className="cand-nome">
                    {titulo(c.nome)}
                    {c.eleito && <em className="selo eleito">Eleito</em>}
                    {!c.eleito && /2º|turno/i.test(c.situacao) && <em className="selo segundo">2º turno</em>}
                  </span>
                  <small className="secundario">
                    {c.partido} · nº {c.n}
                    {c.vice ? ` · vice: ${titulo(c.vice)}` : ""}
                  </small>
                  <span className="barra">
                    <span style={{ width: `${(100 * c.pct) / max}%`, background: cor }} />
                  </span>
                </span>
                <span className="cand-num">
                  <b>{fmtPct(c.pct)}</b>
                  <small className="secundario">{fmtNum(c.votos)} votos</small>
                </span>
              </button>
              {linkPerfil && (
                <Link className="cand-perfil" href={linkPerfil(c)} title="Ver perfil, onde foi mais votado e trajetória">
                  Perfil →
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      {!busca && filtrados.length > limite && (
        <button type="button" className="botao-texto" onClick={() => setTodos(!todos)}>
          {todos ? "Mostrar menos" : `Mostrar todos os ${filtrados.length} candidatos`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabela de subdivisões (ordenável e pesquisável)
// ---------------------------------------------------------------------------

export function TabelaAreas({
  calc,
  rotuloArea,
  destaque,
  onSelecionar,
  podeSelecionar,
  colunaExtra,
  limiteInicial = 15,
}: {
  calc: AreaCalc[];
  rotuloArea: string;
  destaque?: { n: string; nome: string };
  onSelecionar?: (ac: AreaCalc) => void;
  podeSelecionar?: (ac: AreaCalc) => boolean;
  colunaExtra?: { titulo: string; valor: (ac: AreaCalc) => number | undefined; formatar: (v: number) => ReactNode };
  limiteInicial?: number;
}) {
  type Ord = "nome" | "eleitorado" | "lider" | "destaque" | "votos" | "extra";
  const [ord, setOrd] = useState<{ k: Ord; desc: boolean }>({ k: destaque ? "destaque" : colunaExtra ? "extra" : "eleitorado", desc: true });
  const [busca, setBusca] = useState("");
  const [todos, setTodos] = useState(false);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const l = calc.filter((ac) => !q || ac.area.nome.toLowerCase().includes(q));
    const val = (ac: AreaCalc): number | string => {
      switch (ord.k) {
        case "nome":
          return ac.area.nome;
        case "eleitorado":
          return ac.area.totais.eleitorado || ac.validos;
        case "lider":
          return ac.lider?.pct ?? -1;
        case "destaque":
          return destaque ? pctCandidato(ac, destaque.n) ?? -1 : 0;
        case "votos":
          return destaque ? votosCandidato(ac, destaque.n) : 0;
        case "extra":
          return colunaExtra?.valor(ac) ?? -Infinity;
      }
    };
    return l.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const r = typeof x === "string" ? x.localeCompare(y as string, "pt-BR") : (x as number) - (y as number);
      return ord.desc ? -r : r;
    });
  }, [calc, busca, ord, destaque, colunaExtra]);

  const Cab = ({ k, children, num }: { k: Ord; children: ReactNode; num?: boolean }) => (
    <th className={num ? "num" : ""} aria-sort={ord.k === k ? (ord.desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => setOrd({ k, desc: ord.k === k ? !ord.desc : k !== "nome" })}>
        {children} {ord.k === k ? (ord.desc ? "▼" : "▲") : ""}
      </button>
    </th>
  );

  const visiveis = todos || busca ? linhas : linhas.slice(0, limiteInicial);
  return (
    <div className="tabela-areas">
      <input className="busca" placeholder={`Filtrar ${rotuloArea.toLowerCase()}…`} value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="rolagem-x">
        <table>
          <thead>
            <tr>
              <Cab k="nome">{rotuloArea}</Cab>
              <Cab k="eleitorado" num>
                Eleitorado
              </Cab>
              <Cab k="lider">1º colocado</Cab>
              {destaque && (
                <>
                  <Cab k="destaque" num>
                    % {titulo(destaque.nome)}
                  </Cab>
                  <Cab k="votos" num>
                    Votos
                  </Cab>
                </>
              )}
              {colunaExtra && (
                <Cab k="extra" num>
                  {colunaExtra.titulo}
                </Cab>
              )}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((ac) => {
              const pode = onSelecionar && (!podeSelecionar || podeSelecionar(ac));
              const pd = destaque ? pctCandidato(ac, destaque.n) : undefined;
              const ex = colunaExtra?.valor(ac);
              return (
                <tr key={ac.area.cd} className={pode ? "clicavel" : ""} onClick={() => pode && onSelecionar!(ac)}>
                  <td>
                    {pode ? (
                      <button type="button" className="link" onClick={(e) => (e.stopPropagation(), onSelecionar!(ac))}>
                        {titulo(ac.area.nome)}
                      </button>
                    ) : (
                      titulo(ac.area.nome)
                    )}
                    {ac.area.uf && ac.area.cd.length > 2 && ac.area.uf.length === 2 && ac.area.uf !== "zz" ? <small className="secundario"> {ac.area.uf.toUpperCase()}</small> : null}
                  </td>
                  <td className="num">{fmtNum(ac.area.totais.eleitorado || undefined)}</td>
                  <td>
                    {ac.lider ? (
                      <>
                        <i className="bolinha" style={{ background: ac.lider.cor }} /> {titulo(ac.lider.nome)} <small className="secundario">{fmtPct(ac.lider.pct, 1)}</small>
                      </>
                    ) : (
                      "–"
                    )}
                  </td>
                  {destaque && (
                    <>
                      <td className="num">{pd === undefined ? "–" : fmtPct(pd)}</td>
                      <td className="num">{fmtNum(votosCandidato(ac, destaque.n))}</td>
                    </>
                  )}
                  {colunaExtra && <td className="num">{ex === undefined ? "–" : colunaExtra.formatar(ex)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!busca && linhas.length > limiteInicial && (
        <button type="button" className="botao-texto" onClick={() => setTodos(!todos)}>
          {todos ? "Mostrar menos" : `Mostrar todos (${linhas.length})`}
        </button>
      )}
    </div>
  );
}

export function Carregando({ texto = "Carregando dados do TSE…" }: { texto?: string }) {
  return (
    <div className="carregando" role="status">
      <span className="spinner" aria-hidden /> {texto}
    </div>
  );
}

export function Erro({ msg, dica }: { msg: string; dica?: string }) {
  return (
    <div className="aviso erro" role="alert">
      <b>Não foi possível obter os dados.</b> {msg}
      {dica ? <div className="secundario">{dica}</div> : null}
    </div>
  );
}

export { NEUTRO };
