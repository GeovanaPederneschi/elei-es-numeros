import { ok, falha, params, exigir } from "@/lib/api";
import { distribuicaoCache } from "@/lib/cache";

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const sp = params(req);
    exigir(sp, "ele", "cargo", "uf");
    const { ttl, dados } = await distribuicaoCache(sp.get("ele")!, +sp.get("cargo")!, sp.get("uf")!.toLowerCase(), sp.get("mun") || undefined, {
      nivel: sp.get("nivel") === "mun" ? "mun" : undefined,
      top: sp.get("top") ? +sp.get("top")! : undefined,
      manter: sp.get("n") ? sp.get("n")!.split(",") : undefined,
    });
    return ok(dados, ttl);
  } catch (e) {
    return falha(e);
  }
}
