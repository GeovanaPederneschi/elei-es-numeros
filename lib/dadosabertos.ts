// Resultados de eleições antigas a partir do Portal de Dados Abertos do TSE (cdn.tse.jus.br).
//
// Os arquivos são ZIPs de centenas de MB com um CSV por UF. Em vez de baixar o ZIP inteiro,
// lemos o diretório central com "range requests" e baixamos só a entrada (CSV) da UF pedida,
// descompactando em streaming. O resultado agregado fica em memória e no cache de dados.

import { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";
import { createInterface } from "node:readline";
import { Area, Candidato, Distribuicao, Eleicao, MunicipioInfo, Nivel, Resultado, Totais, UFS, UF_POR_SIGLA, partidoPorNumero } from "./shared";

const CDN = process.env.TSE_DADOS_ABERTOS_URL || "https://cdn.tse.jus.br/estatistica/sead/odsele";
const UA = "Mozilla/5.0 (eleicoes-em-numeros)";

export class DadosAbertosErro extends Error {}

// ---------------------------------------------------------------------------
// Leitura parcial de ZIP via HTTP Range
// ---------------------------------------------------------------------------

interface EntradaZip {
  nome: string;
  metodo: number;
  tamanhoComprimido: number;
  offsetLocal: number;
}

async function faixa(url: string, inicio: number, fim: number): Promise<Buffer> {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers: { Range: `bytes=${inicio}-${fim}`, "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(30000) });
      if (r.status !== 206 && r.status !== 200) throw new DadosAbertosErro(`HTTP ${r.status} em ${url}`);
      const buf = Buffer.from(await r.arrayBuffer());
      return r.status === 200 ? buf.subarray(inicio, fim + 1) : buf;
    } catch (e) {
      if (t === 2) throw e;
    }
  }
  throw new DadosAbertosErro("falha no download");
}

async function tamanhoRemoto(url: string): Promise<number> {
  const r = await fetch(url, { headers: { Range: "bytes=0-0", "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  const cr = r.headers.get("content-range");
  await r.body?.cancel();
  if (cr && /\/(\d+)$/.test(cr)) return +/\/(\d+)$/.exec(cr)![1];
  const len = r.headers.get("content-length");
  if (r.status === 200 && len) return +len;
  throw new DadosAbertosErro(`Não foi possível obter o tamanho de ${url} (HTTP ${r.status})`);
}

const diretorios = new Map<string, Promise<EntradaZip[]>>();

function listarZip(url: string): Promise<EntradaZip[]> {
  if (!diretorios.has(url)) {
    const p = (async () => {
      const total = await tamanhoRemoto(url);
      const cauda = await faixa(url, Math.max(0, total - 65557), total - 1);
      let eocd = -1;
      for (let i = cauda.length - 22; i >= 0; i--) if (cauda.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
      if (eocd < 0) throw new DadosAbertosErro("ZIP inválido (EOCD não encontrado)");
      let cdTam = cauda.readUInt32LE(eocd + 12);
      let cdOff = cauda.readUInt32LE(eocd + 16);
      if (cdOff === 0xffffffff || cdTam === 0xffffffff) {
        // ZIP64
        const loc = eocd - 20;
        if (loc < 0 || cauda.readUInt32LE(loc) !== 0x07064b50) throw new DadosAbertosErro("ZIP64 sem localizador");
        const z64off = Number(cauda.readBigUInt64LE(loc + 8));
        const z64 = await faixa(url, z64off, z64off + 55);
        cdTam = Number(z64.readBigUInt64LE(40));
        cdOff = Number(z64.readBigUInt64LE(48));
      }
      const cd = await faixa(url, cdOff, cdOff + cdTam - 1);
      const out: EntradaZip[] = [];
      let p = 0;
      while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
        const metodo = cd.readUInt16LE(p + 10);
        let comp = cd.readUInt32LE(p + 20);
        let descomp = cd.readUInt32LE(p + 24);
        const nLen = cd.readUInt16LE(p + 28);
        const xLen = cd.readUInt16LE(p + 30);
        const cLen = cd.readUInt16LE(p + 32);
        let off = cd.readUInt32LE(p + 42);
        const nome = cd.subarray(p + 46, p + 46 + nLen).toString("latin1");
        // campos estendidos ZIP64
        let x = p + 46 + nLen;
        const xFim = x + xLen;
        while (x + 4 <= xFim) {
          const id = cd.readUInt16LE(x);
          const tam = cd.readUInt16LE(x + 2);
          if (id === 0x0001) {
            let q = x + 4;
            if (descomp === 0xffffffff) { descomp = Number(cd.readBigUInt64LE(q)); q += 8; }
            if (comp === 0xffffffff) { comp = Number(cd.readBigUInt64LE(q)); q += 8; }
            if (off === 0xffffffff) { off = Number(cd.readBigUInt64LE(q)); q += 8; }
          }
          x += 4 + tam;
        }
        out.push({ nome, metodo, tamanhoComprimido: comp, offsetLocal: off });
        p += 46 + nLen + xLen + cLen;
      }
      return out;
    })();
    p.catch(() => diretorios.delete(url));
    diretorios.set(url, p);
  }
  return diretorios.get(url)!;
}

/** Percorre as linhas de um CSV dentro do ZIP remoto (latin1, separado por ";"). */
async function* linhasDaEntrada(url: string, e: EntradaZip): AsyncGenerator<string> {
  const cab = await faixa(url, e.offsetLocal, e.offsetLocal + 29);
  if (cab.readUInt32LE(0) !== 0x04034b50) throw new DadosAbertosErro("Cabeçalho local inválido no ZIP");
  const inicio = e.offsetLocal + 30 + cab.readUInt16LE(26) + cab.readUInt16LE(28);
  const fim = inicio + e.tamanhoComprimido - 1;
  const r = await fetch(url, { headers: { Range: `bytes=${inicio}-${fim}`, "User-Agent": UA }, cache: "no-store" });
  if (r.status !== 206 || !r.body) throw new DadosAbertosErro(`O servidor não aceitou download parcial (HTTP ${r.status})`);
  let fluxo: NodeJS.ReadableStream = Readable.fromWeb(r.body as any);
  if (e.metodo === 8) fluxo = fluxo.pipe(createInflateRaw());
  else if (e.metodo !== 0) throw new DadosAbertosErro(`Compressão ZIP não suportada (método ${e.metodo})`);
  fluxo.setEncoding("latin1");
  const rl = createInterface({ input: fluxo, crlfDelay: Infinity });
  for await (const l of rl) yield l;
}

function dividir(l: string): string[] {
  if (l.startsWith('"')) return l.slice(1, l.endsWith('"') ? -1 : undefined).split('";"');
  return l.split(";");
}

// ---------------------------------------------------------------------------
// Agregação
// ---------------------------------------------------------------------------

interface InfoCand {
  n: string;
  nome: string;
  partido: string;
  situacao: string;
}

interface Agregado {
  cands: Map<string, InfoCand>;
  /** chave "UF|MUN|ZONA" -> votos por número */
  votos: Map<string, Map<string, number>>;
  /** chave "UF|MUN|ZONA" -> totais */
  totais: Map<string, Totais>;
  nomesMun: Map<string, string>; // "UF|MUN" -> nome
}

const agregados = new Map<string, Promise<Agregado>>();
const MAX_AGREGADOS = 6;

function entradaDaUF(lista: EntradaZip[], uf: string, ano: number, base: string): EntradaZip[] {
  const csv = lista.filter((x) => /\.csv$/i.test(x.nome));
  const U = uf.toUpperCase();
  const exata = csv.filter((x) => new RegExp(`${base}_${ano}_${U}\\.csv$`, "i").test(x.nome));
  if (exata.length) return exata;
  const brasil = csv.filter((x) => /_BRASIL\.csv$/i.test(x.nome));
  return brasil.length ? brasil : [];
}

/**
 * Votos de um cargo/turno numa UF (ou "BR" para presidente, que tem arquivo próprio).
 * Para presidente o arquivo BR traz todos os municípios do país e o exterior (ZZ).
 */
function agregar(ano: number, turno: number, cargo: number, ufArquivo: string): Promise<Agregado> {
  const chave = `${ano}|${turno}|${cargo}|${ufArquivo}`;
  if (agregados.has(chave)) return agregados.get(chave)!;
  const p = (async () => {
    const urlVot = `${CDN}/votacao_candidato_munzona/votacao_candidato_munzona_${ano}.zip`;
    const urlDet = `${CDN}/detalhe_votacao_munzona/detalhe_votacao_munzona_${ano}.zip`;
    const ag: Agregado = { cands: new Map(), votos: new Map(), totais: new Map(), nomesMun: new Map() };

    const lista = await listarZip(urlVot);
    const porUF = lista.filter((x) => /_[A-Z]{2}\.csv$/i.test(x.nome) && !/_BR\.csv$/i.test(x.nome));
    let entradas = entradaDaUF(lista, ufArquivo, ano, "votacao_candidato_munzona");
    // anos sem arquivo BR: presidente está espalhado pelos arquivos das UFs
    if (!entradas.length && ufArquivo === "BR") entradas = porUF;
    if (!entradas.length) throw new DadosAbertosErro(`Arquivo de ${ufArquivo} não encontrado nos dados abertos de ${ano}.`);

    // votos e totais são lidos em paralelo para caber no tempo da função
    const totaisP = lerTotais();
    await lerVotos(entradas);
    if (!ag.votos.size && ufArquivo === "BR" && entradas !== porUF) await lerVotos(porUF);
    await totaisP;
    if (!ag.votos.size) throw new DadosAbertosErro(`Sem votos de ${ufArquivo} para este cargo/turno nos dados abertos de ${ano}.`);

    async function lerVotos(ents: EntradaZip[]) {
    for (const ent of ents) {
      let idx: Record<string, number> | null = null;
      for await (const linha of linhasDaEntrada(urlVot, ent)) {
        const c = dividir(linha);
        if (!idx) {
          idx = Object.fromEntries(c.map((n, i) => [n.trim().toUpperCase(), i]));
          if (idx["CD_CARGO"] === undefined) throw new DadosAbertosErro(`Formato inesperado do CSV de ${ano} (sem cabeçalho).`);
          continue;
        }
        if (+c[idx["CD_CARGO"]] !== cargo || +c[idx["NR_TURNO"]] !== turno) continue;
        const uf = c[idx["SG_UF"]];
        const mun = c[idx["CD_MUNICIPIO"]].padStart(5, "0");
        const zona = c[idx["NR_ZONA"]].padStart(4, "0");
        const n = c[idx["NR_CANDIDATO"]];
        const votos = +(c[idx["QT_VOTOS_NOMINAIS_VALIDOS"] ?? idx["QT_VOTOS_NOMINAIS"]] ?? 0) || 0;
        const k = `${uf}|${mun}|${zona}`;
        let m = ag.votos.get(k);
        if (!m) ag.votos.set(k, (m = new Map()));
        m.set(n, (m.get(n) ?? 0) + votos);
        if (!ag.nomesMun.has(`${uf}|${mun}`)) ag.nomesMun.set(`${uf}|${mun}`, c[idx["NM_MUNICIPIO"]]);
        if (!ag.cands.has(n)) {
          const sigla = c[idx["SG_PARTIDO"]] || partidoPorNumero(n, ano) || "";
          ag.cands.set(n, { n, nome: c[idx["NM_URNA_CANDIDATO"]] || c[idx["NM_CANDIDATO"]], partido: sigla, situacao: c[idx["DS_SIT_TOT_TURNO"]] || "" });
        }
      }
    }
    }

    return ag;

    // Totais (eleitorado, comparecimento, brancos, nulos) — opcional
    async function lerTotais() {
    try {
      const listaDet = await listarZip(urlDet);
      let ents = entradaDaUF(listaDet, ufArquivo, ano, "detalhe_votacao_munzona");
      if (!ents.length && ufArquivo === "BR") ents = listaDet.filter((x) => /_[A-Z]{2}\.csv$/i.test(x.nome) && !/_BR\.csv$/i.test(x.nome));
      for (const ent of ents) {
        let idx: Record<string, number> | null = null;
        for await (const linha of linhasDaEntrada(urlDet, ent)) {
          const c = dividir(linha);
          if (!idx) {
            idx = Object.fromEntries(c.map((n, i) => [n.trim().toUpperCase(), i]));
            continue;
          }
          if (+c[idx["CD_CARGO"]] !== cargo || +c[idx["NR_TURNO"]] !== turno) continue;
          const g = (...nomes: string[]) => {
            for (const n of nomes) if (idx![n] !== undefined) return +c[idx![n]] || 0;
            return 0;
          };
          const k = `${c[idx["SG_UF"]]}|${c[idx["CD_MUNICIPIO"]].padStart(5, "0")}|${c[idx["NR_ZONA"]].padStart(4, "0")}`;
          const t = ag.totais.get(k) ?? { eleitorado: 0, comparecimento: 0, abstencao: 0, validos: 0, brancos: 0, nulos: 0 };
          t.eleitorado += g("QT_APTOS");
          t.comparecimento += g("QT_COMPARECIMENTO");
          t.abstencao += g("QT_ABSTENCOES", "QT_ABSTENCAO");
          t.validos += g("QT_VOTOS_VALIDOS");
          t.brancos += g("QT_VOTOS_BRANCOS");
          t.nulos += g("QT_TOTAL_VOTOS_NULOS", "QT_VOTOS_NULOS");
          ag.totais.set(k, t);
        }
      }
    } catch {
      // sem totais detalhados: seguimos só com os votos dos candidatos
    }
    }
  })();
  p.catch(() => agregados.delete(chave));
  agregados.set(chave, p);
  if (agregados.size > MAX_AGREGADOS) agregados.delete(agregados.keys().next().value as string);
  return p;
}

// ---------------------------------------------------------------------------
// Conversão para o formato do site
// ---------------------------------------------------------------------------

function somarTotais(lista: (Totais | undefined)[]): Totais {
  const t: Totais = { eleitorado: 0, comparecimento: 0, abstencao: 0, validos: 0, brancos: 0, nulos: 0, secoesPct: 100 };
  for (const x of lista) {
    if (!x) continue;
    t.eleitorado += x.eleitorado;
    t.comparecimento += x.comparecimento;
    t.abstencao += x.abstencao;
    t.validos += x.validos;
    t.brancos += x.brancos;
    t.nulos += x.nulos;
  }
  return t;
}

function situacaoLegivel(s: string): { eleito: boolean; situacao: string } {
  const S = s.toUpperCase();
  if (S.startsWith("ELEITO")) return { eleito: true, situacao: S === "ELEITO" ? "Eleito" : s.charAt(0) + s.slice(1).toLowerCase() };
  if (S.includes("2º TURNO") || S.includes("2O TURNO") || S.includes("SEGUNDO")) return { eleito: false, situacao: "2º turno" };
  if (S.includes("SUPLENTE")) return { eleito: false, situacao: "Suplente" };
  return { eleito: false, situacao: s ? s.charAt(0) + s.slice(1).toLowerCase() : "" };
}

/** Filtra as chaves "UF|MUN|ZONA" do agregado conforme a abrangência pedida. */
function filtro(uf: string, mun?: string, zona?: string) {
  const U = uf.toUpperCase();
  return (k: string) => {
    const [u, m, z] = k.split("|");
    if (U !== "BR" && u !== U) return false;
    if (mun && m !== mun.padStart(5, "0")) return false;
    if (zona && z !== zona.padStart(4, "0")) return false;
    return true;
  };
}

function montarResultado(ag: Agregado, e: Eleicao, cargo: number, uf: string, mun?: string, zona?: string): Resultado {
  const ok = filtro(uf, mun, zona);
  const votos = new Map<string, number>();
  const tots: Totais[] = [];
  for (const [k, m] of ag.votos) {
    if (!ok(k)) continue;
    for (const [n, v] of m) votos.set(n, (votos.get(n) ?? 0) + v);
  }
  for (const [k, t] of ag.totais) if (ok(k)) tots.push(t);
  const somaCand = [...votos.values()].reduce((a, b) => a + b, 0);
  const totais = somarTotais(tots);
  if (!totais.validos || totais.validos < somaCand) totais.validos = somaCand;
  const base = [1, 3, 5, 11].includes(cargo) ? somaCand : totais.validos;
  const candidatos: Candidato[] = [...votos.entries()]
    .map(([n, v]) => {
      const info = ag.cands.get(n);
      const s = situacaoLegivel(info?.situacao ?? "");
      return { n, nome: info?.nome ?? n, partido: info?.partido ?? "", votos: v, pct: base ? (100 * v) / base : 0, ...s };
    })
    .filter((c) => c.votos > 0 || c.eleito)
    .sort((a, b) => b.votos - a.votos);
  if (!candidatos.length) throw new DadosAbertosErro("Sem votos para esta abrangência nos dados abertos.");
  return { eleicao: e.id, cargo, uf: uf.toLowerCase(), mun, totais, candidatos };
}

function arquivoDe(cargo: number, uf: string) {
  return cargo === 1 ? "BR" : uf.toUpperCase();
}

export async function resultadoDA(e: Eleicao, cargo: number, uf: string, mun?: string, zona?: string): Promise<Resultado> {
  const u = uf.toLowerCase();
  if (cargo !== 1 && u === "br") throw new DadosAbertosErro("Sem abrangência nacional para este cargo.");
  const ag = await agregar(e.ano, e.turno, cargo, arquivoDe(cargo, u));
  return montarResultado(ag, e, cargo, u, mun, zona);
}

function limitar(v: Map<string, number>, top: number, manter: Set<string>): Record<string, number> {
  const ent = [...v.entries()].sort((a, b) => b[1] - a[1]);
  const out: Record<string, number> = {};
  ent.forEach(([n, q], i) => {
    if (i < top || manter.has(n)) out[n] = q;
  });
  return out;
}

export async function distribuicaoDA(
  e: Eleicao,
  cargo: number,
  uf: string,
  mun: string | undefined,
  opts: { nivel?: "uf" | "mun"; top?: number; manter?: string[] },
  ibgePorMun: Map<string, string>
): Promise<Distribuicao> {
  const u = uf.toLowerCase();
  const manter = new Set(opts.manter ?? []);

  // Cargos estaduais vistos no Brasil: um resultado por UF (cada UF com seus candidatos)
  if (u === "br" && cargo !== 1) {
    const ufs = UFS.filter((x) => (cargo === 8 ? x.sigla === "DF" : cargo === 7 ? x.sigla !== "DF" : true));
    const areas: Area[] = [];
    await Promise.all(
      ufs.map(async (x) => {
        try {
          const r = await resultadoDA(e, cargo, x.sigla.toLowerCase());
          const cands = r.candidatos.slice(0, cargo >= 6 ? 5 : 4);
          areas.push({ cd: x.sigla.toLowerCase(), nome: x.nome, ibge: x.ibge, uf: x.sigla.toLowerCase(), totais: r.totais, votos: Object.fromEntries(cands.map((c) => [c.n, c.votos])), cands });
        } catch {}
      })
    );
    return { eleicao: e.id, cargo, uf: "br", nivel: "uf", areas, candidatos: [] };
  }

  const ag = await agregar(e.ano, e.turno, cargo, arquivoDe(cargo, u));
  const pai = montarResultado(ag, e, cargo, u, mun);
  const top = opts.top ?? (pai.candidatos.length > 30 ? 5 : 1000);

  // agrupa conforme o nível
  let nivel: Nivel;
  let grupo: (k: string) => string | null;
  if (mun) {
    nivel = "zona";
    const ok = filtro(u, mun);
    grupo = (k) => (ok(k) ? k.split("|")[2] : null);
  } else if (u === "br" && opts.nivel === "mun") {
    nivel = "mun";
    grupo = (k) => {
      const [uf_, m] = k.split("|");
      return uf_ === "ZZ" ? null : `${uf_}|${m}`;
    };
  } else if (u === "br") {
    nivel = "uf";
    grupo = (k) => k.split("|")[0];
  } else {
    nivel = u === "zz" ? "exterior" : "mun";
    const ok = filtro(u);
    grupo = (k) => (ok(k) ? `${k.split("|")[0]}|${k.split("|")[1]}` : null);
  }

  const votosG = new Map<string, Map<string, number>>();
  const totG = new Map<string, Totais[]>();
  for (const [k, m] of ag.votos) {
    const g = grupo(k);
    if (!g) continue;
    let acc = votosG.get(g);
    if (!acc) votosG.set(g, (acc = new Map()));
    for (const [n, v] of m) acc.set(n, (acc.get(n) ?? 0) + v);
  }
  for (const [k, t] of ag.totais) {
    const g = grupo(k);
    if (!g) continue;
    (totG.get(g) ?? totG.set(g, []).get(g)!).push(t);
  }

  const areas: Area[] = [...votosG.entries()].map(([g, m]) => {
    const totais = somarTotais(totG.get(g) ?? []);
    const soma = [...m.values()].reduce((a, b) => a + b, 0);
    if (!totais.validos || totais.validos < soma) totais.validos = soma;
    if ([1, 3, 5, 11].includes(cargo)) totais.validos = soma;
    if (nivel === "zona") return { cd: g, nome: `Zona ${+g}`, uf: u, totais, votos: limitar(m, top, manter) };
    if (nivel === "uf") {
      const sigla = g.toLowerCase();
      return { cd: sigla, nome: sigla === "zz" ? "Exterior" : UF_POR_SIGLA[sigla]?.nome ?? g, ibge: UF_POR_SIGLA[sigla]?.ibge, uf: sigla, totais, votos: limitar(m, top, manter) };
    }
    const [sg, cd] = g.split("|");
    const nome = ag.nomesMun.get(g) ?? cd;
    return { cd, nome, ibge: ibgePorMun.get(`${sg.toLowerCase()}|${cd}`), uf: sg.toLowerCase(), totais, votos: limitar(m, top, manter) };
  });

  return { eleicao: e.id, cargo, uf: u, mun, nivel, areas, candidatos: pai.candidatos };
}

/** Municípios e zonas (para eleições antigas, a partir do próprio CSV). */
export async function municipiosDA(e: Eleicao, uf: string, cargo: number): Promise<MunicipioInfo[]> {
  const ag = await agregar(e.ano, e.turno, cargo, arquivoDe(cargo, uf));
  const U = uf.toUpperCase();
  const mapa = new Map<string, MunicipioInfo>();
  for (const k of ag.votos.keys()) {
    const [u, m, z] = k.split("|");
    if (u !== U) continue;
    const info = mapa.get(m) ?? { cd: m, nome: ag.nomesMun.get(`${u}|${m}`) ?? m, zonas: [] };
    if (!info.zonas.includes(z)) info.zonas.push(z);
    mapa.set(m, info);
  }
  return [...mapa.values()];
}

// ---------------------------------------------------------------------------
// Resumo compacto de uma UF (todos os cargos e turnos) — usado na trajetória
// ---------------------------------------------------------------------------

/** [turno, cargo, municipio, nomeMunicipio, numero, nomeUrna, partido, votos, pct, situacao] */
export type LinhaResumo = [number, number, string, string, string, string, string, number, number, string];

const resumos = new Map<string, Promise<LinhaResumo[]>>();

export function resumoUF(ano: number, uf: string): Promise<LinhaResumo[]> {
  const U = uf.toUpperCase();
  const chave = `${ano}|${U}`;
  if (resumos.has(chave)) return resumos.get(chave)!;
  const p = (async () => {
    const url = `${CDN}/votacao_candidato_munzona/votacao_candidato_munzona_${ano}.zip`;
    const lista = await listarZip(url);
    const ents = entradaDaUF(lista, U, ano, "votacao_candidato_munzona");
    if (!ents.length) throw new DadosAbertosErro(`Arquivo de ${U} não encontrado nos dados abertos de ${ano}.`);
    const acc = new Map<string, { t: number; c: number; mun: string; munNome: string; n: string; nome: string; partido: string; votos: number; sit: string }>();
    const totais = new Map<string, number>();
    for (const ent of ents) {
      let idx: Record<string, number> | null = null;
      for await (const linha of linhasDaEntrada(url, ent)) {
        const c = dividir(linha);
        if (!idx) {
          idx = Object.fromEntries(c.map((n, i) => [n.trim().toUpperCase(), i]));
          if (idx["CD_CARGO"] === undefined) throw new DadosAbertosErro(`Formato inesperado do CSV de ${ano}.`);
          continue;
        }
        if (c[idx["SG_UF"]] !== U) continue;
        const cargo = +c[idx["CD_CARGO"]];
        if (cargo === 1) continue; // presidente: base nacional própria
        const t = +c[idx["NR_TURNO"]];
        const municipal = cargo >= 11;
        const mun = municipal ? c[idx["CD_MUNICIPIO"]].padStart(5, "0") : "";
        const n = c[idx["NR_CANDIDATO"]];
        const votos = +(c[idx["QT_VOTOS_NOMINAIS_VALIDOS"] ?? idx["QT_VOTOS_NOMINAIS"]] ?? 0) || 0;
        const escopo = `${t}|${cargo}|${mun}`;
        totais.set(escopo, (totais.get(escopo) ?? 0) + votos);
        const k = `${escopo}|${n}`;
        const r = acc.get(k);
        if (r) r.votos += votos;
        else
          acc.set(k, {
            t,
            c: cargo,
            mun,
            munNome: municipal ? c[idx["NM_MUNICIPIO"]] : "",
            n,
            nome: c[idx["NM_URNA_CANDIDATO"]] || c[idx["NM_CANDIDATO"]],
            partido: c[idx["SG_PARTIDO"]] || partidoPorNumero(n, ano) || "",
            votos,
            sit: c[idx["DS_SIT_TOT_TURNO"]] || "",
          });
      }
    }
    const out: LinhaResumo[] = [];
    for (const r of acc.values()) {
      if (!r.votos && !/^ELEITO/i.test(r.sit)) continue;
      const tot = totais.get(`${r.t}|${r.c}|${r.mun}`) || 1;
      out.push([r.t, r.c, r.mun, r.munNome, r.n, r.nome, r.partido, r.votos, Math.round((10000 * r.votos) / tot) / 100, r.sit]);
    }
    return out;
  })();
  p.catch(() => resumos.delete(chave));
  resumos.set(chave, p);
  if (resumos.size > 8) resumos.delete(resumos.keys().next().value as string);
  return p;
}

export { situacaoLegivel };

// ---------------------------------------------------------------------------
// Locais de votação (endereço e coordenadas) — usados para desenhar as zonas
// ---------------------------------------------------------------------------

/** [zona, nº do local, nome, endereço, bairro, latitude, longitude, eleitores] */
export type LocalVotacao = [string, string, string, string, string, number, number, number];

const locaisCache = new Map<string, Promise<{ ano: number; porMun: Record<string, LocalVotacao[]> }>>();

function coord(v: string | undefined): number {
  if (!v) return NaN;
  const n = parseFloat(v.replace(",", "."));
  return n === 0 || n === -1 ? NaN : n;
}

/**
 * Endereços possíveis do cadastro de locais de votação. Primeiro pergunta ao portal de dados abertos
 * (API CKAN), que lista os arquivos publicados; depois tenta os nomes conhecidos.
 */
let urlsLocais: Promise<{ url: string; ano: number }[]> | null = null;
function urlsLocaisVotacao(): Promise<{ url: string; ano: number }[]> {
  if (urlsLocais) return urlsLocais;
  urlsLocais = (async () => {
    const achadas = new Map<string, number>();
    const CKAN = process.env.TSE_CKAN_URL || "https://dadosabertos.tse.jus.br/api/3/action/package_search";
    for (const q of ["local de votação", "locais de votação", "eleitorado local votacao"]) {
      try {
        const r = await fetch(`${CKAN}?q=${encodeURIComponent(q)}&rows=50`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000), next: { revalidate: 86400 } } as RequestInit);
        if (!r.ok) continue;
        const j: any = await r.json();
        for (const pac of j?.result?.results ?? [])
          for (const rec of pac.resources ?? []) {
            const url: string = rec.url ?? "";
            if (!/\.zip$/i.test(url) || !/local_?votac|locais_?votac|local-votac/i.test(url)) continue;
            const ano = +(/(20\d{2})/.exec(url)?.[1] ?? 0);
            achadas.set(url, ano);
          }
      } catch {}
      if (achadas.size) break;
    }
    const anoAtual = new Date().getFullYear();
    for (let ano = anoAtual; ano >= anoAtual - 6; ano--)
      for (const pasta of ["eleitorado_locais_votacao", "eleitorado_local_votacao", "eleitorado"])
        for (const nome of [`eleitorado_local_votacao_${ano}.zip`, `eleitorado_locais_votacao_${ano}.zip`]) {
          const url = `${CDN}/${pasta}/${nome}`;
          if (!achadas.has(url)) achadas.set(url, ano);
        }
    return [...achadas.entries()].map(([url, ano]) => ({ url, ano })).sort((a, b) => b.ano - a.ano);
  })();
  urlsLocais.catch(() => (urlsLocais = null));
  return urlsLocais;
}

/** Locais de votação de uma UF, do cadastro mais recente publicado (eleitorado_local_votacao_<ano>). */
export function locaisVotacaoUF(uf: string): Promise<{ ano: number; porMun: Record<string, LocalVotacao[]> }> {
  const U = uf.toUpperCase();
  if (locaisCache.has(U)) return locaisCache.get(U)!;
  const p = (async () => {
    const tentativas: string[] = [];
    for (const { url, ano } of await urlsLocaisVotacao()) {
      let lista: EntradaZip[];
      try {
        lista = await listarZip(url);
      } catch (e) {
        tentativas.push(`${url} (${e instanceof Error ? e.message.replace(/ em https?:\S+/, "") : "erro"})`);
        continue;
      }
      const csv = lista.filter((x) => /\.csv$/i.test(x.nome));
      const daUF = csv.filter((x) => new RegExp(`_${U}\\.csv$`, "i").test(x.nome));
      const brasil = csv.filter((x) => /_(BRASIL|BR)\.csv$/i.test(x.nome));
      const ents = daUF.length ? daUF : brasil.length ? brasil : csv.length <= 2 ? csv : [];
      if (!ents.length) {
        tentativas.push(`${url} (sem CSV de ${U})`);
        continue;
      }

      const locais = new Map<string, { z: string; l: string; nome: string; end: string; bairro: string; lat: number; lon: number; eleitores: number; mun: string }>();
      const secoes = new Set<string>();
      try {
        for (const ent of ents.slice(0, 1)) {
          let idx: Record<string, number> | null = null;
          for await (const linha of linhasDaEntrada(url, ent)) {
            const c = dividir(linha);
            if (!idx) {
              idx = Object.fromEntries(c.map((n, i) => [n.trim().toUpperCase(), i]));
              if (idx["NR_LATITUDE"] === undefined) throw new DadosAbertosErro(`O cadastro de locais de ${ano} não traz coordenadas.`);
              continue;
            }
            if (c[idx["SG_UF"]] !== U) continue;
            if (idx["NR_TURNO"] !== undefined && c[idx["NR_TURNO"]] && +c[idx["NR_TURNO"]] !== 1) continue;
            const mun = c[idx["CD_MUNICIPIO"]].padStart(5, "0");
            const z = c[idx["NR_ZONA"]].padStart(4, "0");
            const l = c[idx["NR_LOCAL_VOTACAO"]] ?? c[idx["NM_LOCAL_VOTACAO"]];
            const chave = `${mun}|${z}|${l}`;
            const secao = `${mun}|${z}|${c[idx["NR_SECAO"]]}`;
            const qt = +(c[idx["QT_ELEITOR_SECAO"] ?? idx["QT_ELEITOR"] ?? idx["QT_ELEITORES"] ?? -1] ?? 0) || 0;
            let r = locais.get(chave);
            if (!r) {
              r = {
                z,
                l,
                mun,
                nome: c[idx["NM_LOCAL_VOTACAO"]] ?? "",
                end: c[idx["DS_ENDERECO"]] ?? "",
                bairro: c[idx["NM_BAIRRO"]] ?? "",
                lat: coord(c[idx["NR_LATITUDE"]]),
                lon: coord(c[idx["NR_LONGITUDE"]]),
                eleitores: 0,
              };
              locais.set(chave, r);
            }
            if (!secoes.has(secao)) {
              secoes.add(secao);
              r.eleitores += qt;
            }
          }
        }
      } catch (e) {
        tentativas.push(`${url} (${e instanceof Error ? e.message : "erro ao ler"})`);
        continue;
      }
      const porMun: Record<string, LocalVotacao[]> = {};
      for (const r of locais.values()) {
        if (!isFinite(r.lat) || !isFinite(r.lon)) continue;
        (porMun[r.mun] ??= []).push([r.z, r.l, r.nome, r.end, r.bairro, r.lat, r.lon, r.eleitores]);
      }
      if (Object.keys(porMun).length) return { ano, porMun };
      tentativas.push(`${url} (sem coordenadas para ${U})`);
    }
    throw new DadosAbertosErro(`Cadastro de locais de votação indisponível. Tentativas: ${tentativas.slice(0, 4).join("; ") || "nenhum arquivo encontrado"}`);
  })();
  p.catch(() => locaisCache.delete(U));
  locaisCache.set(U, p);
  if (locaisCache.size > 6) locaisCache.delete(locaisCache.keys().next().value as string);
  return p;
}
