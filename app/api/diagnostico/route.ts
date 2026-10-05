// Diagnóstico: testa, a partir do servidor, quais arquivos da API do TSE existem e mostra o início de cada um.
// Abra /api/diagnostico (ou /api/diagnostico?ele=6257) no site publicado.

import { listarEleicoes } from "@/lib/tse";

export const maxDuration = 60;

const BASE = process.env.TSE_BASE_URL || "https://resultados.tse.jus.br/oficial";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

async function testar(caminho: string) {
  try {
    const r = await fetch(`${BASE}/${caminho}`, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    return `HTTP ${r.status} ${t.length} bytes  ${caminho}\n${r.ok ? t.slice(0, 1200) : t.slice(0, 200)}\n`;
  } catch (e) {
    return `ERRO ${(e as Error).message}  ${caminho}\n`;
  }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const pad = (v: string | number, n: number) => String(v).padStart(n, "0");
  const linhas: string[] = [];
  const cfg = await testar("comum/config/ele-c.json");
  linhas.push(cfg.slice(0, 5000));
  const eleicoes = await listarEleicoes().catch(() => []);
  linhas.push("Eleições reconhecidas: " + JSON.stringify(eleicoes.map((e) => [e.id, e.ano, e.turno, e.tipo, e.cargos])) + "\n");
  const alvo = sp.get("ele") ? eleicoes.filter((e) => e.id === sp.get("ele")) : eleicoes.filter((e) => e.ano >= 2024).slice(0, 3);
  for (const e of alvo) {
    const id = pad(e.id, 6);
    const c = pad(e.cargos[0], 4);
    const raiz = `ele${e.ano}/${e.id}`;
    const uf = e.cargos[0] === 1 ? "br" : "sp";
    for (const p of [
      `${raiz}/config/mun-e${id}-cm.json`,
      `${raiz}/dados-simplificados/${uf}/${uf}-c${c}-e${id}-r.json`,
      `${raiz}/dados/${uf}/${uf}-c${c}-e${id}-v.json`,
      `${raiz}/dados/${uf}/${uf}-c${c}-e${id}-f.json`,
      `${raiz}/dados/sp/sp-c${c}-e${id}-v.json`,
      `${raiz}/dados/sp/sp71072-c${c}-e${id}-v.json`,
      `${raiz}/dados-simplificados/sp/sp71072-c${c}-e${id}-r.json`,
      `ele${e.ano}/divulgacao/oficial/${e.id}/dados-simplificados/${uf}/${uf}-c${c}-e${id}-r.json`,
    ])
      linhas.push(await testar(p));
  }
  return new Response(linhas.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
