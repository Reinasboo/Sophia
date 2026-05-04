import { createRemoteJWKSet, importSPKI, jwtVerify } from 'jose';

const PRIVY_ISSUER = 'privy.io';

export interface VerifiedPrivyToken {
  userId: string;
  sessionId: string;
  appId: string;
  issuer: string;
  issuedAt: number;
  expiration: number;
  email?: string;
  walletAddress?: string;
}

type PrivyTokenClaims = {
  sub?: string;
  sid?: string;
  appId?: string;
  email?: string;
  walletAddress?: string;
} & Record<string, unknown>;

let cachedRemoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedPublicKeyPromise: Promise<unknown> | null = null;

async function getVerificationKey(): Promise<any | null> {
  const jwksUrl = process.env['PRIVY_JWKS_URL'];
  if (jwksUrl) {
    if (!cachedRemoteJwks) {
      cachedRemoteJwks = createRemoteJWKSet(new URL(jwksUrl));
    }
    return cachedRemoteJwks;
  }

  const publicKeyPem = process.env['PRIVY_PUBLIC_KEY_PEM'];
  if (publicKeyPem) {
    if (!cachedPublicKeyPromise) {
      cachedPublicKeyPromise = importSPKI(publicKeyPem, 'ES256');
    }
    return cachedPublicKeyPromise;
  }

  return null;
}

export async function verifyPrivyAccessToken(accessToken: string): Promise<VerifiedPrivyToken | null> {
  if (!accessToken) {
    return null;
  }

  const verifier = await getVerificationKey();
  if (!verifier) {
    if (process.env.NODE_ENV !== 'production') {
      const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accessToken);
      if (looksLikeEmail) {
        return {
          userId: `dev_${accessToken.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          sessionId: `dev_session_${Buffer.from(accessToken).toString('hex').slice(0, 16)}`,
          appId: process.env['PRIVY_APP_ID'] ?? 'dev-privy-app',
          issuer: PRIVY_ISSUER,
          issuedAt: Math.floor(Date.now() / 1000),
          expiration: Math.floor(Date.now() / 1000) + 3600,
          email: accessToken,
        };
      }
    }

    return null;
  }

  const appId = process.env['PRIVY_APP_ID'];
  const issuer = process.env['PRIVY_ISSUER'] ?? PRIVY_ISSUER;

  const verified = await jwtVerify<PrivyTokenClaims>(accessToken, verifier, {
    issuer,
    algorithms: ['ES256'],
  });

  const payload = verified.payload;
  const tokenAppId = payload.appId ?? String(payload.aud ?? '');

  if (appId && tokenAppId && tokenAppId !== appId) {
    throw new Error('Privy token appId mismatch');
  }

  const userId = payload.sub;
  const sessionId = payload.sid;

  if (!userId || !sessionId) {
    throw new Error('Privy token missing required claims');
  }

  return {
    userId,
    sessionId,
    appId: tokenAppId || appId || '',
    issuer: String(verified.payload.iss ?? issuer),
    issuedAt: verified.payload.iat ?? 0,
    expiration: verified.payload.exp ?? 0,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    walletAddress: typeof payload.walletAddress === 'string' ? payload.walletAddress : undefined,
  };
}
