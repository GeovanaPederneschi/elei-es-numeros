import { ok, falha } from "@/lib/api";
import { eleicoesCache } from "@/lib/cache";

export async function GET() {
  try {
    return ok(await eleicoesCache(), 600);
  } catch (e) {
    return falha(e);
  }
}
