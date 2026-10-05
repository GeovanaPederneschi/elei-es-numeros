// Locais de votação de um município (com coordenadas), para desenhar as zonas eleitorais no mapa.

import { ok, falha, params, exigir } from "@/lib/api";
import { locaisCache, municipiosCache } from "@/lib/cache";
import { listarEleicoes, MOCK } from "@/lib/tse";
import { UF_POR_SIGLA } from "@/lib/shared";

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const sp = params(req);
    exigir(sp, "uf", "mun");
    const uf = sp.get("uf")!.toLowerCase();
    const mun = sp.get("mun")!.padStart(5, "0");
    if (MOCK) return ok(locaisFalsos(uf, mun), 60);
    const [{ ano, porMun }, eleicoes] = await Promise.all([locaisCache(uf), listarEleicoes()]);
    // código IBGE do município (para buscar o contorno no IBGE)
    let ibge: string | undefined;
    const atual = eleicoes.find((e) => !e.historico && e.dirs?.cm) ?? eleicoes.find((e) => !e.historico);
    if (atual) {
      const muns = await municipiosCache(atual.id).catch(() => ({}) as Record<string, { cd: string; ibge?: string }[]>);
      ibge = muns[uf]?.find((m) => m.cd === mun)?.ibge;
    }
    return ok({ ano, ibge, locais: porMun[mun] ?? [] }, 60 * 60 * 24 * 7);
  } catch (e) {
    return falha(e);
  }
}

/** Locais sintéticos dentro do quadrado do município simulado (ver lib/mock.ts). */
function locaisFalsos(uf: string, mun: string) {
  const ibgeUF = UF_POR_SIGLA[uf]?.ibge ?? "35";
  const i = +mun - 10000 - +ibgeUF * 100;
  const x0 = -50 + (i % 4) * 1.1;
  const y0 = -15 - Math.floor(i / 4) * 1.1;
  const zonas = i === 0 ? 14 : 2;
  let s = +mun;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const locais = Array.from({ length: zonas * 6 }, (_, k) => {
    const z = String((k % zonas) + 1 + i * 3).padStart(4, "0");
    // zonas agrupadas em faixas, para parecer com uma cidade de verdade
    const col = (k % zonas) % 4;
    const lin = Math.floor((k % zonas) / 4);
    const lon = x0 + 0.05 + (col + r()) * 0.22;
    const lat = y0 - 0.05 - (lin + r()) * 0.22;
    return [z, String(1000 + k), `Escola ${k + 1}`, `Rua ${k + 1}`, "Centro", lat, lon, Math.round(500 + r() * 3000)];
  });
  return { ano: 2026, ibge: `${ibgeUF}${String(i).padStart(5, "0")}`, locais };
}
