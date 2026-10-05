import { ok, falha } from "@/lib/api";
import { listarEleicoes } from "@/lib/tse";

export async function GET() {
  try {
    return ok(await listarEleicoes(), 600);
  } catch (e) {
    return falha(e);
  }
}
