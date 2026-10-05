"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/cliente";
import { CARGOS, Eleicao, MunicipioInfo, UFS, normalizar, titulo } from "@/lib/shared";

/** Escolha de ano, turno e cargo a partir do catálogo de eleições. */
export function SeletorEleicao({
  eleicoes,
  ele,
  cargo,
  onMudar,
  cargosPermitidos,
}: {
  eleicoes: Eleicao[];
  ele: Eleicao;
  cargo: number;
  onMudar: (ele: Eleicao, cargo: number) => void;
  cargosPermitidos?: number[];
}) {
  const filtra = (e: Eleicao) => e.cargos.filter((c) => !cargosPermitidos || cargosPermitidos.includes(c));
  const anos = [...new Set(eleicoes.filter((e) => filtra(e).length).map((e) => e.ano))].sort((a, b) => b - a);
  const doAno = eleicoes.filter((e) => e.ano === ele.ano && filtra(e).length);
  const turnos = [...new Set(doAno.map((e) => e.turno))].sort();
  const doTurno = doAno.filter((e) => e.turno === ele.turno);
  const cargos = [...new Set(doTurno.flatMap(filtra))].sort((a, b) => a - b);

  const escolher = (ano: number, turno: number, cg: number) => {
    const cand = eleicoes.filter((e) => e.ano === ano && filtra(e).length);
    const t = cand.some((e) => e.turno === turno) ? turno : Math.min(...cand.map((e) => e.turno));
    const doT = cand.filter((e) => e.turno === t);
    const comCargo = doT.find((e) => e.cargos.includes(cg)) ?? doT[0];
    const novoCargo = comCargo.cargos.includes(cg) ? cg : filtra(comCargo)[0];
    onMudar(comCargo, novoCargo);
  };

  return (
    <div className="seletores">
      <label>
        <span>Ano</span>
        <select value={ele.ano} onChange={(e) => escolher(+e.target.value, ele.turno, cargo)}>
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <div className="segmentado" role="group" aria-label="Turno">
        {turnos.map((t) => (
          <button key={t} type="button" aria-pressed={t === ele.turno} onClick={() => escolher(ele.ano, t, cargo)}>
            {t}º turno
          </button>
        ))}
      </div>
      <div className="segmentado cargos" role="group" aria-label="Cargo">
        {cargos.map((c) => (
          <button key={c} type="button" aria-pressed={c === cargo} onClick={() => escolher(ele.ano, ele.turno, c)}>
            {CARGOS[c]?.nome ?? c}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SeletorUF({
  uf,
  onMudar,
  incluirBrasil,
  incluirExterior,
  cargo,
}: {
  uf: string;
  onMudar: (uf: string) => void;
  incluirBrasil?: boolean;
  incluirExterior?: boolean;
  cargo?: number;
}) {
  const lista = UFS.filter((u) => (cargo === 8 ? u.sigla === "DF" : cargo === 7 ? u.sigla !== "DF" : true));
  return (
    <label className="campo">
      <span>Local</span>
      <select value={uf} onChange={(e) => onMudar(e.target.value)}>
        {incluirBrasil && <option value="br">Brasil (todos os estados)</option>}
        {lista.map((u) => (
          <option key={u.sigla} value={u.sigla.toLowerCase()}>
            {u.nome}
          </option>
        ))}
        {incluirExterior && <option value="zz">Exterior</option>}
      </select>
    </label>
  );
}

export function BuscaMunicipio({
  ele,
  uf,
  mun,
  onMudar,
  rotulo = "Município",
}: {
  ele: string;
  uf: string;
  mun?: string;
  onMudar: (m?: MunicipioInfo) => void;
  rotulo?: string;
}) {
  const { dados } = useApi<Record<string, MunicipioInfo[]>>(uf && uf !== "br" ? `/api/municipios?ele=${ele}&uf=${uf}` : null);
  const lista = useMemo(() => (dados?.[uf] ?? []).slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), [dados, uf]);
  const atual = lista.find((m) => m.cd === mun);
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const q = normalizar(texto);
  const sugestoes = (q ? lista.filter((m) => normalizar(m.nome).includes(q)) : lista.filter((m) => m.capital).concat(lista)).slice(0, 12);
  if (!uf || uf === "br") return null;

  return (
    <div className="campo busca-mun">
      <span>{rotulo}</span>
      <div className="combo">
        <input
          value={aberto ? texto : atual ? titulo(atual.nome) : ""}
          placeholder={uf === "zz" ? "Todas as cidades" : "Todo o estado — digite para buscar"}
          onFocus={() => {
            setTexto("");
            setAberto(true);
          }}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && sugestoes[0]) {
              onMudar(sugestoes[0]);
              setAberto(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label={rotulo}
        />
        {mun && (
          <button type="button" className="limpar" onClick={() => onMudar(undefined)} aria-label="Limpar município">
            ×
          </button>
        )}
        {aberto && sugestoes.length > 0 && (
          <ul className="sugestoes" role="listbox">
            {[...new Map(sugestoes.map((m) => [m.cd, m])).values()].map((m) => (
              <li key={m.cd}>
                <button type="button" onMouseDown={() => onMudar(m)}>
                  {titulo(m.nome)} {m.capital && <small className="secundario">capital</small>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
