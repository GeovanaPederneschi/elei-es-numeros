# Eleições em Números

Site de resultados eleitorais do Brasil com **dados oficiais do TSE**, no estilo das páginas de apuração dos grandes portais:
mapas interativos, comparações entre eleições, histórico desde 1989 e a trajetória de cada candidato.

## O que dá para fazer

- **Mapa de resultados** (`/`): presidente, governador, senador, deputados federal/estadual/distrital, prefeito e vereador.
  - Do país até a zona eleitoral: **Brasil → estado → município → zona**, clicando no mapa.
  - Presidente: mapa **por estado** ou **por município** (os 5.570) e **votos no exterior** (mapa-múndi com as cidades e os países).
  - Governador/senador/deputados no mapa do Brasil: quem ficou em 1º em cada estado; prefeitos no mapa do estado: o partido vencedor em cada município.
  - Clique em um candidato para colorir o mapa só com o desempenho dele.
  - Tooltip ao passar o mouse (ou tocar), zoom (botões, Ctrl + roda, pinça), arrastar, teclado.
- **Candidatos** (`/candidatos` e `/candidato`): perfil com votos, %, situação, e **onde foi mais votado** — por estado, município, zona eleitoral e exterior (cidades e países), cada um com mapa e ranking.
- **Trajetória**: todas as disputas do candidato (ex.: Lula 1989, 1994, 1998, 2002, 2006, 2022, 2026), com a variação em **pontos percentuais** e em votos entre quaisquer duas eleições.
- **Comparar eleições** (`/comparar`): quanto um candidato/partido cresceu ou caiu entre duas eleições, local a local, com mapa divergente (azul = ganhou, vermelho = perdeu).
- **Histórico** (`/historico`): todas as eleições presidenciais desde 1989, gráfico por candidato ou partido, resultado de cada ano.
- Tema claro/escuro, layout para celular.

## Deploy na Vercel (sem configuração)

1. Suba este repositório no GitHub.
2. Em [vercel.com/new](https://vercel.com/new), importe o repositório.
3. Clique em **Deploy**. Não precisa de variáveis de ambiente.

A Vercel detecta o Next.js sozinha. As rotas `/api/*` buscam os dados no TSE e no IBGE pelo servidor (sem problema de CORS) e ficam em cache na CDN da Vercel.

> O `vercel.json` coloca as funções em `gru1` (São Paulo), perto dos servidores do TSE. Pode remover se preferir.

## Rodar localmente

```bash
npm install
npm run dev          # http://localhost:3000
```

Sem internet (ou para testar a interface), use dados simulados:

```bash
TSE_MOCK=1 npm run dev
```

## De onde vêm os dados

| Dado | Fonte |
|---|---|
| Resultados 2026 em diante | API de divulgação `resultados.tse.jus.br`, formato novo: arquivo unificado EA20 (`-u.json`, um por Brasil/UF/município/zona), diretórios lidos do campo `arq` do `ele-c.json` (EA11), municípios do EA12 |
| Resultados 2002–2022 (todos os cargos, por UF, município e zona, exterior) | Portal de Dados Abertos do TSE (`cdn.tse.jus.br`, `votacao_candidato_munzona` e `detalhe_votacao_munzona`). O servidor baixa só o trecho do ZIP com o estado pedido (HTTP Range), descompacta em streaming e guarda o resultado em cache por 7 dias |
| Lista de eleições (inclui as mais recentes automaticamente) | `resultados.tse.jus.br/oficial/comum/config/ele-c.json` |
| Presidência 1989–2022 (nacional) | Base embutida em `data/presidente-historico.ts` (resultados oficiais do TSE) |
| Histórico completo 1998–2024, todos os cargos (opcional) | Portal de Dados Abertos do TSE, via `npm run historico` |
| Mapas de estados e municípios | API de malhas do IBGE (com reserva no `tbrugz/geodata-br`) |
| Mapa-múndi | `world-atlas` (Natural Earth) |

### Base histórica completa (opcional)

A API de divulgação do TSE só cobre de 2020 em diante. Para que a trajetória mostre também deputados, senadores, governadores e prefeitos de anos anteriores:

```bash
npm run historico                # baixa e processa 1998–2024 (vários GB de download; precisa do comando `unzip`)
npm run historico -- 2014 2018   # só alguns anos
```

Os arquivos gerados em `public/historico/` (poucos MB) devem ser commitados; o site passa a usá-los automaticamente.
Nessa base o percentual dos cargos proporcionais é calculado sobre os votos nominais.

### Variáveis de ambiente (todas opcionais)

| Variável | Para quê |
|---|---|
| `TSE_MOCK=1` | Usa dados simulados (desenvolvimento offline). |
| `TSE_BASE_URL` | Troca a URL base da API (padrão `https://resultados.tse.jus.br/oficial`). |
| `TSE_ELEICOES_EXTRA` | Adiciona eleições manualmente se o TSE não as listar: `2026:700:federal:1,2026:702:estadual:1` (`ano:código:tipo:turno`). |

## Estrutura

```
app/                 páginas (Next.js App Router) e rotas /api
  api/eleicoes       catálogo de eleições
  api/resultado      resultado de uma abrangência (BR, UF, município)
  api/distribuicao   votos por estado / município / zona / cidade no exterior
  api/municipios     lista de municípios e zonas (códigos TSE ↔ IBGE)
  api/malha          GeoJSON do IBGE normalizado
  api/trajetoria     busca de um candidato em todas as eleições
components/          mapa interativo, painéis, explorador, perfil, comparador, histórico
lib/tse.ts           leitura e normalização da API do TSE (com cache)
lib/exterior.ts      cidades no exterior → país e coordenadas
data/                base histórica de presidente
scripts/             gerador da base histórica completa
```

## SEO

- Páginas com endereço amigável e resumo em texto renderizado no servidor:
  `/resultados/2026/presidente`, `/resultados/2026/presidente/sp`, `/resultados/2022/presidente/brasil/2-turno`,
  `/resultados/2024/prefeito/sp/sao-paulo`, além do índice `/resultados`.
- Título, descrição, canônico, Open Graph/Twitter e imagem de compartilhamento em todas as páginas;
  perfil de candidato com título próprio (`/candidato?...`).
- `sitemap.xml` (todas as eleições × cargos × estados/capitais) e `robots.txt` gerados automaticamente.
- Dados estruturados Schema.org: `WebSite` (com busca), `Dataset`, `BreadcrumbList` e `Person`.
- O domínio é detectado na Vercel (`VERCEL_PROJECT_PRODUCTION_URL`). Para domínio próprio, defina
  `NEXT_PUBLIC_SITE_URL=https://seudominio.com.br`. Para o Google Search Console, defina
  `GOOGLE_SITE_VERIFICATION` com o código de verificação.

## Diagnóstico

Se algum recorte não carregar, abra `/api/diagnostico` no site publicado: ele mostra, a partir do servidor,
quais arquivos do TSE existem e o início de cada um (útil quando o TSE muda o formato de divulgação).

## Observações

- As zonas eleitorais não têm limites geográficos publicados pelo TSE; por isso aparecem como um mosaico interativo (cada bloco é uma zona, proporcional ao eleitorado).
- A trajetória casa candidaturas pelo nome de urna; homônimos podem aparecer (o partido e o local são exibidos para conferir).
- Projeto independente, sem vínculo com o TSE.
