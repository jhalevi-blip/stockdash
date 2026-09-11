// Config-driven broker landing pages. One shared component (BrokerLanding) is
// driven by these objects — adding Saxo, Trading 212, etc. is a new entry here,
// not a new page. Each page states the problem and shows the demo; the blog
// posts do the teaching (we link to them, never duplicate them).

const SITE = 'https://stockdashes.com';

// Nav / footer / legal chrome by language, so a Dutch page is Dutch throughout.
export const CHROME = {
  en: {
    signIn: 'Sign In', signUp: 'Sign Up', blog: 'Blog', dashboard: 'Open Dashboard',
    privacy: 'Privacy Policy',
    footerNote: 'Free & open · No ads · stockdashes.com',
    disclaimer:
      'StockDashes is for informational purposes only and does not constitute financial advice. Market data may be delayed or inaccurate. Always do your own research.',
  },
  nl: {
    signIn: 'Inloggen', signUp: 'Aanmelden', blog: 'Blog', dashboard: 'Naar dashboard',
    privacy: 'Privacybeleid',
    footerNote: 'Gratis & open · Geen advertenties · stockdashes.com',
    disclaimer:
      'StockDashes is uitsluitend informatief en vormt geen beleggingsadvies. Marktdata kunnen vertraagd of onjuist zijn. Doe altijd je eigen onderzoek.',
  },
};

// ── UI strings for the reused demo / walkthrough / trust strip, by language.
// DTCsvDemo and DTTrustStrip read en+nl here (en matches their previous hardcoded
// copy, so the homepage renders identically). DTStepsWalkthrough keeps its English
// JSX inline (to preserve bold emphasis) and only pulls Dutch from steps.nl here.
export const UI_STRINGS = {
  en: {
    demo: {
      dropHeadline: 'Drop your DEGIRO Account Statement here',
      browsePrefix: 'XLSX or CSV · or ',
      browseLink: 'browse your files',
      parsing: 'Reading your statement… nothing is being uploaded.',
      trust:
        'Your file never leaves your browser — it’s parsed on your device. To match your holdings to tickers, only the ISIN codes are sent to a lookup service. No account, and your statement is never uploaded.',
      errors: {
        not_degiro: {
          title: 'That doesn’t look like a DEGIRO or Saxo statement',
          body: (d) =>
            `This demo reads the DEGIRO Account Statement (Rekeningoverzicht) and the Saxo transaction export.${
              d?.detectedFormat && d.detectedFormat !== 'generic' && d.detectedFormat !== 'unknown'
                ? ` We detected a ${d.detectedFormat} file instead.`
                : ''
            } In DEGIRO: Inbox → Account Statement → export to XLSX. In Saxo: export your transaction history (Transacties) to XLSX. Then drop it here.`,
        },
        degiro_transactions_export: {
          title: 'That’s the DEGIRO Transactions export',
          body: () =>
            'For your real return we need the Account Statement (Rekeningoverzicht) export instead — it carries the full history. In DEGIRO: Inbox → Account Statement → export to XLSX.',
        },
        zero_resolved: {
          title: 'We couldn’t match any of your holdings',
          body: (d) =>
            `We read your statement but none of your ${d.totalCount} position${d.totalCount === 1 ? '' : 's'} could be matched to a ticker. This usually happens with funds or non-US-listed names our lookup doesn’t cover yet.`,
        },
        partial_export: {
          title: 'This looks like a partial export',
          body: (d) =>
            `Your statement has ${d.tickers.length} position${d.tickers.length === 1 ? '' : 's'} sold with no matching purchase (${d.tickers.slice(0, 6).join(', ')}${d.tickers.length > 6 ? '…' : ''}) — a sign it covers a date range, not your full history. A return from a partial file would be wrong, so re-export your ${d?.broker === 'saxo' ? 'Saxo transaction history' : 'DEGIRO Account Statement'} over the full date range (all history) and drop it again.`,
        },
        no_positions: {
          title: 'No open positions to show',
          body: (d) =>
            d.matchedCount > 0
              ? 'We matched your trades, but they’ve all been fully closed — there are no open positions left to chart.'
              : `We read your ${d?.broker === 'saxo' ? 'Saxo transactions' : 'DEGIRO statement'} but found no buy/sell transactions in it.`,
        },
        parse_error: {
          title: 'We couldn’t read that file',
          body: (d) => d?.message ?? `Please try exporting your ${d?.broker === 'saxo' ? 'Saxo transaction history' : 'DEGIRO Account Statement'} again as XLSX.`,
        },
        unrecognized_columns: {
          title: 'We couldn’t recognise this file’s columns',
          body: (d) =>
            `This looked like a ${d?.broker === 'saxo' ? 'Saxo' : 'DEGIRO'} export, but some expected columns were missing${
              d?.missing?.length ? ` (${d.missing.join(', ')})` : ''
            }. Re-export the ${d?.broker === 'saxo' ? 'Saxo transaction' : 'DEGIRO Account Statement'} file without renaming or removing columns, then drop it again.`,
        },
      },
    },
    trust: [
      { icon: '✓', text: '100% Free' },
      { icon: '✓', text: 'No credit card' },
      { icon: '✓', text: 'No ads, ever' },
      { icon: '🔒', text: 'Your data stays private — EU-hosted, never sold' },
    ],
    result: {
      heading: 'Your real return',
      subhead: 'Time-weighted, in EUR, with historical FX handled — benchmarked against SPY.',
      tryAnother: 'Try another file',
      matched: (m, t) => `Matched ${m} of ${t} positions.`,
      excluded: (n) =>
        `${n} ${n === 1 ? 'was' : 'were'} excluded — we couldn’t confirm a priced listing for the right company (no match, no price history, or an ambiguous ticker).`,
      capped: (cap, total) => `Showing your ${cap} largest positions by cost basis (of ${total}).`,
      closed: (n) =>
        `Return also counts ${n} position${n === 1 ? '' : 's'} you bought and sold within this window (not shown in the list above).`,
      dropped: (arr) =>
        `${arr.length} traded position${arr.length === 1 ? '' : 's'} past the 18-ticker limit ${arr.length === 1 ? 'is' : 'are'} not in the return: ${arr.slice(0, 8).join(', ')}${arr.length > 8 ? '…' : ''}.`,
      unsized: (arr) =>
        `${arr.length} non-euro position${arr.length === 1 ? '' : 's'} couldn’t be converted to euros to rank ${arr.length === 1 ? 'it' : 'them'}, so ${arr.length === 1 ? 'it was' : 'they were'} left out: ${arr.slice(0, 8).join(', ')}${arr.length > 8 ? '…' : ''}.`,
      options: (n) => `We don’t chart options — ${n} option ${n === 1 ? 'leg' : 'legs'} excluded.`,
      collision: (arr) =>
        `${arr.length} ${arr.length === 1 ? 'position was' : 'positions were'} traded in more than one currency and can’t be reliably priced, so ${arr.length === 1 ? 'it was' : 'they were'} excluded: ${arr.slice(0, 8).map((x) => `${x.t} (${x.ccy.join(', ')})`).join(', ')}${arr.length > 8 ? '…' : ''}.`,
      statTwr: 'Portfolio TWR',
      statSpy: 'SPY total return',
      statVs: 'vs SPY',
      chartHeading: 'Your holdings vs SPY',
      chartCaption: 'time-weighted · total return · cash excluded',
      chartBuilding: 'Building daily ledger…',
      chartNoPrice: 'Couldn’t load price history for these positions.',
      chartRangeErr: (reason) =>
        `Couldn’t chart this range — ${reason}. Some price history for your positions is missing.`,
      legendPortfolio: (v) => `— Portfolio TWR (${v})`,
      legendSpy: (v) => `— SPY total return (${v})`,
      chartSince: (d0) => `Time-weighted return since ${d0}, cash excluded. Deposits don’t move the line.`,
      posHeading: 'Your open positions',
      posCaption: (n) => `${n} held · cost basis in native currency`,
      thTicker: 'Ticker',
      thShares: 'Shares',
      thAvgCost: 'Avg cost',
      thCostBasis: 'Cost basis',
      footer:
        'Returns are time-weighted and cash-excluded. Cost basis is shown in each position’s native currency as parsed from your statement. Informational only, not investment advice.',
    },
  },
  nl: {
    demo: {
      dropHeadline: 'Sleep hier je DEGIRO-Rekeningoverzicht',
      browsePrefix: 'XLSX of CSV · of ',
      browseLink: 'kies een bestand',
      parsing: 'Bezig met inlezen… er wordt niets geüpload.',
      trust:
        'Je bestand verlaat je browser niet — het wordt op je apparaat verwerkt. Om je posities aan tickers te koppelen, worden alleen de ISIN-codes naar een opzoekdienst gestuurd. Geen account, en je overzicht wordt nooit geüpload.',
      errors: {
        not_degiro: {
          title: 'Dit lijkt geen DEGIRO- of Saxo-overzicht',
          body: (d) =>
            `Deze demo leest het DEGIRO-Rekeningoverzicht (Account Statement) en de Saxo-transactie-export.${
              d?.detectedFormat && d.detectedFormat !== 'generic' && d.detectedFormat !== 'unknown'
                ? ` We herkenden in plaats daarvan een ${d.detectedFormat}-bestand.`
                : ''
            } In DEGIRO: Inbox → Rekeningoverzicht → exporteer als XLSX. In Saxo: exporteer je transactiegeschiedenis (Transacties) als XLSX. Sleep het daarna hierheen.`,
        },
        degiro_transactions_export: {
          title: 'Dit is de DEGIRO-transactie-export',
          body: () =>
            'Voor je werkelijke rendement hebben we het Rekeningoverzicht (Account Statement) nodig — dat bevat de volledige historie. In DEGIRO: Inbox → Rekeningoverzicht → exporteer als XLSX.',
        },
        zero_resolved: {
          title: 'We konden geen van je posities koppelen',
          body: (d) =>
            `We lazen je overzicht, maar geen van je ${d.totalCount} positie${d.totalCount === 1 ? '' : 's'} kon aan een ticker worden gekoppeld. Dit gebeurt meestal bij fondsen of niet-Amerikaans genoteerde namen die onze opzoekdienst nog niet dekt.`,
        },
        partial_export: {
          title: 'Dit lijkt een gedeeltelijke export',
          body: (d) =>
            `Je overzicht bevat ${d.tickers.length} positie${d.tickers.length === 1 ? '' : 's'} die is verkocht zonder bijbehorende aankoop (${d.tickers.slice(0, 6).join(', ')}${d.tickers.length > 6 ? '…' : ''}) — een teken dat het een periode beslaat, niet je volledige historie. Een rendement uit een onvolledig bestand zou onjuist zijn, dus exporteer je ${d?.broker === 'saxo' ? 'Saxo-transactiegeschiedenis' : 'DEGIRO-Rekeningoverzicht'} over de volledige periode (alle historie) en sleep het opnieuw.`,
        },
        no_positions: {
          title: 'Geen open posities om te tonen',
          body: (d) =>
            d.matchedCount > 0
              ? 'We hebben je transacties gekoppeld, maar ze zijn allemaal volledig gesloten — er zijn geen open posities meer om te tonen.'
              : `We lazen je ${d?.broker === 'saxo' ? 'Saxo-transacties' : 'DEGIRO-overzicht'}, maar vonden geen koop- of verkooptransacties.`,
        },
        parse_error: {
          title: 'We konden dat bestand niet lezen',
          body: (d) => `Zorg dat het een geldig ${d?.broker === 'saxo' ? 'Saxo-transactiebestand' : 'DEGIRO-Rekeningoverzicht'} is (XLSX of CSV) en probeer het opnieuw.`,
        },
        unrecognized_columns: {
          title: 'We herkenden de kolommen van dit bestand niet',
          body: (d) =>
            `Dit leek een ${d?.broker === 'saxo' ? 'Saxo' : 'DEGIRO'}-export, maar enkele verwachte kolommen ontbraken${
              d?.missing?.length ? ` (${d.missing.join(', ')})` : ''
            }. Exporteer het ${d?.broker === 'saxo' ? 'Saxo-transactiebestand' : 'DEGIRO-Rekeningoverzicht'} opnieuw zonder kolommen te hernoemen of te verwijderen, en sleep het opnieuw.`,
        },
      },
    },
    trust: [
      { icon: '✓', text: '100% gratis' },
      { icon: '✓', text: 'Geen creditcard' },
      { icon: '✓', text: 'Geen advertenties' },
      { icon: '🔒', text: 'Je gegevens blijven privé — in de EU gehost, nooit verkocht' },
    ],
    result: {
      heading: 'Je werkelijke rendement',
      subhead: 'Tijdgewogen, in euro’s, met historische valuta verrekend — afgezet tegen SPY.',
      tryAnother: 'Ander bestand proberen',
      matched: (m, t) => `${m} van ${t} posities gekoppeld.`,
      excluded: (n) =>
        `${n} ${n === 1 ? 'positie is' : 'posities zijn'} uitgesloten — we konden geen genoteerde koers voor het juiste bedrijf bevestigen (geen match, geen koershistorie, of een dubbelzinnige ticker).`,
      capped: (cap, total) => `We tonen je ${cap} grootste posities op kostprijs (van ${total}).`,
      closed: (n) =>
        `Het rendement telt ook ${n} positie${n === 1 ? '' : 's'} mee die je binnen deze periode hebt gekocht en verkocht (niet in de lijst hierboven).`,
      dropped: (arr) =>
        `${arr.length} verhandelde positie${arr.length === 1 ? '' : 's'} voorbij de limiet van 18 tickers ${arr.length === 1 ? 'zit' : 'zitten'} niet in het rendement: ${arr.slice(0, 8).join(', ')}${arr.length > 8 ? '…' : ''}.`,
      unsized: (arr) =>
        `${arr.length} niet-euro positie${arr.length === 1 ? '' : 's'} ${arr.length === 1 ? 'kon' : 'konden'} niet naar euro’s worden omgerekend om ${arr.length === 1 ? 'die' : 'ze'} te rangschikken en ${arr.length === 1 ? 'is' : 'zijn'} weggelaten: ${arr.slice(0, 8).join(', ')}${arr.length > 8 ? '…' : ''}.`,
      options: (n) => `We tonen geen opties — ${n} optie${n === 1 ? '' : 's'} uitgesloten.`,
      collision: (arr) =>
        `${arr.length} positie${arr.length === 1 ? '' : 's'} ${arr.length === 1 ? 'is' : 'zijn'} in meer dan één valuta verhandeld en ${arr.length === 1 ? 'kan' : 'kunnen'} niet betrouwbaar geprijsd worden, dus ${arr.length === 1 ? 'is die' : 'zijn ze'} uitgesloten: ${arr.slice(0, 8).map((x) => `${x.t} (${x.ccy.join(', ')})`).join(', ')}${arr.length > 8 ? '…' : ''}.`,
      statTwr: 'Tijdgewogen rendement',
      statSpy: 'SPY totaalrendement',
      statVs: 'vs. SPY',
      chartHeading: 'Je posities vs. SPY',
      chartCaption: 'tijdgewogen · totaalrendement · exclusief cash',
      chartBuilding: 'Dagelijks grootboek opbouwen…',
      chartNoPrice: 'Kon geen koershistorie voor deze posities laden.',
      chartRangeErr: (reason) =>
        `Kon deze periode niet in beeld brengen — ${reason}. Een deel van de koershistorie voor je posities ontbreekt.`,
      legendPortfolio: (v) => `— Tijdgewogen rendement (${v})`,
      legendSpy: (v) => `— SPY totaalrendement (${v})`,
      chartSince: (d0) => `Tijdgewogen rendement sinds ${d0}, exclusief cash. Stortingen bewegen de lijn niet.`,
      posHeading: 'Je open posities',
      posCaption: (n) => `${n} aangehouden · kostprijs in oorspronkelijke valuta`,
      thTicker: 'Ticker',
      thShares: 'Aandelen',
      thAvgCost: 'Gem. koers',
      thCostBasis: 'Kostprijs',
      footer:
        'Rendementen zijn tijdgewogen en exclusief cash. De kostprijs staat in de oorspronkelijke valuta van elke positie, zoals ingelezen uit je overzicht. Uitsluitend informatief, geen beleggingsadvies.',
    },
    steps: {
      eyebrow: 'Van export naar inzicht in drie stappen',
      heading: 'Eén bestand. Geen brokerlogin.',
      s1: {
        title: 'Exporteer uit DEGIRO',
        body: 'Inbox → Rekeningoverzicht (Account Statement). Zet de periode op je volledige historie, niet alleen het laatste jaar — een gedeeltelijke export maakt het rendement onjuist. Exporteer als XLSX of CSV.',
      },
      s2: {
        title: 'Sleep het bestand erin',
        body: 'Wij verwerken het: ISINs opgezocht, stortingen gescheiden van transacties, historische valuta toegepast, transacties op dezelfde dag geordend.',
        annotation: 'Hier exporteren',
      },
      s3: {
        title: 'Zie je werkelijke rendement',
        body: 'Tijdgewogen rendement versus benchmark, winst/verlies per positie, en AI-onderzoek over elke holding.',
      },
    },
  },
};

// ── DEGIRO — English ─────────────────────────────────────────────────────────
export const degiroEn = {
  slug: 'degiro',
  path: '/degiro',
  name: 'DEGIRO',
  lang: 'en',
  // hreflang cluster shared with the Dutch page.
  hreflang: { 'en': '/degiro', 'nl': '/nl/degiro', 'x-default': '/degiro' },
  meta: {
    title: 'DEGIRO Portfolio Tracker — See Your Real Return, Free | StockDashes',
    description:
      'Track your DEGIRO portfolio and see your real, time-weighted return — historical FX handled, benchmarked. Drop your Account Statement, get the number DEGIRO hides. Free, no account, nothing uploaded.',
  },
  copy: {
    eyebrow: 'For DEGIRO investors',
    h1: 'The free DEGIRO portfolio tracker that shows your real return',
    subhead:
      'DEGIRO shows you a green number, not your real return. Drop your Account Statement and see your true time-weighted return — currency handled, benchmarked against the market — in seconds. No broker login, nothing uploaded.',
    ctaPrimary: 'See my real return',
    ctaSecondary: 'Sign up free',
    trustFine:
      'No broker login. Read-only export. Your Account Statement is parsed in your browser and never leaves your device — only the ISIN codes are sent to look up tickers.',
    problemTitle: 'What DEGIRO doesn’t show you',
    problemLead:
      'DEGIRO shows your balance and a simple gain versus what you put in. It never shows your time-weighted return, so the timing of your own deposits quietly flatters or punishes the figure. It folds EUR/USD moves into the number instead of separating currency from stock performance. And it blends banked gains with paper ones. StockDashes rebuilds all of it from the one file DEGIRO already gives you.',
    problemLinks: [
      { label: 'How to export your Account Statement →', href: '/blog/degiro-export-guide' },
      { label: 'Why your real return differs from DEGIRO’s number →', href: '/blog/degiro-real-return' },
    ],
    faqTitle: 'DEGIRO portfolio tracker — FAQ',
    finalTitle: 'See your real DEGIRO return',
    finalCta: 'Get started — it’s free',
  },
  faq: [
    {
      q: 'Does DEGIRO show your real return?',
      a: 'Not fully. DEGIRO shows your current value and a simple gain versus what you deposited, but no time-weighted return, no currency split, no realized-versus-unrealized breakdown and no benchmark. StockDashes computes those from your Account Statement.',
    },
    {
      q: 'Is the DEGIRO portfolio tracker free?',
      a: 'Yes. You can drop your Account Statement and see your real return without an account. Sign up (also free) to save your portfolio and get AI research on every holding.',
    },
    {
      q: 'Which DEGIRO file do I need?',
      a: 'The Account Statement (Rekeningoverzicht), exported over your full history as XLSX or CSV. It already contains your trades, dividends, fees and deposits — it’s the only file you need.',
    },
    {
      q: 'Is my data safe?',
      a: 'Your statement is parsed entirely in your browser and never uploaded. Only the ISIN codes are sent to a lookup service to match your holdings to tickers. There is no broker login and nothing to delete.',
    },
    {
      q: 'What is a time-weighted return?',
      a: 'A return that splits your history at every deposit and withdrawal and links the pieces, so the timing of your own contributions can’t flatter or punish the result. It measures how your decisions performed — the number worth comparing to an index.',
    },
  ],
};

// ── DEGIRO — Dutch (priority page; written native, not translated) ───────────
export const degiroNl = {
  slug: 'degiro',
  path: '/nl/degiro',
  name: 'DEGIRO',
  lang: 'nl',
  hreflang: { 'en': '/degiro', 'nl': '/nl/degiro', 'x-default': '/degiro' },
  meta: {
    title: 'DEGIRO rendement berekenen — je werkelijke rendement, gratis | StockDashes',
    description:
      'Bereken je werkelijke DEGIRO-rendement: tijdgewogen, met valuta-effect apart en afgezet tegen een benchmark. Sleep je Rekeningoverzicht erin en zie in seconden wat DEGIRO je niet laat zien. Gratis, geen account, niets wordt geüpload.',
  },
  copy: {
    eyebrow: 'Voor DEGIRO-beleggers',
    h1: 'Bereken je werkelijke DEGIRO-rendement — gratis',
    subhead:
      'DEGIRO laat een groen getal zien, niet je werkelijke rendement. Sleep je Rekeningoverzicht erin en zie je echte tijdgewogen rendement — valuta apart gerekend, afgezet tegen de markt — binnen enkele seconden. Geen brokerlogin, niets wordt geüpload.',
    ctaPrimary: 'Bekijk mijn rendement',
    ctaSecondary: 'Gratis aanmelden',
    trustFine:
      'Geen brokerlogin. Alleen-lezen export. Je Rekeningoverzicht wordt in je browser verwerkt en verlaat je apparaat nooit — alleen de ISIN-codes gaan naar een dienst om de tickers op te zoeken.',
    problemTitle: 'Wat DEGIRO je niet laat zien',
    problemLead:
      'DEGIRO toont je saldo en een simpele winst ten opzichte van wat je hebt ingelegd. Het laat geen tijdgewogen rendement zien, waardoor het moment van je eigen stortingen het getal stiekem mooier of slechter maakt. Het verwerkt EUR/USD-bewegingen in het resultaat in plaats van valuta los te tonen van je aandelenprestatie. En het gooit gerealiseerde winst en papieren winst op één hoop. StockDashes rekent dat allemaal opnieuw uit — uit het ene bestand dat DEGIRO je al geeft.',
    problemLinks: [
      { label: 'Zo exporteer je je Rekeningoverzicht →', href: '/blog/degiro-export-guide' },
      { label: 'Waarom je werkelijke rendement afwijkt van het getal van DEGIRO →', href: '/blog/degiro-real-return' },
    ],
    faqTitle: 'DEGIRO rendement berekenen — veelgestelde vragen',
    finalTitle: 'Zie je werkelijke DEGIRO-rendement',
    finalCta: 'Begin gratis',
  },
  faq: [
    {
      q: 'Laat DEGIRO mijn werkelijke rendement zien?',
      a: 'Niet volledig. DEGIRO toont je huidige waarde en een simpele winst ten opzichte van je inleg, maar geen tijdgewogen rendement, geen valuta-uitsplitsing, geen gerealiseerd-versus-ongerealiseerd en geen benchmark. StockDashes berekent dat uit je Rekeningoverzicht.',
    },
    {
      q: 'Is het gratis om mijn DEGIRO-portefeuille bij te houden?',
      a: 'Ja. Je sleept je Rekeningoverzicht erin en ziet je werkelijke rendement zonder account. Meld je (ook gratis) aan om je portefeuille op te slaan en AI-onderzoek per positie te krijgen.',
    },
    {
      q: 'Welk DEGIRO-bestand heb ik nodig?',
      a: 'Het Rekeningoverzicht (Account Statement), geëxporteerd over je volledige historie als XLSX of CSV. Het bevat al je transacties, dividenden, kosten en stortingen — meer heb je niet nodig.',
    },
    {
      q: 'Zijn mijn gegevens veilig?',
      a: 'Je Rekeningoverzicht wordt volledig in je browser verwerkt en wordt nooit geüpload. Alleen de ISIN-codes gaan naar een dienst om je posities aan tickers te koppelen. Er is geen brokerlogin en er valt niets te verwijderen.',
    },
    {
      q: 'Wat is tijdgewogen rendement?',
      a: 'Een rendement dat je historie opknipt bij elke storting en opname en die stukken aan elkaar koppelt, zodat de timing van je eigen inleg het resultaat niet kan vertekenen. Het meet hoe je keuzes presteerden — het getal dat je met een index kunt vergelijken.',
    },
  ],
};

// ── Saxo — removed until the browser demo parses Saxo account statements ─────
// The parser only handles DEGIRO today, so a Saxo page would tell Saxo users to
// export from DEGIRO and show DEGIRO screenshots — the wrong broker as a first
// impression. Re-adding Saxo is one entry here (same shape as degiroEn) plus its
// page.tsx and the sitemap/AppShell path — no new component.

// ── Metadata + JSON-LD helpers (blog metadata pattern; metadataBase resolves
//    the relative URLs, so nothing is hardcoded here) ─────────────────────────
export function buildBrokerMetadata(config) {
  const { meta, path, lang, hreflang } = config;
  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: path,
      ...(hreflang ? { languages: hreflang } : {}),
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: path,
      siteName: 'StockDashes',
      type: 'website',
      locale: lang === 'nl' ? 'nl_NL' : 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.description,
    },
  };
}

export function brokerFaqJsonLd(config) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: config.lang,
    mainEntity: config.faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export { SITE };
