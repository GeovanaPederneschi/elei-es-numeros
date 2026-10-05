import { ok, falha, params, exigir } from "@/lib/api";
import { obterEleicao, resultado, ttlPara } from "@/lib/tse";

export async function GET(req: Request) {
  try {
    const sp = params(req);
    exigir(sp, "ele", "cargo", "uf");
    const ele = sp.get("ele")!;
    const r = await resultado(ele, +sp.get("cargo")!, sp.get("uf")!, sp.get("mun") || undefined);
    return ok(r, ttlPara(await obterEleicao(ele)));
  } catch (e) {
    return falha(e);
  }
}
