// Pré-carrega no cache os recortes mais acessados da eleição mais recente
// (chamado pelo cron da Vercel e pode ser aberto manualmente).

import { ok, falha } from "@/lib/api";
import { distribuicaoCache, eleicoesCache, municipiosCache, resultadoCache } from "@/lib/cache";
import { mapLimit } from "@/lib/tse";
import { CARGOS, UFS } from "@/lib/shared";

export const maxDuration = 60;

export async function GET() {
  const inicio = Date.now();
  const feito: string[] = [];
  const tempoOk = () => Date.now() - inicio < 50_000;
  try {
    const eleicoes = await eleicoesCache();
    const anoMax = Math.max(...eleicoes.map((e) => e.ano));
    const recentes = eleicoes.filter((e) => e.ano === anoMax);
    for (const e of recentes) {
      if (!tempoOk()) break;
      await municipiosCache(e.id).catch(() => null);
      for (const cargo of e.cargos) {
        if (!tempoOk()) break;
        const abr = CARGOS[cargo]?.abrangencia;
        if (abr === "mun") continue;
        if (abr === "br") await resultadoCache(e.id, cargo, "br").catch(() => null);
        await distribuicaoCache(e.id, cargo, "br", undefined, {}).then(() => feito.push(`${e.id}/${cargo}/br`)).catch(() => null);
        if (abr === "br")
          await mapLimit(UFS, 6, async (u) => {
            if (!tempoOk()) return;
            const uf = u.sigla.toLowerCase();
            await distribuicaoCache(e.id, cargo, uf, undefined, {}).then(() => feito.push(`${e.id}/${cargo}/${uf}`)).catch(() => null);
          });
      }
    }
    return ok({ aquecidos: feito.length, itens: feito, segundos: (Date.now() - inicio) / 1000 }, 0);
  } catch (e) {
    return falha(e);
  }
}
