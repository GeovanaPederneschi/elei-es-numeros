"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import MapaAreas from "./MapaAreas";
import { Carregando, Erro, LegendaSequencial, TabelaAreas, pinturaCandidato } from "./Paineis";
import { BuscaMunicipio } from "./Seletores";
import Trajetoria from "./Trajetoria";
import { AreaCalc, calcularTodas, pctCandidato, votosCandidato } from "@/lib/analise";
import { qs, useApi, useDistribuicao } from "@/lib/cliente";
import { degrausSequenciais } from "@/lib/cores";
import { localizarCidade } from "@/lib/exterior";
import { CARGOS, Candidato, Distribuicao, Eleicao, MunicipioInfo, Resultado, UFS, corPartido, fmtNum, fmtPct, nomeUF, titulo } from "@/lib/shared";

type Aba = "uf" | "mun" | "exterior" | "zona";

export default function PerfilCandidato() {
  const sp = useSearchParams();
  const ele = sp.get("ele") ?? "";
  const cargo = +(sp.get("cargo") ?? 1);
  const uf = (sp.get("uf") ?? "br").toLowerCase();
  const mun = sp.get("mun") || undefined;
  const n = sp.get("n") ?? "";
  const nomeParam = sp.get("nome") ?? "";

  const eleicoes = useApi<Eleicao[]>("/api/eleicoes");
  const e = eleicoes.dados?.find((x) => x.id === ele);
  const resumo = useApi<Resultado>(ele ? `/api/resultado?${qs({ ele, cargo, uf, mun })}` : null);
  const c = resumo.dados?.candidatos.find((x) => x.n === n);
  const pos = resumo.dados ? resumo.dados.candidatos.findIndex((x) => x.n === n) + 1 : 0;

  if (!ele || !n) return <Erro msg="Candidato não informado." dica="Use a página Candidatos para escolher um." />;
  if (resumo.erro) return <Erro msg={resumo.erro} />;
  if (!resumo.dados) return <Carregando />;
  if (!c) return <Erro msg={`Candidato nº ${n} (${nomeParam}) não encontrado nesta eleição.`} />;

  const abr = CARGOS[cargo]?.abrangencia;
  const cor = corPartido(c.partido);

  return (
    <div className="perfil">
      <header className="perfil-topo cartao" style={{ borderTopColor: cor }}>
        <span className="avatar grande" style={{ background: cor }} aria-hidden>
          {c.nome
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p[0])
            .join("")}
        </span>
        <div className="perfil-id">
          <p className="sobretitulo">
            {CARGOS[cargo]?.nome} · {e ? `${e.ano} · ${e.turno}º turno` : ""} · {abr === "br" ? "Brasil" : nomeUF(uf)}
          </p>
          <h1>{titulo(c.nome)}</h1>
          <p className="secundario">
            {c.partido} · nº {c.n}
            {c.coligacao && c.coligacao !== c.partido ? ` · ${c.coligacao}` : ""}
            {c.vice ? ` · vice: ${titulo(c.vice)}` : ""}
          </p>
        </div>
        <div className="perfil-numeros">
          <div>
            <small>Votos</small>
            <b>{fmtNum(c.votos)}</b>
          </div>
          <div>
            <small>% dos válidos</small>
            <b>{fmtPct(c.pct)}</b>
          </div>
          <div>
            <small>Posição</small>
            <b>{pos}º</b>
          </div>
          <div>
            <small>Situação</small>
            <b>{c.eleito ? <em className="selo eleito">Eleito</em> : c.situacao || "–"}</b>
          </div>
        </div>
      </header>

      <MapaDoCandidato ele={ele} cargo={cargo} uf={uf} mun={mun} c={c} />

      <section className="cartao">
        <h2>Trajetória de {titulo(c.nome)}</h2>
        <p className="secundario">Todas as disputas encontradas com o mesmo nome de urna, com a variação em pontos percentuais.</p>
        <Trajetoria nome={c.nome} uf={abr === "br" ? undefined : uf} mun={abr === "mun" ? mun : undefined} ufEditavel={abr === "br"} />
      </section>

      <p>
        <Link href={`/?${qs({ ele, cargo, uf: abr === "br" ? "br" : uf, mun: abr === "mun" ? mun : undefined, cand: c.n })}`}>← Ver o mapa completo desta eleição</Link>
      </p>
    </div>
  );
}

function MapaDoCandidato({ ele, cargo, uf, mun, c }: { ele: string; cargo: number; uf: string; mun?: string; c: Candidato }) {
  const abr = CARGOS[cargo]?.abrangencia;
  const abas: { id: Aba; rotulo: string }[] =
    abr === "br"
      ? [
          { id: "uf", rotulo: "Estados" },
          { id: "mun", rotulo: "Municípios" },
          { id: "zona", rotulo: "Zonas eleitorais" },
          { id: "exterior", rotulo: "Exterior" },
        ]
      : abr === "uf"
        ? [
            { id: "mun", rotulo: "Municípios" },
            { id: "zona", rotulo: "Zonas eleitorais" },
          ]
        : [{ id: "zona", rotulo: "Zonas eleitorais" }];
  const [aba, setAba] = useState<Aba>(abas[0].id);
  const [zUf, setZUf] = useState(abr === "br" ? "sp" : uf);
  const [zMun, setZMun] = useState<string | undefined>(mun);
  const cor = corPartido(c.partido);

  let params: Record<string, string | number | undefined> | null = null;
  if (aba === "uf") params = { ele, cargo, uf: "br", n: c.n };
  else if (aba === "mun") params = { ele, cargo, uf: abr === "br" ? "br" : uf, nivel: abr === "br" ? "mun" : undefined, n: c.n };
  else if (aba === "exterior") params = { ele, cargo, uf: "zz", n: c.n };
  else if (zMun) params = { ele, cargo, uf: zUf, mun: zMun, n: c.n };

  // Para as zonas: sugere o município onde o candidato teve mais votos
  const munDoEstado = useApi<Distribuicao>(aba === "zona" && !zMun && abr !== "mun" ? `/api/distribuicao?${qs({ ele, cargo, uf: zUf, n: c.n })}` : null);
  useEffect(() => {
    if (aba !== "zona" || zMun || !munDoEstado.dados?.areas.length) return;
    const melhor = [...munDoEstado.dados.areas].sort((a, b) => (b.votos[c.n] ?? 0) - (a.votos[c.n] ?? 0))[0];
    if (melhor) setZMun(melhor.cd);
  }, [aba, zMun, munDoEstado.dados, c.n]);

  const dist = useDistribuicao<Distribuicao>(params);
  const calc = useMemo(() => (dist.dados ? calcularTodas(dist.dados) : []).filter((ac) => ac.area.cd !== "zz"), [dist.dados]);
  const max = Math.max(1, ...calc.map((ac) => pctCandidato(ac, c.n) ?? 0));
  const degraus = degrausSequenciais(max);
  const pintura = useMemo(() => pinturaCandidato(c.n, cor, degraus), [c.n, cor, degraus.join()]);
  const rotulo = aba === "uf" ? "Estado" : aba === "zona" ? "Zona" : aba === "exterior" ? "Cidade" : "Município";

  return (
    <section className="cartao">
      <h2>Onde {titulo(c.nome)} foi mais votado</h2>
      <div className="abas" role="tablist">
        {abas.map((a) => (
          <button key={a.id} role="tab" type="button" aria-selected={aba === a.id} onClick={() => setAba(a.id)}>
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === "zona" && (
        <div className="seletores">
          {abr === "br" && (
            <label className="campo">
              <span>Estado</span>
              <select
                value={zUf}
                onChange={(ev) => {
                  setZUf(ev.target.value);
                  setZMun(undefined);
                }}
              >
                {UFS.map((u) => (
                  <option key={u.sigla} value={u.sigla.toLowerCase()}>
                    {u.nome}
                  </option>
                ))}
                <option value="zz">Exterior</option>
              </select>
            </label>
          )}
          {abr !== "mun" && <BuscaMunicipio ele={ele} uf={zUf} mun={zMun} onMudar={(m?: MunicipioInfo) => setZMun(m?.cd)} />}
        </div>
      )}

      {aba === "zona" && !zMun ? (
        <Carregando texto="Escolhendo o município onde o candidato teve mais votos…" />
      ) : dist.erro ? (
        <Erro msg={dist.erro} />
      ) : !dist.dados ? (
        <Carregando texto={aba === "mun" && abr === "br" ? "Carregando os 5.570 municípios…" : undefined} />
      ) : (
        <>
          <div className="grade-perfil">
            <div>
              <MapaAreas calc={calc} nivel={dist.dados.nivel} uf={dist.dados.uf} pintura={pintura} destaque={c.n} />
              <LegendaSequencial cor={cor} degraus={degraus} nome={titulo(c.nome)} />
            </div>
            <div>
              <Ranking calc={calc} n={c.n} titulo="Mais votos" por="votos" rotulo={rotulo} cor={cor} />
              <Ranking calc={calc} n={c.n} titulo="Maior percentual" por="pct" rotulo={rotulo} cor={cor} />
              {aba === "exterior" && <RankingPaises calc={calc} n={c.n} />}
            </div>
          </div>
          <details className="detalhes">
            <summary>Tabela completa ({calc.length})</summary>
            <TabelaAreas calc={calc} rotuloArea={rotulo} destaque={{ n: c.n, nome: c.nome }} />
          </details>
        </>
      )}
    </section>
  );
}

function Ranking({ calc, n, titulo: t, por, rotulo, cor }: { calc: AreaCalc[]; n: string; titulo: string; por: "votos" | "pct"; rotulo: string; cor: string }) {
  const lista = calc
    .map((ac) => ({ ac, v: votosCandidato(ac, n), p: pctCandidato(ac, n) ?? 0 }))
    .filter((x) => x.v > 0 && (por === "votos" || x.ac.validos >= 200)) // evita distorções em locais minúsculos
    .sort((a, b) => (por === "votos" ? b.v - a.v : b.p - a.p))
    .slice(0, 10);
  if (!lista.length) return null;
  const max = Math.max(...lista.map((x) => (por === "votos" ? x.v : x.p)));
  return (
    <div className="ranking">
      <h3>
        {t} <small className="secundario">({rotulo.toLowerCase()}s)</small>
      </h3>
      <ol>
        {lista.map((x) => (
          <li key={x.ac.area.cd}>
            <span className="rotulo">
              {titulo(x.ac.area.nome)}
              {x.ac.area.uf && x.ac.area.cd.length > 2 && x.ac.area.uf !== "zz" ? <small className="secundario"> {x.ac.area.uf.toUpperCase()}</small> : null}
            </span>
            <span className="barra">
              <span style={{ width: `${(100 * (por === "votos" ? x.v : x.p)) / max}%`, background: cor }} />
            </span>
            <b className="num">{por === "votos" ? fmtNum(x.v) : fmtPct(x.p, 1)}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RankingPaises({ calc, n }: { calc: AreaCalc[]; n: string }) {
  const paises = new Map<string, { v: number; validos: number }>();
  for (const ac of calc) {
    const pais = localizarCidade(ac.area.nome)?.pais ?? "Outros / não identificado";
    const p = paises.get(pais) ?? { v: 0, validos: 0 };
    p.v += votosCandidato(ac, n);
    p.validos += ac.validos;
    paises.set(pais, p);
  }
  const lista = [...paises.entries()].sort((a, b) => b[1].v - a[1].v).slice(0, 12);
  return (
    <div className="ranking">
      <h3>Por país</h3>
      <table className="tabela compacta">
        <thead>
          <tr>
            <th>País</th>
            <th className="num">Votos</th>
            <th className="num">%</th>
          </tr>
        </thead>
        <tbody>
          {lista.map(([pais, p]) => (
            <tr key={pais}>
              <td>{pais}</td>
              <td className="num">{fmtNum(p.v)}</td>
              <td className="num">{fmtPct(p.validos ? (100 * p.v) / p.validos : 0, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
