import { createRemoteJWKSet, importSPKI, jwtVerify } from 'jose';

const DEFAULT_PRIVY_ISSUER = 'privy.io';

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

export async function verifyPrivyAccessToken(
  accessToken: string
): Promise<VerifiedPrivyToken | null> {
  if (!accessToken) {
    console.log('[Privy Auth] No access token provided');
    return null;
  }

  const verifier = await getVerificationKey();
  if (!verifier) {
    console.warn('[Privy Auth] No verification key available (PRIVY_JWKS_URL or PRIVY_PUBLIC_KEY_PEM not set)');
    return null;
  }

  const appId = process.env['PRIVY_APP_ID'];
  const configuredIssuer = process.env['PRIVY_ISSUER'];
  
  // Log JWT structure for debugging
  const jwtParts = accessToken.split('.');
  console.log('[Privy Auth] JWT Structure Check', {
    length: accessToken.length,
    parts: jwtParts.length,
    firstPart: jwtParts[0]?.slice(0, 20) + '...',
    appIdConfigured: !!appId,
    issuerConfigured: !!configuredIssuer,
  });

  let verified;
  try {
    verified = await jwtVerify<PrivyTokenClaims>(accessToken, verifier, {
      algorithms: ['ES256'],
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[Privy Auth] JWT verification failed', {
      error: errorMsg,
      jwtLength: accessToken.length,
      jwtParts: jwtParts.length,
      usingJwks: !!process.env['PRIVY_JWKS_URL'],
      usingPem: !!process.env['PRIVY_PUBLIC_KEY_PEM'],
    });
    throw err; // Re-throw for caller to handle
  }

  const payload = verified.payload;
  const tokenAppId = payload.appId ?? String(payload.aud ?? '');

  if (configuredIssuer) {
    const tokenIssuer = String(payload.iss ?? '');
    if (tokenIssuer && tokenIssuer !== configuredIssuer) {
      throw new Error('Privy token issuer mismatch');
    }
  }

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
      issuer: String(verified.payload.iss ?? configuredIssuer ?? DEFAULT_PRIVY_ISSUER),
    issuedAt: verified.payload.iat ?? 0,
    expiration: verified.payload.exp ?? 0,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    walletAddress: typeof payload.walletAddress === 'string' ? payload.walletAddress : undefined,
  };
}
