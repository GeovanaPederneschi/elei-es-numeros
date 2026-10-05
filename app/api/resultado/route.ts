import { ok, falha, params, exigir } from "@/lib/api";
import { resultadoCache } from "@/lib/cache";

export async function GET(req: Request) {
  try {
    const sp = params(req);
    exigir(sp, "ele", "cargo", "uf");
    const { ttl, dados } = await resultadoCache(sp.get("ele")!, +sp.get("cargo")!, sp.get("uf")!.toLowerCase(), sp.get("mun") || undefined);
    return ok(dados, ttl);
  } catch (e) {
    return falha(e);
  }
}
