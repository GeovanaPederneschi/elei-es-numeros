// Acesso à API pública de divulgação de resultados do TSE (resultados.tse.jus.br).
// Usado somente no servidor (rotas /api), que fazem cache e contornam CORS.

import {
  Area,
  CARGOS,
  Candidato,
  Distribuicao,
  Eleicao,
  MunicipioInfo,
  Nivel,
  Resultado,
  Totais,
  TipoEleicao,
  partidoPorNumero,
} from "./shared";
import * as mock from "./mock";

const BASE = process.env.TSE_BASE_URL || "https://resultados.tse.jus.br/oficial";
export const MOCK = process.env.TSE_MOCK === "1";

const ANO_ATUAL = new Date().getFullYear();

// ---------------------------------------------------------------------------
// HTTP com cache em memória (por instância) + cache de dados do Next.
// ---------------------------------------------------------------------------

type Entrada = { t: number; v: unknown };
const memoria = new Map<string, Entrada>();
const emAndamento = new Map<string, Promise<unknown>>();
const MAX_MEMORIA = 400;

export class TSEError extends Error {
  constructor(msg: string, public status = 502) {
    super(msg);
  }
}

async function getJSON<T = any>(url: string, ttl: number): Promise<T> {
  const agora = Date.now();
  const m = memoria.get(url);
  if (m && agora - m.t < ttl * 1000) return m.v as T;
  const pend = emAndamento.get(url);
  if (pend) return pend as Promise<T>;

  const p = (async () => {
    let ultimoErro: unknown;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (eleicoes-em-numeros)", Accept: "application/json" },
          next: { revalidate: ttl },
          signal: AbortSignal.timeout(20000),
        } as RequestInit);
        if (res.status === 404 || res.status === 403) throw new TSEError(`Não encontrado: ${url}`, 404);
        if (!res.ok) throw new TSEError(`TSE respondeu ${res.status} para ${url}`);
        const txt = await res.text();
        const v = JSON.parse(txt.replace(/^﻿/, ""));
        if (memoria.size > MAX_MEMORIA) memoria.delete(memoria.keys().next().value as string);
        memoria.set(url, { t: Date.now(), v });
        return v;
      } catch (e) {
        ultimoErro = e;
        if (e instanceof TSEError && e.status === 404) break;
      }
    }
    if (m) return m.v; // usa versão antiga se houver
    throw ultimoErro;
  })();
  emAndamento.set(url, p);
  try {
    return (await p) as T;
  } finally {
    emAndamento.delete(url);
  }
}

/** Tenta uma lista de URLs e devolve a primeira que funcionar. */
async function getPrimeiro<T = any>(urls: string[], ttl: number): Promise<T> {
  let erro: unknown;
  for (const u of urls) {
    try {
      return await getJSON<T>(u, ttl);
    } catch (e) {
      erro = e;
    }
  }
  if (erro instanceof TSEError && erro.status === 404) throw new TSEError(`Arquivo não encontrado no TSE: ${urls[0]}`, 404);
  throw erro instanceof Error ? erro : new TSEError("Falha ao consultar o TSE");
}

export const TTL_APURACAO = 90; // durante a apuração
export const TTL_FINAL = 60 * 60 * 6; // apuração concluída
export const TTL_PASSADO = 60 * 60 * 24 * 7; // eleições de anos anteriores

/** TTL síncrono para os arquivos brutos (o status da apuração fica em memória). */
export function ttlPara(e?: Pick<Eleicao, "ano" | "id">): number {
  if (!e) return 300;
  if (e.ano < ANO_ATUAL) return TTL_PASSADO;
  return statusApuracao.get(e.id)?.final ? TTL_FINAL : TTL_APURACAO;
}

const statusApuracao = new Map<string, { t: number; final: boolean }>();

/**
 * Tempo de cache conforme a apuração: eleições passadas ficam 7 dias; a atual fica 6 h
 * quando 100% das seções já foram totalizadas e 90 s enquanto ainda está apurando.
 */
export async function ttlEleicao(e: Eleicao): Promise<number> {
  if (MOCK) return 60;
  if (e.ano < ANO_ATUAL) return TTL_PASSADO;
  const m = statusApuracao.get(e.id);
  if (m && Date.now() - m.t < 5 * 60_000) return m.final ? TTL_FINAL : TTL_APURACAO;
  let final = false;
  try {
    const cargo = e.cargos[0];
    const abr = CARGOS[cargo]?.abrangencia;
    if (abr === "mun") {
      // sem arquivo estadual de prefeito: considera concluída 2 dias após a data do pleito
      const [d, mm, a] = (e.data ?? "").split("/").map(Number);
      final = !!a && Date.now() - new Date(a, mm - 1, d).getTime() > 2 * 86400_000;
    } else {
      const uf = abr === "br" ? "br" : "sp";
      const bruto: any = formatoUnificado(e)
        ? await getPrimeiro(arquivoUnificado(e, uf, undefined, undefined, cargo), 60)
        : await getPrimeiro(arquivo(e, uf, undefined, cargo, "r"), 60);
      const pst = num(bruto?.s?.pst ?? bruto?.pst);
      final = pst >= 99.99 || bruto?.tf === "s";
    }
  } catch {
    final = false;
  }
  statusApuracao.set(e.id, { t: Date.now(), final });
  return final ? TTL_FINAL : TTL_APURACAO;
}

// ---------------------------------------------------------------------------
// Conversões
// ---------------------------------------------------------------------------

export function num(v: unknown): number {
  if (v === undefined || v === null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  return parseFloat(s) || 0;
}

const pad = (v: string | number, n: number) => String(v).padStart(n, "0");

// ---------------------------------------------------------------------------
// Catálogo de eleições
// ---------------------------------------------------------------------------

const CARGOS_POR_TIPO: Record<TipoEleicao, number[]> = {
  federal: [1],
  estadual: [3, 5, 6, 7, 8],
  geral: [1, 3, 5, 6, 7, 8],
  municipal: [11, 13],
};

// Eleições conhecidas (fallback caso o arquivo de configuração do TSE não as liste).
const CONHECIDAS: Eleicao[] = [
  { id: "426", ano: 2020, turno: 1, tipo: "municipal", nome: "Eleições Municipais 2020 - 1º turno", cargos: [11, 13] },
  { id: "427", ano: 2020, turno: 2, tipo: "municipal", nome: "Eleições Municipais 2020 - 2º turno", cargos: [11] },
  { id: "544", ano: 2022, turno: 1, tipo: "federal", nome: "Eleição Geral Federal 2022 - 1º turno", cargos: [1] },
  { id: "545", ano: 2022, turno: 2, tipo: "federal", nome: "Eleição Geral Federal 2022 - 2º turno", cargos: [1] },
  { id: "546", ano: 2022, turno: 1, tipo: "estadual", nome: "Eleição Geral Estadual 2022 - 1º turno", cargos: [3, 5, 6, 7, 8] },
  { id: "547", ano: 2022, turno: 2, tipo: "estadual", nome: "Eleição Geral Estadual 2022 - 2º turno", cargos: [3] },
  { id: "619", ano: 2024, turno: 1, tipo: "municipal", nome: "Eleições Municipais 2024 - 1º turno", cargos: [11, 13] },
  { id: "620", ano: 2024, turno: 2, tipo: "municipal", nome: "Eleições Municipais 2024 - 2º turno", cargos: [11] },
];

function extrasDoAmbiente(): Eleicao[] {
  // TSE_ELEICOES_EXTRA="2026:700:federal:1,2026:702:estadual:1"
  const raw = process.env.TSE_ELEICOES_EXTRA;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().split(":"))
    .filter((p) => p.length >= 4)
    .map(([ano, id, tipo, turno]) => ({
      id,
      ano: +ano,
      turno: +turno,
      tipo: tipo as TipoEleicao,
      nome: `Eleição ${ano} (${tipo}) - ${turno}º turno`,
      cargos: CARGOS_POR_TIPO[tipo as TipoEleicao] ?? [],
    }));
}

function tipoPorNome(nome: string, ano: number): TipoEleicao | null {
  const n = nome.toLowerCase();
  if (/suplementar|consulta|plebiscito|referendo|simulad|teste|nova elei/.test(n)) return null;
  if (n.includes("municipa")) return "municipal";
  if (n.includes("federal")) return "federal";
  if (n.includes("estadua")) return "estadual";
  if (n.includes("geral")) return "geral";
  if (ano % 4 === 0) return "municipal";
  if (ano % 4 === 2) return "geral";
  return null;
}

/** Tipo da eleição pelo código "tp" do ele-c.json (EA11). Suplementares e consultas ficam de fora. */
function tipoPorCodigo(tp: number): TipoEleicao | null {
  if (tp === 8) return "federal";
  if (tp === 1) return "estadual";
  if (tp === 3) return "municipal";
  return null;
}

function resolverDirs(arq: Record<string, string>, ano: number, id: string, pleito: string): Record<string, string> {
  const url = new URL(BASE);
  const ambiente = url.pathname.split("/").filter(Boolean).pop() || "oficial";
  const out: Record<string, string> = {};
  for (const [tp, dir] of Object.entries(arq)) {
    out[tp] = dir
      .replace(/<base>/g, url.origin)
      .replace(/<ambiente>/g, ambiente)
      .replace(/<ciclo>/g, `ele${ano}`)
      .replace(/<cd_eleicao>/g, id)
      .replace(/<cd_pleito>/g, pleito)
      .replace(/\/+$/, "");
    if (!/^https?:/.test(out[tp])) out[tp] = `${url.origin}/${out[tp].replace(/^\/+/, "")}`;
  }
  return out;
}

function cargosDaConfig(e: any): number[] | null {
  const set = new Set<number>();
  const visitar = (o: any) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(visitar);
    for (const k of ["cp", "carg", "cargos"]) {
      if (Array.isArray(o[k])) for (const c of o[k]) if (c && c.cd !== undefined && CARGOS[+c.cd]) set.add(+c.cd);
    }
    for (const k of ["abr", "e"]) if (o[k]) visitar(o[k]);
  };
  visitar(e);
  return set.size ? [...set].sort((a, b) => a - b) : null;
}

export async function listarEleicoes(): Promise<Eleicao[]> {
  if (MOCK) return mock.eleicoes();
  const porId = new Map<string, Eleicao>();
  for (const e of CONHECIDAS) porId.set(e.id, { ...e });

  const configs = [
    `${BASE}/comum/config/ele-c.json`,
    `${BASE}/ele${ANO_ATUAL}/comum/config/ele-c.json`,
    `${BASE}/ele${ANO_ATUAL - 2}/comum/config/ele-c.json`,
  ];
  const resultados = await Promise.allSettled(configs.map((u) => getJSON(u, 600)));
  for (const r of resultados) {
    if (r.status !== "fulfilled") continue;
    const cfg: any = r.value;
    // Formato 2026+: "arq" lista o diretório de cada tipo de arquivo (EA11)
    const arq: Record<string, string> = {};
    for (const a of cfg?.arq ?? []) if (a?.tp && a?.dir) arq[String(a.tp)] = String(a.dir);
    for (const pl of cfg?.pl ?? []) {
      const dataPleito: string = pl.dt ?? "";
      for (const e of pl.e ?? []) {
        const id = String(e.cd ?? "").replace(/^0+/, "");
        if (!id) continue;
        const nome: string = e.nm ?? e.ds ?? "";
        const anoData = /(\d{4})$/.exec(dataPleito)?.[1];
        const anoNome = /(19|20)\d{2}/.exec(nome)?.[0];
        const ano = +(anoData ?? anoNome ?? ANO_ATUAL);
        const tipo = e.tp !== undefined && e.tp !== "" ? tipoPorCodigo(+e.tp) : tipoPorNome(nome, ano);
        if (!tipo) continue;
        const turno = +(e.t ?? (/2[ºo°]/.test(nome) ? 2 : 1));
        const cargos = cargosDaConfig(e) ?? CARGOS_POR_TIPO[tipo].filter((c) => !(turno === 2 && [5, 6, 7, 8, 13].includes(c)));
        const dirs = Object.keys(arq).length ? resolverDirs(arq, ano, id, String(pl.cd ?? "")) : undefined;
        porId.set(id, { id, ano, turno, tipo, nome, data: dataPleito || undefined, cargos, dirs });
      }
    }
  }
  for (const e of extrasDoAmbiente()) porId.set(e.id, e);
  const lista = [...porId.values()].map((e) => ({ ...e, recente: e.ano >= ANO_ATUAL }));
  lista.sort((a, b) => b.ano - a.ano || a.turno - b.turno || a.id.localeCompare(b.id));
  return lista;
}

export async function obterEleicao(id: string): Promise<Eleicao> {
  const lista = await listarEleicoes();
  const e = lista.find((x) => x.id === id.replace(/^0+/, ""));
  if (!e) throw new TSEError(`Eleição ${id} não encontrada`, 404);
  return e;
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

function bases(e: Eleicao): string[] {
  const novo = `${BASE}/ele${e.ano}/${e.id}`;
  const antigo = `${BASE}/ele${e.ano}/divulgacao/oficial/${e.id}`;
  return e.ano <= 2020 ? [antigo, novo] : [novo, antigo];
}

function arquivo(e: Eleicao, uf: string, mun: string | undefined, cargo: number, sufixo: "r" | "v"): string[] {
  const pasta = sufixo === "r" ? "dados-simplificados" : "dados";
  const u = uf.toLowerCase();
  const nome = `${u}${mun ? pad(mun, 5) : ""}-c${pad(cargo, 4)}-e${pad(e.id, 6)}-${sufixo}.json`;
  return bases(e).map((b) => `${b}/${pasta}/${u}/${nome}`);
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function totaisDe(o: any): Totais {
  const nulos = num(o.tvn ?? o.vn ?? o.vnu);
  return {
    eleitorado: num(o.e ?? o.el),
    comparecimento: num(o.c ?? o.tv),
    abstencao: num(o.a),
    validos: num(o.vv ?? o.vvc),
    brancos: num(o.vb),
    nulos,
    secoesPct: o.pst !== undefined ? num(o.pst) : o.psi !== undefined ? num(o.psi) : undefined,
    atualizacao: [o.dg ?? o.dt, o.hg ?? o.ht].filter(Boolean).join(" ") || undefined,
  };
}

function partidoDe(c: any, ano: number): string {
  for (const k of ["sgp", "sg", "par", "partido"]) if (typeof c[k] === "string" && c[k]) return c[k].trim();
  const cc: string = c.cc ?? "";
  if (cc) {
    const primeiro = cc.split(/\s+-\s+|\s*\/\s*/)[0].trim();
    if (primeiro && primeiro.length <= 14 && !/federa/i.test(primeiro)) return primeiro;
  }
  return partidoPorNumero(String(c.n ?? ""), ano) ?? (cc ? cc.slice(0, 14) : "–");
}

function situacaoDe(c: any): { eleito: boolean; situacao: string } {
  const st: string = c.st ?? c.dvt ?? "";
  const e = String(c.e ?? "").toLowerCase();
  const eleito = e === "s" || /^eleito/i.test(st);
  return { eleito, situacao: st || (eleito ? "Eleito" : "") };
}

function candidatosDe(o: any, ano: number): Candidato[] {
  const lista: any[] = o.cand ?? o.carg?.[0]?.cand ?? [];
  const totalValidos = num(o.vv ?? o.vvc);
  return lista
    .map((c) => {
      const votos = num(c.vap ?? c.v ?? c.qtv);
      const { eleito, situacao } = situacaoDe(c);
      return {
        n: String(c.n ?? ""),
        sq: c.sqcand ? String(c.sqcand) : undefined,
        nome: String(c.nm ?? c.nmu ?? "").trim(),
        partido: partidoDe(c, ano),
        coligacao: c.cc || undefined,
        vice: c.nv || undefined,
        votos,
        pct: c.pvap !== undefined ? num(c.pvap) : totalValidos ? (100 * votos) / totalValidos : 0,
        eleito,
        situacao,
      } as Candidato;
    })
    .filter((c) => c.n)
    .sort((a, b) => b.votos - a.votos);
}

function areasDe(json: any): { tipo: string; cd: string; o: any }[] {
  const abr: any[] = json.abr ?? (Array.isArray(json) ? json : []);
  return abr.map((a) => ({ tipo: String(a.tpabr ?? a.tp ?? "").toUpperCase(), cd: String(a.cdabr ?? a.cd ?? ""), o: a }));
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

/** URLs do arquivo de resultado unificado (EA20, formato 2026+). */
function arquivoUnificado(e: Eleicao, uf: string, mun: string | undefined, zona: string | undefined, cargo: number): string[] {
  const u = uf.toLowerCase();
  const nome = `${u}${mun ? pad(mun, 5) : ""}${mun && zona ? `-z${pad(zona, 4)}` : ""}-c${pad(cargo, 4)}-e${pad(e.id, 6)}-u.json`;
  const dir = e.dirs?.u ?? `${BASE}/ele${e.ano}/${e.id}/dados/<uf>`;
  return [`${dir.replace(/<uf>/g, u)}/${nome}`];
}

/** Converte o EA20 (carg → agr → par → cand) para o formato dos parsers. */
export function achatarUnificado(json: any) {
  const cands: any[] = [];
  const cargo = +(json.carg?.[0]?.cd ?? 0);
  const majoritarioComTurno = [1, 3, 11].includes(cargo);
  // "e" = "s" vale para eleito OU para quem foi ao 2º turno; "st" só é preenchido na totalização final.
  const sit = (c: any) => {
    if (c.st) return { e: /^eleito/i.test(c.st) ? "s" : "n", st: c.st };
    if (c.e !== "s") return { e: "n", st: "" };
    if (!majoritarioComTurno) return { e: "s", st: "Eleito" };
    if (json.md === "e") return { e: "s", st: "Eleito" };
    if (json.md === "s") return { e: "n", st: "2º turno" };
    return { e: "n", st: "" };
  };
  for (const cg of json.carg ?? [])
    for (const agr of cg.agr ?? [])
      for (const par of agr.par ?? [])
        for (const c of par.cand ?? [])
          cands.push({
            n: c.n,
            sqcand: c.sqcand,
            nm: c.nmu || c.nm,
            sgp: String(par.sg ?? "").replace(/\*+$/, ""),
            cc: agr.tp && agr.tp !== "i" ? `${agr.nm ?? ""}${agr.com ? ` (${agr.com})` : ""}` : undefined,
            nv: (c.vs ?? []).find((v: any) => v.tp === "v")?.nmu,
            ...sit(c),
            dvt: c.dvt,
            vap: c.vap,
            pvap: c.pvap,
          });
  const v = json.v ?? {};
  const el = json.e ?? {};
  const se = json.s ?? {};
  return {
    e: el.te,
    c: el.c,
    a: el.a,
    vv: v.vv,
    vb: v.vb,
    tvn: v.tvn,
    pst: se.pst,
    dg: json.dt ?? json.dg,
    hg: json.ht ?? json.hg,
    cand: cands,
  };
}

export function formatoUnificado(e: Eleicao) {
  return !!e.dirs?.u || e.ano >= 2026;
}

export async function resultado(eleId: string, cargo: number, uf: string, mun?: string, zona?: string): Promise<Resultado> {
  const e = await obterEleicao(eleId);
  const json: any = MOCK
    ? mock.resumoBruto(e, cargo, uf.toLowerCase(), mun)
    : formatoUnificado(e)
      ? achatarUnificado(await getPrimeiro(arquivoUnificado(e, uf, mun, zona, cargo), ttlPara(e)))
      : await getPrimeiro(arquivo(e, uf, mun, cargo, "r"), ttlPara(e));
  return {
    eleicao: e.id,
    cargo,
    uf: uf.toLowerCase(),
    mun,
    totais: totaisDe(json),
    candidatos: candidatosDe(json, e.ano),
  };
}

export async function municipios(eleId: string): Promise<Record<string, MunicipioInfo[]>> {
  const e = await obterEleicao(eleId);
  if (MOCK) return mock.municipios();
  const nome = `mun-e${pad(e.id, 6)}-cm.json`;
  const urls = e.dirs?.cm ? [`${e.dirs.cm.replace(/\/?<uf>/g, "")}/${nome}`] : [];
  const json: any = await getPrimeiro([...urls, ...bases(e).map((b) => `${b}/config/${nome}`)], 60 * 60 * 24);
  const { UF_POR_SIGLA } = await import("./shared");
  const out: Record<string, MunicipioInfo[]> = {};
  for (const uf of json.abr ?? []) {
    const sigla = String(uf.cd ?? "").toLowerCase();
    out[sigla] = (uf.mu ?? []).map((m: any) => ({
      cd: pad(m.cd, 5),
      nome: String(m.nm ?? ""),
      // O TSE publica o código IBGE sem o prefixo da UF (5 dígitos) no formato 2026+
      ibge: m.cdi ? (String(m.cdi).length >= 7 ? String(m.cdi) : (UF_POR_SIGLA[sigla]?.ibge ?? "") + pad(m.cdi, 5)) : undefined,
      capital: String(m.c ?? "").toLowerCase() === "s",
      zonas: (m.z ?? []).map((z: any) => String(z)),
    }));
  }
  return out;
}

/** Variáveis (votos por subdivisão). */
async function variaveis(e: Eleicao, uf: string, mun: string | undefined, cargo: number) {
  if (MOCK) return mock.variaveis(e, uf, mun, cargo);
  return getPrimeiro(arquivo(e, uf, mun, cargo, "v"), ttlPara(e));
}

function votosDe(o: any): Record<string, number> {
  const out: Record<string, number> = {};
  const lista: any[] = o.cand ?? o.carg?.[0]?.cand ?? [];
  for (const c of lista) out[String(c.n)] = num(c.vap ?? c.v ?? c.qtv);
  return out;
}

function limitarVotos(v: Record<string, number>, top: number, manter: Set<string>) {
  const ent = Object.entries(v).sort((a, b) => b[1] - a[1]);
  if (ent.length <= top) return v;
  const out: Record<string, number> = {};
  ent.forEach(([n, q], i) => {
    if (i < top || manter.has(n)) out[n] = q;
  });
  return out;
}

async function mapaMunicipios(e: Eleicao) {
  try {
    return await municipios(e.id);
  } catch {
    return {} as Record<string, MunicipioInfo[]>;
  }
}

export interface OpcoesDistribuicao {
  nivel?: "uf" | "mun";
  top?: number;
  manter?: string[];
}

/**
 * Votos por subdivisão da abrangência pedida.
 * - uf=br  -> por estado (ou por município do país inteiro com nivel=mun)
 * - uf=xx  -> por município do estado
 * - uf=zz  -> por cidade no exterior
 * - mun=.. -> por zona eleitoral
 */
export async function distribuicao(
  eleId: string,
  cargo: number,
  uf: string,
  mun?: string,
  opts: OpcoesDistribuicao = {}
): Promise<Distribuicao> {
  const e = await obterEleicao(eleId);
  const u = uf.toLowerCase();
  const manter = new Set(opts.manter ?? []);
  const abrangencia = CARGOS[cargo]?.abrangencia ?? "uf";

  // Eleições municipais no nível estadual: cada município tem seus candidatos.
  if (abrangencia === "mun" && !mun) {
    return distribuicaoMunicipal(e, cargo, u);
  }
  // Cargos estaduais vistos no mapa do Brasil: um resultado por estado.
  if (abrangencia === "uf" && u === "br") {
    return distribuicaoPorUF(e, cargo);
  }

  const pai = await resultado(e.id, cargo, u, mun).catch(() => null);
  const candidatos = pai?.candidatos ?? [];
  const top = opts.top ?? (candidatos.length > 30 ? 5 : 1000);
  const mapaMun = await mapaMunicipios(e);

  // Formato 2026+ (EA20): um arquivo por estado/município/zona, sem arquivo agregado de variáveis.
  if (formatoUnificado(e) && !MOCK) {
    const { UFS } = await import("./shared");
    let nivel: Nivel;
    let areas: Area[];
    if (mun) {
      nivel = "zona";
      const zonas = mapaMun[u]?.find((m) => m.cd === pad(mun, 5))?.zonas ?? [];
      areas = (
        await mapLimit(zonas, 16, async (z) => {
          try {
            const r = await resultado(e.id, cargo, u, mun, z);
            const votos: Record<string, number> = {};
            for (const c of r.candidatos) votos[c.n] = c.votos;
            return { cd: pad(z, 4), nome: `Zona ${+z}`, uf: u, totais: r.totais, votos: limitarVotos(votos, top, manter) } as Area;
          } catch {
            return null;
          }
        })
      ).filter(Boolean) as Area[];
    } else if (u === "br" && opts.nivel === "mun") {
      nivel = "mun";
      const partes = await mapLimit(UFS, 4, (x) => areasPorResumo(e, cargo, x.sigla.toLowerCase(), mapaMun[x.sigla.toLowerCase()] ?? [], top, manter, 12));
      areas = partes.flat();
    } else if (u === "br") {
      nivel = "uf";
      const filhos = [...UFS.map((x) => ({ cd: x.sigla.toLowerCase(), nome: x.nome, ibge: x.ibge, zonas: [] })), { cd: "zz", nome: "Exterior", zonas: [] }];
      areas = await areasPorResumo(e, cargo, "br", filhos, top, manter, 28);
    } else {
      nivel = u === "zz" ? "exterior" : "mun";
      areas = await areasPorResumo(e, cargo, u, mapaMun[u] ?? [], top, manter, 32);
    }
    const aviso = areas.length ? undefined : "O TSE ainda não publicou o detalhamento para esta abrangência.";
    return { eleicao: e.id, cargo, uf: u, mun, nivel, areas, candidatos, aviso };
  }

  if (u === "br" && opts.nivel === "mun") {
    const ufs = Object.keys(mapaMun).filter((s) => s !== "zz" && s !== "br");
    const lista = ufs.length ? ufs : (await import("./shared")).UFS.map((x) => x.sigla.toLowerCase());
    const partes = await mapLimit(lista, 8, async (sigla) => {
      try {
        const json = await variaveis(e, sigla, undefined, cargo);
        return areasMunicipais(json, sigla, mapaMun[sigla] ?? [], top, manter);
      } catch {
        return areasPorResumo(e, cargo, sigla, mapaMun[sigla] ?? [], top, manter, 6);
      }
    });
    return { eleicao: e.id, cargo, uf: u, nivel: "mun", areas: partes.flat(), candidatos };
  }

  let json: any;
  try {
    json = await variaveis(e, u, mun, cargo);
  } catch (erro) {
    // Sem o arquivo de variáveis: monta a distribuição com os resumos (-r.json) de cada subdivisão
    if (mun) throw erro;
    let filhos: MunicipioInfo[];
    if (u === "br") {
      const { UFS } = await import("./shared");
      filhos = [...UFS.map((x) => ({ cd: x.sigla.toLowerCase(), nome: x.nome, ibge: x.ibge, zonas: [] })), { cd: "zz", nome: "Exterior", zonas: [] }];
    } else filhos = mapaMun[u] ?? [];
    const areas = await areasPorResumo(e, cargo, u, filhos, top, manter, 24);
    if (!areas.length) throw erro;
    return { eleicao: e.id, cargo, uf: u, nivel: u === "br" ? "uf" : u === "zz" ? "exterior" : "mun", areas, candidatos };
  }
  const areas = areasDe(json);
  let nivel: Nivel;
  let lista: Area[];

  if (mun) {
    nivel = "zona";
    lista = areas
      .filter((a) => a.tipo.startsWith("Z"))
      .map((a) => ({
        cd: pad(a.cd, 4),
        nome: `Zona ${+a.cd}`,
        uf: u,
        totais: totaisDe(a.o),
        votos: limitarVotos(votosDe(a.o), top, manter),
      }));
  } else if (u === "br") {
    nivel = "uf";
    const { UF_POR_SIGLA } = await import("./shared");
    lista = areas
      .filter((a) => a.tipo === "UF" || (a.cd.length === 2 && a.cd.toLowerCase() !== "br"))
      .map((a) => {
        const sigla = a.cd.toLowerCase();
        return {
          cd: sigla,
          nome: sigla === "zz" ? "Exterior" : UF_POR_SIGLA[sigla]?.nome ?? sigla.toUpperCase(),
          ibge: UF_POR_SIGLA[sigla]?.ibge,
          uf: sigla,
          totais: totaisDe(a.o),
          votos: limitarVotos(votosDe(a.o), top, manter),
        };
      });
  } else {
    nivel = u === "zz" ? "exterior" : "mun";
    lista = areasMunicipais(json, u, mapaMun[u] ?? [], top, manter);
  }

  const aviso = lista.length ? undefined : "O TSE não disponibilizou o detalhamento para esta abrangência.";
  return { eleicao: e.id, cargo, uf: u, mun, nivel, areas: lista, candidatos, aviso };
}

function areasMunicipais(json: any, uf: string, infos: MunicipioInfo[], top: number, manter: Set<string>): Area[] {
  const porCd = new Map(infos.map((m) => [m.cd, m]));
  return areasDe(json)
    .filter((a) => a.tipo === "MU" || a.tipo === "M" || a.tipo === "MUN" || a.cd.length >= 4)
    .map((a) => {
      const cd = pad(a.cd, 5);
      const info = porCd.get(cd);
      return {
        cd,
        nome: info?.nome ?? String(a.o.nm ?? a.o.nmabr ?? cd),
        ibge: info?.ibge,
        uf,
        totais: totaisDe(a.o),
        votos: limitarVotos(votosDe(a.o), top, manter),
      };
    });
}

/** Distribuição a partir dos arquivos de resumo de cada subdivisão (plano B quando não há -v.json). */
async function areasPorResumo(
  e: Eleicao,
  cargo: number,
  uf: string,
  filhos: MunicipioInfo[],
  top: number,
  manter: Set<string>,
  limite: number
): Promise<Area[]> {
  const brasil = uf === "br";
  let falhas = 0;
  const res = await mapLimit(filhos, limite, async (f) => {
    try {
      const r = brasil ? await resultado(e.id, cargo, f.cd) : await resultado(e.id, cargo, uf, f.cd);
      const votos: Record<string, number> = {};
      for (const c of r.candidatos) votos[c.n] = c.votos;
      return { cd: f.cd, nome: f.nome, ibge: f.ibge, uf: brasil ? f.cd : uf, totais: r.totais, votos: limitarVotos(votos, top, manter) } as Area;
    } catch (erro) {
      if (!(erro instanceof TSEError && erro.status === 404)) falhas++;
      return null;
    }
  });
  // Evita guardar em cache um mapa incompleto por instabilidade momentânea do TSE
  if (falhas > Math.max(2, filhos.length * 0.05)) throw new TSEError("O TSE está instável no momento; tente novamente em instantes.", 503);
  return res.filter(Boolean) as Area[];
}

async function distribuicaoMunicipal(e: Eleicao, cargo: number, uf: string): Promise<Distribuicao> {
  const mapa = await mapaMunicipios(e);
  const lista = mapa[uf] ?? [];
  if (!lista.length) {
    return { eleicao: e.id, cargo, uf, nivel: "mun", areas: [], candidatos: [], aviso: "Lista de municípios indisponível." };
  }
  const areas = (
    await mapLimit(lista, 24, async (m) => {
      try {
        const r = await resultado(e.id, cargo, uf, m.cd);
        if (!r.candidatos.length) return null;
        const cands = cargo === 13 ? r.candidatos.slice(0, 5) : r.candidatos.slice(0, 4);
        const votos: Record<string, number> = {};
        for (const c of cands) votos[c.n] = c.votos;
        return { cd: m.cd, nome: m.nome, ibge: m.ibge, uf, totais: r.totais, votos, cands } as Area;
      } catch {
        return null; // município sem 2º turno, por exemplo
      }
    })
  ).filter(Boolean) as Area[];
  return {
    eleicao: e.id,
    cargo,
    uf,
    nivel: "mun",
    areas,
    candidatos: [],
    aviso: areas.length ? undefined : "Nenhum município com resultado para este cargo/turno.",
  };
}

async function distribuicaoPorUF(e: Eleicao, cargo: number): Promise<Distribuicao> {
  const { UFS } = await import("./shared");
  const ufs = UFS.filter((u) => (cargo === 8 ? u.sigla === "DF" : cargo === 7 ? u.sigla !== "DF" : true));
  const areas = (
    await mapLimit(ufs, 14, async (u) => {
      const sigla = u.sigla.toLowerCase();
      try {
        const r = await resultado(e.id, cargo, sigla);
        if (!r.candidatos.length) return null;
        const cands = r.candidatos.slice(0, cargo >= 6 ? 5 : 4);
        const votos: Record<string, number> = {};
        for (const c of cands) votos[c.n] = c.votos;
        return { cd: sigla, nome: u.nome, ibge: u.ibge, uf: sigla, totais: r.totais, votos, cands } as Area;
      } catch {
        return null; // estado sem 2º turno, por exemplo
      }
    })
  ).filter(Boolean) as Area[];
  return {
    eleicao: e.id,
    cargo,
    uf: "br",
    nivel: "uf",
    areas,
    candidatos: [],
    aviso: areas.length ? undefined : "Nenhum estado com resultado para este cargo/turno.",
  };
}

export async function mapLimit<T, R>(itens: T[], limite: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(itens.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (i < itens.length) {
      const k = i++;
      out[k] = await fn(itens[k]);
    }
  });
  await Promise.all(workers);
  return out;
}
