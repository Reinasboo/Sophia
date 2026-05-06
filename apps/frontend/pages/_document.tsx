import { Html, Head, Main, NextScript } from 'next/document';

const SITE_URL = 'https://frontend-virid-two-71.vercel.app';
const SITE_TITLE = 'Sophia Agentic Wallet';
const SITE_DESCRIPTION =
  'Deploy autonomous Solana agents, manage guardrails, and operate BYOA workflows on mainnet.';
const SHARE_IMAGE = `${SITE_URL}/uploads/logo/logo.png`;

export default function Document() {
  return (
    <Html lang="en" className="dark">
      <Head>
        <meta name="description" content={SITE_DESCRIPTION} />
        <meta name="application-name" content={SITE_TITLE} />
        <meta name="theme-color" content="#0a0a0f" />
        <link rel="canonical" href={SITE_URL} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SITE_TITLE} />
        <meta property="og:title" content={SITE_TITLE} />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:image" content={SHARE_IMAGE} />
        <meta property="og:image:width" content="1024" />
        <meta property="og:image:height" content="1024" />
        <meta property="og:image:alt" content={`${SITE_TITLE} logo`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={SITE_TITLE} />
        <meta name="twitter:description" content={SITE_DESCRIPTION} />
        <meta name="twitter:image" content={SHARE_IMAGE} />
        <link rel="icon" href="/uploads/logo/logo.png" type="image/png" />
        <link rel="shortcut icon" href="/uploads/logo/logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/uploads/logo/logo.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
