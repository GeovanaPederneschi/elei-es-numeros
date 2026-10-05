import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import AlternarTema from "@/components/AlternarTema";
import { SITE_NOME, SITE_URL, urlResultado } from "@/lib/seo";

const DESCRICAO =
  "Resultados das eleições 2026, 2024, 2022 e anteriores com dados oficiais do TSE: mapa interativo de votação por estado, município, zona eleitoral e exterior, apuração, comparação entre eleições e trajetória dos candidatos.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NOME} — resultados e mapas das eleições no Brasil`, template: `%s | ${SITE_NOME}` },
  description: DESCRICAO,
  applicationName: SITE_NOME,
  keywords: [
    "eleições 2026",
    "resultado eleição",
    "apuração",
    "mapa eleitoral",
    "votos por estado",
    "votos por município",
    "zona eleitoral",
    "TSE",
    "presidente",
    "governador",
    "senador",
    "deputado federal",
    "prefeito",
    "vereador",
  ],
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: SITE_NOME, locale: "pt_BR", title: SITE_NOME, description: DESCRICAO, url: "/" },
  twitter: { card: "summary_large_image", title: SITE_NOME, description: DESCRICAO },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  category: "news",
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
};

const JSON_LD_SITE = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NOME,
  url: SITE_URL,
  inLanguage: "pt-BR",
  description: DESCRICAO,
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/candidatos?q={busca}` },
    "query-input": "required name=busca",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b3d91" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1726" },
  ],
};

const tema = `try{var t=localStorage.getItem('tema');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: tema }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_SITE) }} />
      </head>
      <body>
        <header className="topo">
          <div className="topo-interno">
            <Link href="/" className="marca">
              <span className="marca-icone" aria-hidden>
                ▦
              </span>
              <span>
                Eleições <b>em Números</b>
              </span>
            </Link>
            <nav className="menu" aria-label="Principal">
              <Link href="/">Mapa de resultados</Link>
              <Link href="/resultados">Todas as eleições</Link>
              <Link href="/candidatos">Candidatos</Link>
              <Link href="/comparar">Comparar eleições</Link>
              <Link href="/historico">Histórico</Link>
            </nav>
            <AlternarTema />
          </div>
        </header>
        <main className="conteudo">{children}</main>
        <footer className="rodape">
          <nav className="links-rodape" aria-label="Páginas mais procuradas">
            <Link href={urlResultado(2026, 1, "br")}>Presidente 2026</Link>
            <Link href={urlResultado(2026, 3, "br")}>Governadores 2026</Link>
            <Link href={urlResultado(2026, 5, "br")}>Senado 2026</Link>
            <Link href={urlResultado(2026, 6, "sp")}>Deputados federais SP 2026</Link>
            <Link href={urlResultado(2024, 11, "sp", "São Paulo")}>Prefeito de São Paulo 2024</Link>
            <Link href={urlResultado(2024, 11, "rj", "Rio de Janeiro")}>Prefeito do Rio 2024</Link>
            <Link href={urlResultado(2022, 1, "br")}>Presidente 2022</Link>
            <Link href={urlResultado(2022, 1, "br", undefined, 2)}>2º turno 2022</Link>
            <Link href="/historico">Histórico desde 1989</Link>
            <Link href="/comparar">Comparar eleições</Link>
          </nav>
          <p>
            Dados: <a href="https://resultados.tse.jus.br" target="_blank" rel="noreferrer">Tribunal Superior Eleitoral (TSE)</a> — divulgação oficial de resultados ·
            Malhas: <a href="https://servicodados.ibge.gov.br" target="_blank" rel="noreferrer">IBGE</a>. Projeto independente, sem vínculo com o TSE.
          </p>
        </footer>
      </body>
    </html>
  );
}
