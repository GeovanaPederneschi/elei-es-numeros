#!/usr/bin/env node
// Gera a base histórica completa (todos os cargos) a partir do Portal de Dados Abertos do TSE.
//
//   npm run historico                 # anos padrão (1998–2024)
//   npm run historico -- 2018 2022    # apenas alguns anos
//   npm run historico -- --vereador   # inclui vereadores (arquivos bem maiores)
//
// Requer o comando `unzip` instalado. Os arquivos do TSE têm centenas de MB por ano,
// por isso o processamento é feito localmente; o resultado (alguns MB) vai para
// public/historico/ e é publicado junto com o site. A trajetória dos candidatos
// passa a enxergar automaticamente esses anos.

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE = path.join(RAIZ, ".historico-cache");
const SAIDA = path.join(RAIZ, "public", "historico");
const URL_BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona";

const args = process.argv.slice(2);
const comVereador = args.includes("--vereador");
const soIndice = args.includes("--so-indice");
const limpar = process.env.HISTORICO_LIMPAR === "1";
const anosArg = args.filter((a) => /^\d{4}$/.test(a)).map(Number);
const ANOS = anosArg.length ? anosArg : [1998, 2000, 2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024];

mkdirSync(CACHE, { recursive: true });
mkdirSync(SAIDA, { recursive: true });

async function baixar(ano) {
  const destino = path.join(CACHE, `votacao_candidato_munzona_${ano}.zip`);
  if (existsSync(destino)) return destino;
  const url = `${URL_BASE}/votacao_candidato_munzona_${ano}.zip`;
  console.log(`↓ ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destino + ".parcial"));
  execFileSync("mv", [destino + ".parcial", destino]);
  return destino;
}

function entradasCSV(zip) {
  const lista = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split("\n").filter((l) => /\.csv$/i.test(l));
  const brasil = lista.filter((l) => /_BRASIL\.csv$/i.test(l));
  return brasil.length ? brasil : lista.filter((l) => /_[A-Z]{2}\.csv$/i.test(l) && !/_BR\.csv$/i.test(l)).concat(lista.filter((l) => /_BR\.csv$/i.test(l)));
}

function linhaCSV(l) {
  const out = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') {
      if (aspas && l[i + 1] === '"') {
        atual += '"';
        i++;
      } else aspas = !aspas;
    } else if (ch === ";" && !aspas) {
      out.push(atual);
      atual = "";
    } else atual += ch;
  }
  out.push(atual);
  return out;
}

const latin1 = () =>
  new Transform({
    transform(chunk, _enc, cb) {
      cb(null, new TextDecoder("latin1").decode(chunk));
    },
  });

async function processarAno(ano) {
  const zip = await baixar(ano);
  const agregado = new Map(); // chave -> registro
  const totaisEscopo = new Map(); // escopo -> votos nominais
  const cargosAceitos = new Set([1, 3, 5, 6, 7, 8, 11, ...(comVereador ? [13] : [])]);

  for (const entrada of entradasCSV(zip)) {
    console.log(`  · ${ano}: ${entrada}`);
    const proc = spawn("unzip", ["-p", zip, entrada]);
    const rl = createInterface({ input: proc.stdout.pipe(latin1()), crlfDelay: Infinity });
    let cab = null;
    for await (const linha of rl) {
      if (!linha.trim()) continue;
      const c = linhaCSV(linha);
      if (!cab) {
        cab = Object.fromEntries(c.map((n, i) => [n.trim().toUpperCase(), i]));
        continue;
      }
      const g = (n) => (cab[n] !== undefined ? c[cab[n]] : undefined);
      const cargo = +g("CD_CARGO");
      if (!cargosAceitos.has(cargo)) continue;
      const turno = +g("NR_TURNO");
      const uf = (g("SG_UF") || "").toUpperCase();
      const votos = +(g("QT_VOTOS_NOMINAIS_VALIDOS") ?? g("QT_VOTOS_NOMINAIS") ?? 0) || 0;
      const n = g("NR_CANDIDATO");
      const escopoUF = cargo === 1 ? "BR" : uf;
      const mun = cargo >= 11 ? g("CD_MUNICIPIO") : "";
      const escopo = `${turno}|${cargo}|${escopoUF}|${mun}`;
      const chave = `${escopo}|${n}`;
      totaisEscopo.set(escopo, (totaisEscopo.get(escopo) ?? 0) + votos);
      const r = agregado.get(chave);
      if (r) r.votos += votos;
      else
        agregado.set(chave, {
          turno,
          cargo,
          uf: escopoUF,
          mun,
          munNome: cargo >= 11 ? g("NM_MUNICIPIO") : "",
          n,
          nome: g("NM_URNA_CANDIDATO") || g("NM_CANDIDATO"),
          partido: g("SG_PARTIDO"),
          votos,
          situacao: g("DS_SIT_TOT_TURNO") || "",
        });
    }
    await new Promise((ok) => proc.on("close", ok));
  }

  const linhas = [];
  for (const r of agregado.values()) {
    const total = totaisEscopo.get(`${r.turno}|${r.cargo}|${r.uf}|${r.mun}`) || 1;
    const pct = Math.round((10000 * r.votos) / total) / 100;
    if (r.votos === 0 && !/ELEITO/i.test(r.situacao)) continue;
    linhas.push([ano, r.turno, r.cargo, r.uf, r.mun, r.munNome, r.n, r.nome, r.partido, r.votos, pct, r.situacao]);
  }
  writeFileSync(path.join(SAIDA, `candidatos-${ano}.json`), JSON.stringify(linhas));
  if (limpar) execFileSync("rm", ["-f", zip]);
  console.log(`✓ ${ano}: ${linhas.length} candidaturas`);
}

for (const ano of soIndice ? [] : ANOS) {
  try {
    await processarAno(ano);
  } catch (e) {
    console.error(`✗ ${ano}: ${e.message}`);
  }
}

const anosGerados = (soIndice ? Array.from({ length: 40 }, (_, i) => 1994 + i * 2) : ANOS).filter((a) => existsSync(path.join(SAIDA, `candidatos-${a}.json`)));
let anteriores = [];
try {
  anteriores = JSON.parse(readFileSync(path.join(SAIDA, "index.json"), "utf8")).anos ?? [];
} catch {}
const todos = [...new Set([...anteriores, ...anosGerados])].sort();
writeFileSync(path.join(SAIDA, "index.json"), JSON.stringify({ anos: todos, gerado: new Date().toISOString() }));
console.log(`Índice atualizado: ${todos.join(", ")}`);
