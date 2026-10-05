// Escalas de cor dos mapas.
// - Vencedor: a cor do partido de quem lidera, mais intensa quanto maior a vantagem.
// - Candidato: escala sequencial de um só tom (cor do partido), do claro ao escuro.
// - Comparação: divergente azul (ganho) / vermelho (perda) com cinza neutro no meio.

export const NEUTRO = "#e4e2dc";
export const SEM_DADOS = "#d9d7d0";

function hexParaRgb(h: string) {
  const s = h.replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map((c) => c + c).join("") : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function misturar(a: string, b: string, t: number): string {
  const x = hexParaRgb(a);
  const y = hexParaRgb(b);
  const k = Math.max(0, Math.min(1, t));
  const c = x.map((v, i) => Math.round(v * (1 - k) + y[i] * k));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Faixas de intensidade para o vencedor (% dos válidos). */
export const FAIXAS_LIDER = [
  { ate: 40, t: 0.4, rotulo: "até 40%" },
  { ate: 50, t: 0.55, rotulo: "40–50%" },
  { ate: 60, t: 0.7, rotulo: "50–60%" },
  { ate: 70, t: 0.85, rotulo: "60–70%" },
  { ate: 101, t: 1, rotulo: "70% ou mais" },
];

export function corLider(corBase: string, pct: number): string {
  const f = FAIXAS_LIDER.find((x) => pct < x.ate) ?? FAIXAS_LIDER[FAIXAS_LIDER.length - 1];
  return misturar(NEUTRO, corBase, f.t);
}

/** Escala sequencial em 6 degraus de 0 a `max`. */
export function degrausSequenciais(max: number): number[] {
  const passo = max <= 10 ? 2 : max <= 30 ? 5 : max <= 60 ? 10 : 15;
  const out: number[] = [];
  for (let v = passo; v < max + passo && out.length < 6; v += passo) out.push(v);
  return out;
}

export function corSequencial(corBase: string, pct: number, degraus: number[]): string {
  const i = degraus.findIndex((d) => pct < d);
  const idx = i === -1 ? degraus.length - 1 : i;
  const t = 0.12 + (0.88 * idx) / Math.max(1, degraus.length - 1);
  return misturar("#f4f3ef", corBase, t);
}

export const DIV_POS = "#2a78d6";
export const DIV_NEG = "#d0453a";
export const DIV_MEIO = "#f0efec";
export const DEGRAUS_DIV = [2, 5, 10, 20];

export function corDivergente(pp: number): string {
  const a = Math.abs(pp);
  if (a < 0.5) return DIV_MEIO;
  const i = DEGRAUS_DIV.findIndex((d) => a < d);
  const idx = i === -1 ? DEGRAUS_DIV.length : i;
  const t = 0.25 + (0.75 * idx) / DEGRAUS_DIV.length;
  return misturar(DIV_MEIO, pp > 0 ? DIV_POS : DIV_NEG, t);
}
