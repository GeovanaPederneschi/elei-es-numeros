// Trajetória de um candidato: procura o nome de urna em todas as eleições disponíveis.
// - Presidência 1989–2018: base histórica embutida (data/presidente-historico.ts)
// - 2020 em diante: API de resultados do TSE (presidente; cargos estaduais na UF informada;
//   prefeito/vereador no município informado)
// - Opcional: arquivos gerados por `npm run historico` em public/historico (todos os cargos desde 1998)

import { ok, falha, params, exigir } from "@/lib/api";
import { APELIDOS, PRESIDENTE_HISTORICO } from "@/data/presidente-historico";
import { CARGOS, Trajetoria, UFS, normalizar } from "@/lib/shared";
import { listarEleicoes, mapLimit, resultado } from "@/lib/tse";

export const maxDuration = 60;

function nomesEquivalentes(nome: string): { nomes: Set<string>; pessoa?: string } {
  const n = normalizar(nome);
  const nomes = new Set([n]);
  let pessoa: string | undefined;
  for (const [p, lista] of Object.entries(APELIDOS)) {
    if (lista.some((x) => normalizar(x) === n)) {
      pessoa = p;
      lista.forEach((x) => nomes.add(normalizar(x)));
    }
  }
  return { nomes, pessoa };
}

// Cache em memória (por instância) dos arquivos da base histórica, que passam de 2 MB
const memoHist = new Map<string, Promise<any>>();
function buscarHist(url: string) {
  if (!memoHist.has(url)) {
    const p = fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
    p.then((v) => v === null && memoHist.delete(url)).catch(() => memoHist.delete(url));
    memoHist.set(url, p);
  }
  return memoHist.get(url)!;
}

async function historicoGerado(origem: string, nomes: Set<string>, uf?: string): Promise<Trajetoria[]> {
  try {
    const indice: { anos: number[] } | null = await buscarHist(`${origem}/historico/index.json`);
    if (!indice) return [];
    const out: Trajetoria[] = [];
    await Promise.all(
      indice.anos.map(async (ano) => {
        const linhas: any[][] | null = await buscarHist(`${origem}/historico/candidatos-${ano}.json`).catch(() => null);
        if (!linhas) return;
        for (const [a, turno, cargo, sg, mun, munNome, n, nome, partido, votos, pct, sit] of linhas) {
          if (!nomes.has(normalizar(nome))) continue;
          if (uf && sg !== "BR" && sg.toLowerCase() !== uf) continue;
          out.push({
            ano: a,
            turno,
            cargo,
            uf: sg.toLowerCase(),
            mun: mun || undefined,
            munNome: munNome || undefined,
            n: String(n),
            nome,
            partido,
            votos,
            pct,
            situacao: sit,
            eleito: /^ELEITO/i.test(sit),
            fonte: "historico",
          });
        }
      })
    );
    return out;
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  try {
    const sp = params(req);
    exigir(sp, "nome");
    const nome = sp.get("nome")!;
    const uf = sp.get("uf")?.toLowerCase() || undefined;
    const mun = sp.get("mun") || undefined;
    const { nomes, pessoa } = nomesEquivalentes(nome);
    const itens: Trajetoria[] = [];

    // 1) Presidência (base histórica)
    for (const e of PRESIDENTE_HISTORICO) {
      for (const c of e.candidatos) {
        const casa = pessoa ? c.pessoa === pessoa : nomes.has(normalizar(c.nome));
        if (!casa) continue;
        itens.push({
          ano: e.ano,
          turno: e.turno,
          cargo: 1,
          uf: "br",
          n: "",
          nome: c.nome,
          partido: c.partido,
          votos: c.votos,
          pct: c.pct,
          situacao: c.eleito ? "Eleito" : c.segundoTurno ? "2º turno" : "Não eleito",
          eleito: !!c.eleito,
          fonte: "historico",
        });
      }
    }

    // 2) API do TSE
    const eleicoes = await listarEleicoes();
    const consultas: { ele: string; ano: number; turno: number; cargo: number; uf: string; mun?: string }[] = [];
    for (const e of eleicoes) {
      for (const cargo of e.cargos) {
        const abr = CARGOS[cargo]?.abrangencia;
        if (abr === "br") consultas.push({ ele: e.id, ano: e.ano, turno: e.turno, cargo, uf: "br" });
        else if (abr === "uf") {
          if (cargo === 8 && uf !== "df") continue;
          if (cargo === 7 && uf === "df") continue;
          if (uf) consultas.push({ ele: e.id, ano: e.ano, turno: e.turno, cargo, uf });
          else if (cargo === 3 || cargo === 5)
            for (const u of UFS) consultas.push({ ele: e.id, ano: e.ano, turno: e.turno, cargo, uf: u.sigla.toLowerCase() });
        } else if (abr === "mun" && uf && mun) consultas.push({ ele: e.id, ano: e.ano, turno: e.turno, cargo, uf, mun });
      }
    }
    const achados = await mapLimit(consultas, 16, async (q) => {
      try {
        const r = await resultado(q.ele, q.cargo, q.uf, q.mun);
        return r.candidatos
          .filter((c) => nomes.has(normalizar(c.nome)))
          .map(
            (c): Trajetoria => ({
              ano: q.ano,
              turno: q.turno,
              eleicao: q.ele,
              cargo: q.cargo,
              uf: q.uf,
              mun: q.mun,
              n: c.n,
              nome: c.nome,
              partido: c.partido,
              votos: c.votos,
              pct: c.pct,
              situacao: c.situacao,
              eleito: c.eleito,
              fonte: "tse-api",
            })
          );
      } catch {
        return [];
      }
    });
    const daApi = achados.flat();

    // 3) Base histórica opcional (gerada por script)
    const origem = new URL(req.url).origin;
    const gerado = await historicoGerado(origem, nomes, uf);

    // Remove duplicatas, preferindo dados da API
    const chave = (t: Trajetoria) => `${t.ano}-${t.turno}-${t.cargo}-${t.uf}-${t.mun ?? ""}`;
    const mapa = new Map<string, Trajetoria>();
    for (const t of [...gerado, ...itens, ...daApi]) mapa.set(chave(t), t);
    const lista = [...mapa.values()].sort((a, b) => a.ano - b.ano || a.turno - b.turno || a.cargo - b.cargo);
    return ok({ nome, pessoa, itens: lista }, 3600);
  } catch (e) {
    return falha(e);
  }
}
