"use client";

// Liga os resultados (AreaCalc) à geometria certa para o nível:
// estados, municípios (de um estado ou do país), zonas (mosaico) ou exterior (mapa-múndi).

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, Geometry } from "geojson";
import MapaGeo, { PontoMapa } from "./MapaGeo";
import MapaZonas from "./MapaZonas";
import MapaZonasGeo from "./MapaZonasGeo";
import { AreaCalc, Posicao } from "@/lib/analise";
import { buscar } from "@/lib/cliente";
import { localizarCidade } from "@/lib/exterior";
import { Nivel, UFS, UF_POR_IBGE, normalizar, titulo } from "@/lib/shared";
import { SEM_DADOS } from "@/lib/cores";

type Feat = Feature<Geometry, { id: string; nome: string; sigla?: string }>;

const cacheGeo = new Map<string, Promise<Feat[]>>();

function carregarMalha(chave: string, fn: () => Promise<Feat[]>) {
  if (!cacheGeo.has(chave)) {
    const p = fn();
    p.catch(() => cacheGeo.delete(chave));
    cacheGeo.set(chave, p);
  }
  return cacheGeo.get(chave)!;
}

async function malhaEstados(): Promise<Feat[]> {
  const fc = await buscar("/api/malha?tipo=estados");
  return fc.features;
}

async function malhaMunicipios(uf: string): Promise<Feat[]> {
  const fc = await buscar(`/api/malha?tipo=municipios&uf=${uf}`);
  return fc.features;
}

async function malhaMundo(): Promise<Feat[]> {
  const [{ feature }, topo] = await Promise.all([import("topojson-client"), import("world-atlas/countries-110m.json")]);
  const t: any = (topo as any).default ?? topo;
  const fc: any = feature(t, t.objects.countries);
  return fc.features
    .filter((f: any) => f.id !== "010") // Antártida
    .map((f: any) => ({ ...f, properties: { id: String(f.id ?? f.properties.name), nome: f.properties.name } }));
}

export function useGeometria(nivel: Nivel, uf: string) {
  const [estado, setEstado] = useState<{ feats?: Feat[]; erro?: string; chave?: string; progresso?: number }>({});
  const chave = nivel === "zona" ? "" : nivel === "uf" ? "estados" : nivel === "exterior" ? "mundo" : `mun-${uf}`;
  useEffect(() => {
    if (!chave) return;
    let vivo = true;
    setEstado((s) => (s.chave === chave ? s : { chave }));
    let p: Promise<Feat[]>;
    if (chave === "estados") p = carregarMalha(chave, malhaEstados);
    else if (chave === "mundo") p = carregarMalha(chave, malhaMundo);
    else if (uf === "br") {
      let feitos = 0;
      p = carregarMalha(chave, async () => {
        const partes = await Promise.all(
          UFS.map((u) =>
            carregarMalha(`mun-${u.sigla.toLowerCase()}`, () => malhaMunicipios(u.sigla.toLowerCase()))
              .catch(() => [] as Feat[])
              .finally(() => vivo && setEstado((s) => ({ ...s, progresso: ++feitos / UFS.length })))
          )
        );
        return partes.flat();
      });
    } else p = carregarMalha(chave, () => malhaMunicipios(uf));
    p.then((feats) => vivo && setEstado({ feats, chave })).catch((e) => vivo && setEstado({ erro: e.message, chave }));
    return () => {
      vivo = false;
    };
  }, [chave, uf]);
  return estado;
}

export interface Pintura {
  pintar: (ac: AreaCalc) => string;
  dica?: (ac: AreaCalc) => ReactNode;
}

export function DicaPadrao({ ac, destaque, extra }: { ac: AreaCalc; destaque?: string; extra?: ReactNode }) {
  const top = ac.ranking.slice(0, 3);
  const d = destaque ? ac.ranking.find((r) => r.n === destaque) : undefined;
  const linhas: Posicao[] = d && !top.includes(d) ? [...top, d] : top;
  return (
    <div>
      <strong className="dica-titulo">
        {titulo(ac.area.nome)}
        {ac.area.uf && ac.area.uf !== "zz" && ac.area.uf.length === 2 && ac.area.cd !== ac.area.uf ? ` · ${ac.area.uf.toUpperCase()}` : ""}
      </strong>
      {extra}
      <table className="dica-tabela">
        <tbody>
          {linhas.map((r) => (
            <tr key={r.n} className={r.n === destaque ? "destaque" : ""}>
              <td>
                <i className="bolinha" style={{ background: r.cor }} />
                {titulo(r.nome)} <small>{r.partido}</small>
              </td>
              <td className="num">{r.pct.toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%</td>
              <td className="num secundario">{r.votos.toLocaleString("pt-BR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ac.area.totais.comparecimento ? (
        <small className="secundario">
          Comparecimento: {ac.area.totais.comparecimento.toLocaleString("pt-BR")}
          {ac.area.totais.eleitorado ? ` de ${ac.area.totais.eleitorado.toLocaleString("pt-BR")} eleitores` : ""}
        </small>
      ) : null}
    </div>
  );
}

interface Props {
  calc: AreaCalc[];
  nivel: Nivel;
  uf: string;
  pintura: Pintura;
  destaque?: string;
  selecionado?: string;
  onSelecionar?: (ac: AreaCalc) => void;
  podeSelecionar?: (ac: AreaCalc) => boolean;
  rotulosUF?: boolean;
  /** código TSE do município (nível zona): permite desenhar as zonas no mapa real */
  mun?: string;
  /** legenda exibida abaixo do mapa (também em tela cheia) */
  legenda?: ReactNode;
  /** título mostrado na barra da tela cheia */
  titulo?: string;
}

/** Moldura do mapa com botão de tela cheia. Usa a Fullscreen API quando existe e,
 *  no iPhone (que não a oferece para páginas), um modo que ocupa a janela inteira. */
export default function MapaAreas({ legenda, titulo, ...props }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [cheia, setCheia] = useState(false);

  const sair = useCallback(() => {
    setCheia(false);
    if (typeof document !== "undefined" && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  const entrar = useCallback(() => {
    setCheia(true);
    const el = ref.current;
    if (el?.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  }, []);

  useEffect(() => {
    const aoMudar = () => {
      if (!document.fullscreenElement) setCheia(false);
    };
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  useEffect(() => {
    if (!cheia) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && sair();
    window.addEventListener("keydown", tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = overflow;
    };
  }, [cheia, sair]);

  return (
    <div ref={ref} className={`quadro-mapa${cheia ? " tela-cheia" : ""}`}>
      <div className="quadro-barra">
        {cheia && titulo ? <strong className="quadro-titulo">{titulo}</strong> : <span />}
        <button type="button" className="botao-tela-cheia" onClick={cheia ? sair : entrar} aria-pressed={cheia} title={cheia ? "Sair da tela cheia (Esc)" : "Ver o mapa em tela cheia"}>
          {cheia ? "✕ Fechar" : "⛶ Tela cheia"}
        </button>
      </div>
      <div className="quadro-corpo">
        <MapaAreasConteudo {...props} />
      </div>
      {legenda ? <div className="quadro-legenda">{legenda}</div> : null}
    </div>
  );
}

function MapaAreasConteudo({ calc, nivel, uf, pintura, destaque, selecionado, onSelecionar, podeSelecionar, rotulosUF = true, mun }: Omit<Props, "legenda" | "titulo">) {
  const geo = useGeometria(nivel, uf);

  // Índices de junção resultado <-> geometria
  const juncao = useMemo(() => {
    const porId = new Map<string, AreaCalc>();
    const porNome = new Map<string, AreaCalc>();
    for (const ac of calc) {
      if (ac.area.ibge) porId.set(ac.area.ibge, ac);
      if (nivel === "uf") {
        const u = UFS.find((x) => x.sigla.toLowerCase() === ac.area.cd);
        if (u) porId.set(u.ibge, ac);
      }
      porNome.set(`${ac.area.uf ?? ""}|${normalizar(ac.area.nome)}`, ac);
    }
    return { porId, porNome };
  }, [calc, nivel]);

  const achar = (f: Feat): AreaCalc | undefined => {
    const id = f.properties.id;
    const ac = juncao.porId.get(id);
    if (ac) return ac;
    const sigla = UF_POR_IBGE[id.slice(0, 2)]?.sigla.toLowerCase() ?? uf;
    return juncao.porNome.get(`${sigla}|${normalizar(f.properties.nome)}`);
  };

  // ---- Zonas -------------------------------------------------------------
  if (nivel === "zona" && mun && uf !== "zz") {
    return <MapaZonasGeo calc={calc} uf={uf} mun={mun} pintura={pintura} destaque={destaque} onSelecionar={onSelecionar} selecionado={selecionado} />;
  }
  if (nivel === "zona") {
    const porCd = new Map(calc.map((ac) => [ac.area.cd, ac]));
    return (
      <MapaZonas
        blocos={calc.map((ac) => ({
          id: ac.area.cd,
          rotulo: ac.area.nome,
          peso: ac.area.totais.eleitorado || ac.validos,
          fill: pintura.pintar(ac),
        }))}
        tooltip={(id) => {
          const ac = porCd.get(id)!;
          return pintura.dica ? pintura.dica(ac) : <DicaPadrao ac={ac} destaque={destaque} />;
        }}
        selecionado={selecionado}
        onClick={(id) => onSelecionar?.(porCd.get(id)!)}
      />
    );
  }

  if (geo.erro) return <div className="aviso">Não foi possível carregar o mapa ({geo.erro}). Os dados continuam na tabela abaixo.</div>;
  if (!geo.feats)
    return (
      <div className="mapa carregando-mapa">
        <div className="pulso" />
        <span>Carregando mapa{geo.progresso ? ` (${Math.round(geo.progresso * 100)}%)` : "…"}</span>
      </div>
    );

  // ---- Exterior ----------------------------------------------------------
  if (nivel === "exterior") return <MapaExterior calc={calc} feats={geo.feats} pintura={pintura} destaque={destaque} />;

  // ---- Estados / municípios ---------------------------------------------
  const feats = geo.feats;
  const porFeat = new Map<string, AreaCalc | undefined>(feats.map((f) => [f.properties.id, achar(f)]));
  return (
    <MapaGeo
      features={feats}
      contornoFino={nivel === "mun" && uf === "br"}
      fill={(id) => {
        const ac = porFeat.get(id);
        return ac ? pintura.pintar(ac) : SEM_DADOS;
      }}
      tooltip={(id) => {
        const ac = porFeat.get(id);
        const f = feats.find((x) => x.properties.id === id);
        if (!ac) return <div><strong>{f?.properties.nome}</strong><br /><small>Sem dados</small></div>;
        return pintura.dica ? pintura.dica(ac) : <DicaPadrao ac={ac} destaque={destaque} />;
      }}
      clicavel={(id) => {
        const ac = porFeat.get(id);
        return !!ac && (!podeSelecionar || podeSelecionar(ac));
      }}
      onClick={onSelecionar ? (id) => porFeat.get(id) && onSelecionar(porFeat.get(id)!) : undefined}
      selecionado={selecionado ? feats.find((f) => porFeat.get(f.properties.id)?.area.cd === selecionado)?.properties.id : undefined}
      rotulo={nivel === "uf" && rotulosUF ? (id) => UF_POR_IBGE[id]?.sigla : undefined}
      descricao={nivel === "uf" ? "Mapa do Brasil por estado" : "Mapa por município"}
    />
  );
}

function MapaExterior({ calc, feats, pintura, destaque }: { calc: AreaCalc[]; feats: Feat[]; pintura: Pintura; destaque?: string }) {
  // agrega cidades por país
  const { pontos, paises, porCidade } = useMemo(() => {
    const paises = new Map<string, { nome: string; votos: Record<string, number>; cidades: AreaCalc[]; comparecimento: number }>();
    const pontos: (PontoMapa & { ac: AreaCalc })[] = [];
    const max = Math.max(1, ...calc.map((a) => a.validos));
    for (const ac of calc) {
      const loc = localizarCidade(ac.area.nome);
      if (!loc) continue;
      pontos.push({ id: ac.area.cd, lon: loc.lon, lat: loc.lat, r: 3 + 13 * Math.sqrt(ac.validos / max), fill: pintura.pintar(ac), ac });
      const p = paises.get(loc.iso) ?? { nome: loc.pais, votos: {}, cidades: [], comparecimento: 0 };
      for (const r of ac.ranking) p.votos[r.n] = (p.votos[r.n] ?? 0) + r.votos;
      p.cidades.push(ac);
      p.comparecimento += ac.area.totais.comparecimento ?? 0;
      paises.set(loc.iso, p);
    }
    return { pontos, paises, porCidade: new Map(pontos.map((p) => [p.id, p.ac])) };
  }, [calc, pintura]);

  const calcPais = (iso: string): AreaCalc | undefined => {
    const p = paises.get(iso);
    if (!p) return undefined;
    const ref = p.cidades[0];
    const cands = new Map(ref.ranking.map((r) => [r.n, r]));
    for (const c of p.cidades) for (const r of c.ranking) if (!cands.has(r.n)) cands.set(r.n, r);
    const validos = Object.values(p.votos).reduce((a, b) => a + b, 0);
    const ranking = Object.entries(p.votos)
      .map(([n, votos]) => ({ ...cands.get(n)!, votos, pct: validos ? (100 * votos) / validos : 0 }))
      .sort((a, b) => b.votos - a.votos);
    return {
      area: { cd: iso, nome: p.nome, totais: { comparecimento: p.comparecimento }, votos: p.votos },
      validos,
      ranking,
      lider: ranking[0],
    };
  };

  return (
    <MapaGeo
      features={feats}
      projecao="mundo"
      altura={460}
      fill={(id) => {
        const ac = calcPais(id);
        return ac ? pintura.pintar(ac) : "var(--mapa-vazio)";
      }}
      tooltip={(id) => {
        const ac = calcPais(id);
        const f = feats.find((x) => x.properties.id === id);
        if (!ac) return <div><strong>{f?.properties.nome}</strong><br /><small>Sem seções eleitorais brasileiras</small></div>;
        return <DicaPadrao ac={ac} destaque={destaque} extra={<small className="secundario">{paises.get(id)!.cidades.length} cidade(s) com seções</small>} />;
      }}
      pontos={pontos}
      tooltipPonto={(id) => {
        const ac = porCidade.get(id)!;
        return pintura.dica ? pintura.dica(ac) : <DicaPadrao ac={ac} destaque={destaque} />;
      }}
      descricao="Mapa-múndi dos votos de brasileiros no exterior"
    />
  );
}
