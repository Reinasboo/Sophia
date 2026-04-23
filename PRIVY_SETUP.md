# Privy Integration Setup Guide

## Overview

Privy provides enterprise-grade wallet infrastructure with hardware-isolated key management. Sophia integrates Privy for:

- **User Signup/Signin**: Email, SMS, Social, Passkey, Wallet
- **Embedded Wallets**: Solana wallets with SOC 2 Type II compliance
- **Key Management**: Hardware isolation + key sharding (no custom WalletManager burden)
- **Multi-Tenant**: Each user gets isolated account and wallet via Privy

## Step 1: Create Privy Project

1. Go to [https://dashboard.privy.io](https://dashboard.privy.io)
2. Sign up and create a new app
3. Save your **App ID** and **Secret Key**

## Step 2: Install Dependencies

### Frontend (React SDK)

```bash
cd apps/frontend
npm install @privy-io/react-auth
```

### Backend (Server SDK)

```bash
npm install @privy-io/server-auth
```

## Step 3: Environment Variables

Create `.env.local` in project root:

```bash
# Privy Configuration
PRIVY_APP_ID=your_app_id_here
PRIVY_SECRET_KEY=your_secret_key_here

# Frontend (Next.js)
NEXT_PUBLIC_PRIVY_APP_ID=your_app_id_here
```

Also add to `.env` for backend:

```bash
PRIVY_APP_ID=your_app_id_here
PRIVY_SECRET_KEY=your_secret_key_here
```

## Step 4: Update `_app.tsx` with Privy Provider

```typescript
import { PrivyProvider } from '@/lib/privy-provider';

function MyApp({ Component, pageProps }) {
  return (
    <PrivyProvider>
      <Component {...pageProps} />
    </PrivyProvider>
  );
}

export default MyApp;
```

## Step 5: Create Signin Page

Create `pages/signin.tsx`:

```typescript
import { PrivySignin } from '@/components/PrivySignin';

export default function SigninPage() {
  return <PrivySignin redirectPath="/dashboard" />;
}
```

## Step 6: Protect Dashboard Routes

Update `pages/dashboard.tsx`:

```typescript
import { useTenantSession } from '@/lib/privy-provider';
import { useRouter } from 'next/router';

export default function Dashboard() {
  const router = useRouter();
  const { tenantSession, loading } = useTenantSession();

  if (loading) return <div>Loading...</div>;
  if (!tenantSession) {
    router.push('/signin');
    return null;
  }

  // Now you have:
  // - tenantSession.tenantId (Sophia tenant ID)
  // - tenantSession.apiKey (for API calls)

  return (
    <div>
      <h1>Welcome, {tenantSession.tenantId}</h1>
      {/* Your dashboard content */}
    </div>
  );
}
```

## Step 7: Make Authenticated API Calls

Use `tenantSession.apiKey` as Bearer token:

```typescript
const { tenantSession } = useTenantSession();

async function createAgent() {
  const response = await fetch('/api/tenants/agents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tenantSession.apiKey}`,
    },
    body: JSON.stringify({
      name: 'My Agent',
      strategy: 'accumulator',
      strategyParams: {
        /* ... */
      },
    }),
  });
  return response.json();
}
```

## Step 8: Test Signin Flow

1. Start dev server: `npm run dev`
2. Visit `http://localhost:3000/signin`
3. Click "Sign in with Privy"
4. Try email, SMS, or passkey signup
5. Should redirect to dashboard with session active

## Backend Integration

### Verify Privy Token

```typescript
import { verifyPrivyToken } from '@/src/integration/privy-integration';

// In API route handler:
const privyUserInfo = await verifyPrivyToken(accessToken);
if (!privyUserInfo) {
  return res.status(401).json({ error: 'Invalid token' });
}
```

### Get or Create Tenant

```typescript
import { getOrCreateTenantForPrivyUser } from '@/src/integration/privy-integration';

const { tenantId, apiKey } = await getOrCreateTenantForPrivyUser(privyUserInfo);
// tenantId and apiKey are now mapped in TenantDatabase
```

## Architecture: How It Works

```
User Signs In (Email/SMS/Social/Passkey)
    ↓
[Privy Client SDK]  (React)
    ↓
Privy Issues Access Token
    ↓
[POST /api/auth/privy-callback]  (Next.js backend)
    ↓
Backend Verifies Token with Privy Servers
    ↓
[TenantDatabase]
Creates/Gets Sophia Tenant (maps to Privy user)
Issues Sophia API Key
    ↓
Frontend Stores API Key in localStorage
    ↓
All Subsequent API Calls
Use `Authorization: Bearer <api_key>`
    ↓
[Auth Middleware] Validates tenant + isolation
    ↓
[Multi-Tenant Orchestrator]
Routes to user's isolated agents, wallets, strategies
```

## Security Notes

1. **API Keys**: Stored in localStorage (browser) — consider adding refresh token rotation
2. **Privy Wallets**: Hardware-isolated (don't store secrets locally)
3. **CORS**: Configure `next.config.js` to allow Privy SDK origins
4. **HTTPS**: Required in production (Privy redirects to https)

## Production Checklist

- [ ] Add `PRIVY_APP_ID` and `PRIVY_SECRET_KEY` to production `.env`
- [ ] Enable HTTPS (Privy requires it)
- [ ] Configure redirect URIs in Privy dashboard
- [ ] Set up refresh token rotation for API keys
- [ ] Add rate limiting to `/api/auth/privy-callback`
- [ ] Monitor Privy webhook events (optional)
- [ ] Test with Privy's testnet mode first

## Privy SDK Documentation

- Main: https://docs.privy.io/
- React SDK: https://docs.privy.io/basics/react/setup
- Server SDK: https://docs.privy.io/basics/nodeJS/setup
- API Reference: https://docs.privy.io/basics/rest-api/overview

## Support

- Privy Docs: https://docs.privy.io/
- Privy Support: https://privy.io/slack
- Sophia Issues: GitHub issue tracker

## Next Steps

After Privy setup is complete:

1. ✅ Users can sign up via email/SMS/social
2. ✅ Privy issues embedded Solana wallet
3. ✅ Sophia tenant created and API key issued
4. ✅ Users can create agents with strategies
5. ⚠️ TODO: Replace custom WalletManager with Privy signing (phase 2)
6. ⚠️ TODO: Add Privy policies for agent authorization (phase 3)
