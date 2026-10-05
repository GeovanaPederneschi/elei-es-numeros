// Tipos, constantes e utilitários compartilhados entre servidor e navegador.

export type TipoEleicao = "federal" | "estadual" | "geral" | "municipal";

export interface Eleicao {
  id: string; // código da eleição no TSE (ex.: "544")
  ano: number;
  turno: number;
  tipo: TipoEleicao;
  nome: string;
  data?: string;
  cargos: number[];
  /** true quando a eleição ainda pode estar em apuração / é recente */
  recente?: boolean;
}

export interface Totais {
  eleitorado: number;
  comparecimento: number;
  abstencao: number;
  validos: number;
  brancos: number;
  nulos: number;
  secoesPct?: number;
  atualizacao?: string;
}

export interface Candidato {
  n: string; // número na urna
  sq?: string; // sequencial do candidato no TSE
  nome: string; // nome de urna
  partido: string;
  coligacao?: string;
  vice?: string;
  votos: number;
  pct: number; // % dos votos válidos
  eleito: boolean;
  situacao: string;
}

export interface Resultado {
  eleicao: string;
  cargo: number;
  uf: string; // "br", "sp", "zz" (exterior)
  mun?: string;
  totais: Totais;
  candidatos: Candidato[];
}

/** Uma subdivisão (estado, município, zona, cidade no exterior) com os votos. */
export interface Area {
  cd: string; // código TSE (UF em minúsculas, município TSE, zona)
  nome: string;
  ibge?: string;
  uf?: string;
  totais: Partial<Totais>;
  /** votos por número de candidato */
  votos: Record<string, number>;
  /** candidatos locais (eleições municipais, onde cada município tem os seus) */
  cands?: Candidato[];
}

export type Nivel = "uf" | "mun" | "zona" | "exterior";

export interface Distribuicao {
  eleicao: string;
  cargo: number;
  uf: string;
  mun?: string;
  nivel: Nivel;
  areas: Area[];
  candidatos: Candidato[]; // candidatos (com nomes/partidos) do nível pai
  aviso?: string;
}

export interface MunicipioInfo {
  cd: string; // código TSE
  nome: string;
  ibge?: string;
  capital?: boolean;
  zonas: string[];
}

export interface Trajetoria {
  ano: number;
  turno: number;
  eleicao?: string;
  cargo: number;
  uf: string;
  mun?: string;
  munNome?: string;
  n: string;
  nome: string;
  partido: string;
  votos: number;
  pct: number;
  situacao: string;
  eleito: boolean;
  fonte: "tse-api" | "historico";
}

export const CARGOS: Record<number, { nome: string; plural: string; abrangencia: "br" | "uf" | "mun" }> = {
  1: { nome: "Presidente", plural: "Presidência", abrangencia: "br" },
  3: { nome: "Governador", plural: "Governo do estado", abrangencia: "uf" },
  5: { nome: "Senador", plural: "Senado", abrangencia: "uf" },
  6: { nome: "Deputado federal", plural: "Câmara dos Deputados", abrangencia: "uf" },
  7: { nome: "Deputado estadual", plural: "Assembleia Legislativa", abrangencia: "uf" },
  8: { nome: "Deputado distrital", plural: "Câmara Legislativa (DF)", abrangencia: "uf" },
  11: { nome: "Prefeito", plural: "Prefeitura", abrangencia: "mun" },
  13: { nome: "Vereador", plural: "Câmara Municipal", abrangencia: "mun" },
};

export interface UFInfo {
  sigla: string;
  nome: string;
  ibge: string;
  regiao: "Norte" | "Nordeste" | "Centro-Oeste" | "Sudeste" | "Sul";
}

export const UFS: UFInfo[] = [
  { sigla: "AC", nome: "Acre", ibge: "12", regiao: "Norte" },
  { sigla: "AL", nome: "Alagoas", ibge: "27", regiao: "Nordeste" },
  { sigla: "AP", nome: "Amapá", ibge: "16", regiao: "Norte" },
  { sigla: "AM", nome: "Amazonas", ibge: "13", regiao: "Norte" },
  { sigla: "BA", nome: "Bahia", ibge: "29", regiao: "Nordeste" },
  { sigla: "CE", nome: "Ceará", ibge: "23", regiao: "Nordeste" },
  { sigla: "DF", nome: "Distrito Federal", ibge: "53", regiao: "Centro-Oeste" },
  { sigla: "ES", nome: "Espírito Santo", ibge: "32", regiao: "Sudeste" },
  { sigla: "GO", nome: "Goiás", ibge: "52", regiao: "Centro-Oeste" },
  { sigla: "MA", nome: "Maranhão", ibge: "21", regiao: "Nordeste" },
  { sigla: "MT", nome: "Mato Grosso", ibge: "51", regiao: "Centro-Oeste" },
  { sigla: "MS", nome: "Mato Grosso do Sul", ibge: "50", regiao: "Centro-Oeste" },
  { sigla: "MG", nome: "Minas Gerais", ibge: "31", regiao: "Sudeste" },
  { sigla: "PA", nome: "Pará", ibge: "15", regiao: "Norte" },
  { sigla: "PB", nome: "Paraíba", ibge: "25", regiao: "Nordeste" },
  { sigla: "PR", nome: "Paraná", ibge: "41", regiao: "Sul" },
  { sigla: "PE", nome: "Pernambuco", ibge: "26", regiao: "Nordeste" },
  { sigla: "PI", nome: "Piauí", ibge: "22", regiao: "Nordeste" },
  { sigla: "RJ", nome: "Rio de Janeiro", ibge: "33", regiao: "Sudeste" },
  { sigla: "RN", nome: "Rio Grande do Norte", ibge: "24", regiao: "Nordeste" },
  { sigla: "RS", nome: "Rio Grande do Sul", ibge: "43", regiao: "Sul" },
  { sigla: "RO", nome: "Rondônia", ibge: "11", regiao: "Norte" },
  { sigla: "RR", nome: "Roraima", ibge: "14", regiao: "Norte" },
  { sigla: "SC", nome: "Santa Catarina", ibge: "42", regiao: "Sul" },
  { sigla: "SP", nome: "São Paulo", ibge: "35", regiao: "Sudeste" },
  { sigla: "SE", nome: "Sergipe", ibge: "28", regiao: "Nordeste" },
  { sigla: "TO", nome: "Tocantins", ibge: "17", regiao: "Norte" },
];

export const UF_POR_SIGLA: Record<string, UFInfo> = Object.fromEntries(UFS.map((u) => [u.sigla.toLowerCase(), u]));
export const UF_POR_IBGE: Record<string, UFInfo> = Object.fromEntries(UFS.map((u) => [u.ibge, u]));

export function nomeUF(uf: string): string {
  const k = uf.toLowerCase();
  if (k === "br") return "Brasil";
  if (k === "zz") return "Exterior";
  return UF_POR_SIGLA[k]?.nome ?? uf.toUpperCase();
}

// Número do partido -> sigla (usado quando o TSE não informa a sigla explicitamente).
// Alguns números mudaram de dono ao longo do tempo; por isso a função considera o ano.
export function partidoPorNumero(numero: string, ano = 2026): string | undefined {
  const p = numero.slice(0, 2);
  const mapa: Record<string, string> = {
    "10": "REPUBLICANOS",
    "11": "PP",
    "12": "PDT",
    "13": "PT",
    "14": "PTB",
    "15": "MDB",
    "16": "PSTU",
    "17": "PSL",
    "18": "REDE",
    "19": "PODE",
    "20": "PSC",
    "21": "PCB",
    "22": "PL",
    "23": "CIDADANIA",
    "25": "DEM",
    "27": "DC",
    "28": "PRTB",
    "29": "PCO",
    "30": "NOVO",
    "33": "MOBILIZA",
    "35": "PMB",
    "36": "AGIR",
    "40": "PSB",
    "43": "PV",
    "44": "UNIÃO",
    "45": "PSDB",
    "50": "PSOL",
    "51": "PATRIOTA",
    "55": "PSD",
    "65": "PCdoB",
    "70": "AVANTE",
    "77": "SOLIDARIEDADE",
    "80": "UP",
    "90": "PROS",
  };
  if (p === "25" && ano >= 2024) return "PRD";
  if (p === "19" && ano < 2017) return "PTN";
  if (p === "20" && ano >= 2024) return "PODE";
  if (p === "10" && ano < 2019) return "PRB";
  if (p === "15" && ano < 2018) return "PMDB";
  if (p === "22" && ano < 2019) return "PR";
  if (p === "11" && ano < 2018) return "PP";
  if (p === "33" && ano < 2024) return "PMN";
  if (p === "36" && ano < 2022) return "PTC";
  if (p === "70" && ano < 2018) return "PTdoB";
  if (p === "27" && ano < 2018) return "PSDC";
  if (p === "51" && ano < 2018) return "PEN";
  if (p === "23" && ano < 2019) return "PPS";
  return mapa[p];
}

// Cores por partido (aproximações das identidades visuais usadas na imprensa).
const CORES_PARTIDO: Record<string, string> = {
  PT: "#d7261e",
  PL: "#1f3f8c",
  PSL: "#2a6a3a",
  PSDB: "#2f6fbf",
  MDB: "#2e8b57",
  PMDB: "#2e8b57",
  PSOL: "#f2b705",
  PDT: "#c2452d",
  PSB: "#f07b1d",
  "UNIÃO": "#0f5b8f",
  UNIAO: "#0f5b8f",
  DEM: "#2a7ab8",
  PFL: "#2a7ab8",
  PP: "#4a77c4",
  PPB: "#4a77c4",
  PDS: "#4a77c4",
  PPR: "#4a77c4",
  PSD: "#e5a31a",
  REPUBLICANOS: "#2b9fd6",
  PRB: "#2b9fd6",
  NOVO: "#f26522",
  PODE: "#25a65b",
  PTN: "#25a65b",
  SOLIDARIEDADE: "#ef7d00",
  PCdoB: "#9e0b0f",
  PCDOB: "#9e0b0f",
  PV: "#3aa335",
  REDE: "#29a3a3",
  CIDADANIA: "#e0447a",
  PPS: "#e0447a",
  AVANTE: "#00a0b0",
  PRD: "#5560b8",
  PTB: "#3c3c3c",
  PATRIOTA: "#0b6e4f",
  PSC: "#2d8f6f",
  PROS: "#ef8a17",
  PRTB: "#1a7a3c",
  DC: "#3f6fb5",
  PSDC: "#3f6fb5",
  PSTU: "#b5121b",
  PCB: "#8f1d21",
  PCO: "#7d1416",
  UP: "#a3161b",
  AGIR: "#00739a",
  PTC: "#00739a",
  MOBILIZA: "#8c6d1f",
  PMN: "#8c6d1f",
  PMB: "#b0408f",
  PR: "#1f3f8c",
  PRN: "#2457a6",
  PRONA: "#2a6f3a",
  PPL: "#5b8c2a",
};

const PALETA_EXTRA = ["#6c5ce7", "#00897b", "#c0392b", "#8e44ad", "#16a085", "#d35400", "#2c3e50", "#7f8c8d"];

export function corPartido(sigla?: string): string {
  if (!sigla) return "#8a8f98";
  const s = sigla.toUpperCase().replace(/\s+/g, "");
  if (CORES_PARTIDO[sigla]) return CORES_PARTIDO[sigla];
  if (CORES_PARTIDO[s]) return CORES_PARTIDO[s];
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA_EXTRA[h % PALETA_EXTRA.length];
}

export function normalizar(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const fmtInt = new Intl.NumberFormat("pt-BR");
export function fmtNum(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "–";
  return fmtInt.format(Math.round(n));
}

export function fmtPct(n: number | undefined, casas = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "–";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";
}

export function fmtPP(n: number | undefined, casas = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "–";
  const s = Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return (n > 0 ? "+" : n < 0 ? "−" : "") + s + " p.p.";
}

export function fmtCompacto(n: number): string {
  if (n >= 1e6) return (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
  if (n >= 1e3) return (n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
  return fmtNum(n);
}

export function titulo(s: string): string {
  const minusc = new Set(["da", "de", "do", "das", "dos", "e", "d"]);
  return (s || "")
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && minusc.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function rotuloEleicao(e: Pick<Eleicao, "ano" | "turno" | "tipo">): string {
  const t = e.tipo === "municipal" ? "Municipais" : "Gerais";
  return `${e.ano} · ${t} · ${e.turno}º turno`;
}
