// Resultados nacionais das eleições presidenciais desde a redemocratização (fonte: TSE).
// Percentuais sobre os votos válidos. Eleições a partir de 2022 também são lidas ao vivo da API do TSE.

export interface CandHist {
  pessoa: string; // identificador estável da pessoa (para trajetórias)
  nome: string; // nome de urna / como ficou conhecido
  partido: string;
  votos: number;
  pct: number;
  eleito?: boolean;
  segundoTurno?: boolean;
}

export interface EleicaoHist {
  ano: number;
  turno: 1 | 2;
  candidatos: CandHist[];
}

/** Nomes alternativos (como aparecem na urna) para casar com os dados da API. */
export const APELIDOS: Record<string, string[]> = {
  lula: ["LULA", "LUIZ INACIO LULA DA SILVA", "LUIS INACIO LULA DA SILVA"],
  bolsonaro: ["BOLSONARO", "JAIR BOLSONARO", "JAIR MESSIAS BOLSONARO"],
  collor: ["COLLOR", "FERNANDO COLLOR", "FERNANDO COLLOR DE MELLO"],
  fhc: ["FERNANDO HENRIQUE", "FHC", "FERNANDO HENRIQUE CARDOSO"],
  brizola: ["BRIZOLA", "LEONEL BRIZOLA"],
  covas: ["MARIO COVAS", "COVAS"],
  maluf: ["MALUF", "PAULO MALUF"],
  ulysses: ["ULYSSES GUIMARAES", "ULYSSES"],
  afif: ["AFIF", "GUILHERME AFIF", "AFIF DOMINGOS"],
  freire: ["ROBERTO FREIRE"],
  eneas: ["ENEAS", "ENEAS CARNEIRO"],
  quercia: ["QUERCIA", "ORESTES QUERCIA"],
  amin: ["ESPERIDIAO AMIN", "AMIN"],
  ciro: ["CIRO GOMES", "CIRO"],
  serra: ["JOSE SERRA", "SERRA"],
  garotinho: ["GAROTINHO", "ANTHONY GAROTINHO"],
  zemaria: ["ZE MARIA", "JOSE MARIA DE ALMEIDA"],
  alckmin: ["GERALDO ALCKMIN", "ALCKMIN"],
  heloisa: ["HELOISA HELENA"],
  cristovam: ["CRISTOVAM BUARQUE", "CRISTOVAM"],
  eymael: ["EYMAEL", "JOSE MARIA EYMAEL"],
  dilma: ["DILMA", "DILMA ROUSSEFF"],
  marina: ["MARINA SILVA", "MARINA"],
  plinio: ["PLINIO", "PLINIO DE ARRUDA SAMPAIO"],
  aecio: ["AECIO NEVES", "AECIO"],
  luciana: ["LUCIANA GENRO"],
  everaldo: ["PASTOR EVERALDO"],
  eduardojorge: ["EDUARDO JORGE"],
  levy: ["LEVY FIDELIX"],
  haddad: ["FERNANDO HADDAD", "HADDAD"],
  amoedo: ["JOAO AMOEDO", "AMOEDO"],
  daciolo: ["CABO DACIOLO"],
  meirelles: ["HENRIQUE MEIRELLES", "MEIRELLES"],
  alvarodias: ["ALVARO DIAS"],
  boulos: ["GUILHERME BOULOS", "BOULOS"],
  veralucia: ["VERA LUCIA", "VERA"],
  tebet: ["SIMONE TEBET", "SIMONE"],
  soraya: ["SORAYA THRONICKE", "SORAYA"],
  davila: ["FELIPE D AVILA", "FELIPE DAVILA", "FELIPE D'AVILA"],
  kelmon: ["PADRE KELMON"],
  leopericles: ["LEO PERICLES"],
  manzano: ["SOFIA MANZANO"],
  ruicosta: ["RUI COSTA PIMENTA"],
};

const c = (pessoa: string, nome: string, partido: string, votos: number, pct: number, extra: Partial<CandHist> = {}): CandHist => ({
  pessoa,
  nome,
  partido,
  votos,
  pct,
  ...extra,
});

export const PRESIDENTE_HISTORICO: EleicaoHist[] = [
  {
    ano: 1989,
    turno: 1,
    candidatos: [
      c("collor", "Fernando Collor", "PRN", 20611011, 30.47, { segundoTurno: true }),
      c("lula", "Lula", "PT", 11622673, 17.18, { segundoTurno: true }),
      c("brizola", "Leonel Brizola", "PDT", 11168228, 16.51),
      c("covas", "Mário Covas", "PSDB", 7790392, 11.52),
      c("maluf", "Paulo Maluf", "PDS", 5986575, 8.85),
      c("afif", "Afif Domingos", "PL", 3272462, 4.83),
      c("ulysses", "Ulysses Guimarães", "PMDB", 3204932, 4.73),
      c("freire", "Roberto Freire", "PCB", 769123, 1.14),
      c("aureliano", "Aureliano Chaves", "PFL", 600838, 0.88),
      c("caiado", "Ronaldo Caiado", "PSD", 488846, 0.72),
      c("camargo", "Affonso Camargo", "PTB", 379286, 0.56),
      c("eneas", "Enéas", "PRONA", 360561, 0.53),
      c("gabeira", "Fernando Gabeira", "PV", 125842, 0.19),
    ],
  },
  {
    ano: 1989,
    turno: 2,
    candidatos: [
      c("collor", "Fernando Collor", "PRN", 35089998, 53.03, { eleito: true }),
      c("lula", "Lula", "PT", 31076364, 46.97),
    ],
  },
  {
    ano: 1994,
    turno: 1,
    candidatos: [
      c("fhc", "Fernando Henrique", "PSDB", 34314961, 54.27, { eleito: true }),
      c("lula", "Lula", "PT", 17122127, 27.04),
      c("eneas", "Enéas", "PRONA", 4671457, 7.38),
      c("quercia", "Orestes Quércia", "PMDB", 2772121, 4.38),
      c("brizola", "Leonel Brizola", "PDT", 2015836, 3.18),
      c("amin", "Esperidião Amin", "PPR", 1739894, 2.75),
      c("carlosgomes", "Carlos Gomes", "PRN", 387738, 0.61),
      c("hernani", "Hernani Fortuna", "PSC", 238197, 0.38),
    ],
  },
  {
    ano: 1998,
    turno: 1,
    candidatos: [
      c("fhc", "Fernando Henrique", "PSDB", 35936540, 53.06, { eleito: true }),
      c("lula", "Lula", "PT", 21475218, 31.71),
      c("ciro", "Ciro Gomes", "PPS", 7426190, 10.97),
      c("eneas", "Enéas", "PRONA", 1447090, 2.14),
      c("frota", "Ivan Frota", "PMN", 251337, 0.37),
      c("sirkis", "Alfredo Sirkis", "PV", 212984, 0.31),
      c("zemaria", "Zé Maria", "PSTU", 202659, 0.3),
      c("eymael", "Eymael", "PSDC", 171831, 0.25),
    ],
  },
  {
    ano: 2002,
    turno: 1,
    candidatos: [
      c("lula", "Lula", "PT", 39455233, 46.44, { segundoTurno: true }),
      c("serra", "José Serra", "PSDB", 19705445, 23.19, { segundoTurno: true }),
      c("garotinho", "Garotinho", "PSB", 15180097, 17.86),
      c("ciro", "Ciro Gomes", "PPS", 10170882, 11.97),
      c("zemaria", "Zé Maria", "PSTU", 402236, 0.47),
      c("ruicosta", "Rui Costa Pimenta", "PCO", 38619, 0.05),
    ],
  },
  {
    ano: 2002,
    turno: 2,
    candidatos: [
      c("lula", "Lula", "PT", 52793364, 61.27, { eleito: true }),
      c("serra", "José Serra", "PSDB", 33370739, 38.73),
    ],
  },
  {
    ano: 2006,
    turno: 1,
    candidatos: [
      c("lula", "Lula", "PT", 46662365, 48.61, { segundoTurno: true }),
      c("alckmin", "Geraldo Alckmin", "PSDB", 39968369, 41.64, { segundoTurno: true }),
      c("heloisa", "Heloísa Helena", "PSOL", 6575393, 6.85),
      c("cristovam", "Cristovam Buarque", "PDT", 2538844, 2.64),
      c("anarangel", "Ana Maria Rangel", "PRP", 126404, 0.13),
      c("eymael", "Eymael", "PSDC", 63294, 0.07),
      c("bivar", "Luciano Bivar", "PSL", 62064, 0.06),
    ],
  },
  {
    ano: 2006,
    turno: 2,
    candidatos: [
      c("lula", "Lula", "PT", 58295042, 60.83, { eleito: true }),
      c("alckmin", "Geraldo Alckmin", "PSDB", 37543178, 39.17),
    ],
  },
  {
    ano: 2010,
    turno: 1,
    candidatos: [
      c("dilma", "Dilma", "PT", 47651434, 46.91, { segundoTurno: true }),
      c("serra", "José Serra", "PSDB", 33132283, 32.61, { segundoTurno: true }),
      c("marina", "Marina Silva", "PV", 19636359, 19.33),
      c("plinio", "Plínio de Arruda Sampaio", "PSOL", 886816, 0.87),
      c("eymael", "Eymael", "PSDC", 89350, 0.09),
      c("zemaria", "Zé Maria", "PSTU", 84609, 0.08),
      c("levy", "Levy Fidelix", "PRTB", 57960, 0.06),
      c("ivanpinheiro", "Ivan Pinheiro", "PCB", 39136, 0.04),
      c("ruicosta", "Rui Costa Pimenta", "PCO", 12206, 0.01),
    ],
  },
  {
    ano: 2010,
    turno: 2,
    candidatos: [
      c("dilma", "Dilma", "PT", 55752529, 56.05, { eleito: true }),
      c("serra", "José Serra", "PSDB", 43711388, 43.95),
    ],
  },
  {
    ano: 2014,
    turno: 1,
    candidatos: [
      c("dilma", "Dilma", "PT", 43267668, 41.59, { segundoTurno: true }),
      c("aecio", "Aécio Neves", "PSDB", 34897211, 33.55, { segundoTurno: true }),
      c("marina", "Marina Silva", "PSB", 22176619, 21.32),
      c("luciana", "Luciana Genro", "PSOL", 1612186, 1.55),
      c("everaldo", "Pastor Everaldo", "PSC", 780513, 0.75),
      c("eduardojorge", "Eduardo Jorge", "PV", 630099, 0.61),
      c("levy", "Levy Fidelix", "PRTB", 446878, 0.43),
      c("zemaria", "Zé Maria", "PSTU", 91209, 0.09),
      c("eymael", "Eymael", "PSDC", 61250, 0.06),
      c("iasi", "Mauro Iasi", "PCB", 47845, 0.05),
      c("ruicosta", "Rui Costa Pimenta", "PCO", 12324, 0.01),
    ],
  },
  {
    ano: 2014,
    turno: 2,
    candidatos: [
      c("dilma", "Dilma", "PT", 54501118, 51.64, { eleito: true }),
      c("aecio", "Aécio Neves", "PSDB", 51041155, 48.36),
    ],
  },
  {
    ano: 2018,
    turno: 1,
    candidatos: [
      c("bolsonaro", "Jair Bolsonaro", "PSL", 49277010, 46.03, { segundoTurno: true }),
      c("haddad", "Fernando Haddad", "PT", 31342051, 29.28, { segundoTurno: true }),
      c("ciro", "Ciro Gomes", "PDT", 13344371, 12.47),
      c("alckmin", "Geraldo Alckmin", "PSDB", 5096350, 4.76),
      c("amoedo", "João Amoêdo", "NOVO", 2679745, 2.5),
      c("daciolo", "Cabo Daciolo", "PATRIOTA", 1348323, 1.26),
      c("meirelles", "Henrique Meirelles", "MDB", 1288950, 1.2),
      c("marina", "Marina Silva", "REDE", 1069578, 1.0),
      c("alvarodias", "Alvaro Dias", "PODE", 859601, 0.8),
      c("boulos", "Guilherme Boulos", "PSOL", 617122, 0.58),
      c("veralucia", "Vera Lúcia", "PSTU", 55762, 0.05),
      c("eymael", "Eymael", "DC", 41710, 0.04),
      c("goulartfilho", "João Goulart Filho", "PPL", 30176, 0.03),
    ],
  },
  {
    ano: 2018,
    turno: 2,
    candidatos: [
      c("bolsonaro", "Jair Bolsonaro", "PSL", 57797847, 55.13, { eleito: true }),
      c("haddad", "Fernando Haddad", "PT", 47040906, 44.87),
    ],
  },
  {
    ano: 2022,
    turno: 1,
    candidatos: [
      c("lula", "Lula", "PT", 57259504, 48.43, { segundoTurno: true }),
      c("bolsonaro", "Jair Bolsonaro", "PL", 51072345, 43.2, { segundoTurno: true }),
      c("tebet", "Simone Tebet", "MDB", 4915423, 4.16),
      c("ciro", "Ciro Gomes", "PDT", 3599287, 3.04),
      c("soraya", "Soraya Thronicke", "UNIÃO", 600955, 0.51),
      c("davila", "Felipe d'Avila", "NOVO", 559708, 0.47),
      c("kelmon", "Padre Kelmon", "PTB", 81129, 0.07),
      c("leopericles", "Léo Péricles", "UP", 53519, 0.05),
      c("manzano", "Sofia Manzano", "PCB", 45620, 0.04),
      c("veralucia", "Vera Lúcia", "PSTU", 25625, 0.02),
      c("eymael", "Eymael", "DC", 16604, 0.01),
    ],
  },
  {
    ano: 2022,
    turno: 2,
    candidatos: [
      c("lula", "Lula", "PT", 60345999, 50.9, { eleito: true }),
      c("bolsonaro", "Jair Bolsonaro", "PL", 58206354, 49.1),
    ],
  },
];
