# BYOA Integration Guide

**Bring Your Own Agent (BYOA)** enables external agents to control Sophia wallets through our Intent API.

## Quick Start (5 minutes)

### 1. Register Your Agent

```bash
curl -X POST http://localhost:3001/api/byoa/register \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: your-admin-key" \
  -d '{
    "name": "My Autonomous Bot",
    "endpoint": "https://your-agent.com/webhook"
  }'
```

**Response:**
```json
{
  "agentId": "agent-abc123",
  "controlToken": "token_xyz789",
  "walletPublicKey": "8WxCw9ULRkr4QHLtvyeHR7Q6yDwEF8qM8S5JpHJX7xRs",
  "note": "Store controlToken securely. Use it to authenticate all intent submissions."
}
```

### 2. Submit Your First Intent

Use the `controlToken` from registration to submit intents:

```bash
curl -X POST http://localhost:3001/api/byoa/intents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token_xyz789" \
  -d '{
    "type": "REQUEST_AIRDROP",
    "payload": {
      "amount": 0.5
    }
  }'
```

**Response:**
```json
{
  "intentId": "intent-123",
  "agentId": "agent-abc123",
  "type": "REQUEST_AIRDROP",
  "status": "pending",
  "result": {
    "signature": "abc123...",
    "amount": 0.5
  }
}
```

## Intent Types

### 1. REQUEST_AIRDROP (Devnet only)

Request SOL tokens on devnet for testing.

```json
{
  "type": "REQUEST_AIRDROP",
  "payload": {
    "amount": 1.5,
    "description": "Optional: reason for airdrop"
  }
}
```

### 2. TRANSFER_SOL

Transfer SOL to a recipient address.

```json
{
  "type": "TRANSFER_SOL",
  "payload": {
    "recipient": "8WxCw9ULRkr4QHLtvyeHR7Q6yDwEF8qM8S5JpHJX7xRs",
    "amount": 0.5,
    "memo": "Payment for services",
    "allowMultisig": false
  }
}
```

**Response:**
```json
{
  "intentId": "intent-456",
  "status": "confirmed",
  "result": {
    "signature": "abc123...",
    "gasSpent": 0.000005
  }
}
```

### 3. TRANSFER_TOKEN

Transfer SPL tokens.

```json
{
  "type": "TRANSFER_TOKEN",
  "payload": {
    "mint": "EPjFWaLb3hyccqj1D8circQoxQT6NvxjRoKoZnstEwqt",
    "amount": "1000",
    "recipient": "8WxCw9ULRkr4QHLtvyeHR7Q6yDwEF8qM8S5JpHJX7xRs",
    "decimals": 6
  }
}
```

### 4. CHECK_BALANCE

Query wallet balances (no transaction).

```json
{
  "type": "CHECK_BALANCE",
  "payload": {
    "includeTokens": true
  }
}
```

**Response:**
```json
{
  "intentId": "intent-789",
  "status": "confirmed",
  "result": {
    "balance": {
      "sol": 5.25,
      "lamports": "5250000000"
    },
    "tokens": [
      {
        "mint": "EPjFWaLb3hyccqj1D8circQoxQT6NvxjRoKoZnstEwqt",
        "amount": "1000",
        "decimals": 6,
        "uiAmount": 0.001
      }
    ]
  }
}
```

### 5. AUTONOMOUS

Define custom autonomous behavior.

```json
{
  "type": "AUTONOMOUS",
  "payload": {
    "strategy": "distribute-dust",
    "recipients": [
      "8WxCw9ULRkr4QHLtvyeHR7Q6yDwEF8qM8S5JpHJX7xRs",
      "9WxCw9ULRkr4QHLtvyeHR7Q6yDwEF8qM8S5JpHJX7xRt"
    ],
    "minAmount": 0.01
  }
}
```

## Response Codes & Error Handling

### Success Responses

| Status | Meaning |
|--------|---------|
| 200 | Intent accepted and processed |
| 202 | Intent queued (will process asynchronously) |

### Error Responses

| Status | Error Code | Meaning |
|--------|-----------|---------|
| 400 | VALIDATION_FAILED | Invalid payload or missing required fields |
| 401 | UNAUTHORIZED | Invalid or missing authentication token |
| 402 | INSUFFICIENT_BALANCE | Wallet doesn't have enough SOL/tokens |
| 403 | POLICY_VIOLATION | Intent violates safety policies (budget, allowlist, etc.) |
| 404 | AGENT_NOT_FOUND | Agent ID not registered |
| 429 | RATE_LIMITED | Too many requests, try again later |
| 500 | INTERNAL_ERROR | Server error (transient, safe to retry) |

### Example Error Response

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Wallet has 0.1 SOL but transfer requires 0.5 SOL",
    "details": {
      "available": 0.1,
      "required": 0.5,
      "shortfall": 0.4
    }
  }
}
```

## Code Examples

### Python Agent

```python
import requests
import json
import time

class SophiaAgent:
    def __init__(self, control_token, endpoint="http://localhost:3001"):
        self.token = control_token
        self.endpoint = endpoint
        self.headers = {
            "Authorization": f"Bearer {control_token}",
            "Content-Type": "application/json"
        }
    
    def submit_intent(self, intent_type: str, payload: dict, timeout_sec: int = 30):
        """Submit an intent and wait for confirmation (polling)"""
        
        # Submit intent
        response = requests.post(
            f"{self.endpoint}/api/byoa/intents",
            headers=self.headers,
            json={
                "type": intent_type,
                "payload": payload
            },
            timeout=10
        )
        
        if response.status_code not in [200, 202]:
            error = response.json()
            raise Exception(f"Intent submission failed: {error['error']['message']}")
        
        intent_data = response.json()
        intent_id = intent_data.get("intentId")
        
        # Poll for confirmation (optional)
        start_time = time.time()
        while time.time() - start_time < timeout_sec:
            status_response = requests.get(
                f"{self.endpoint}/api/byoa/intents/{intent_id}",
                headers=self.headers,
                timeout=5
            )
            
            if status_response.status_code == 200:
                intent = status_response.json()
                if intent["status"] in ["confirmed", "failed"]:
                    return intent
            
            time.sleep(2)  # Poll every 2 seconds
        
        return {"intentId": intent_id, "status": "pending"}
    
    def check_balance(self):
        """Check wallet balance"""
        return self.submit_intent("CHECK_BALANCE", {})
    
    def transfer_sol(self, recipient: str, amount: float):
        """Transfer SOL to recipient"""
        return self.submit_intent("TRANSFER_SOL", {
            "recipient": recipient,
            "amount": amount
        })

# Usage
if __name__ == "__main__":
    agent = SophiaAgent("token_xyz789")
    
    # Check balance
    balance = agent.check_balance()
    print(f"Current balance: {balance['result']['balance']['sol']} SOL")
    
    # Transfer SOL
    result = agent.transfer_sol("8WxCw9ULRkr4QHLtvyeHR7Q6yDwEF8qM8S5JpHJX7xRs", 0.1)
    print(f"Transfer signature: {result['result']['signature']}")
```

### Node.js Agent

```typescript
import axios from 'axios';

interface SophiaIntentResponse {
  intentId: string;
  agentId: string;
  type: string;
  status: 'pending' | 'confirmed' | 'failed';
  result?: any;
  error?: any;
}

class SophiaAgent {
  private controlToken: string;
  private endpoint: string;

  constructor(controlToken: string, endpoint: string = 'http://localhost:3001') {
    this.controlToken = controlToken;
    this.endpoint = endpoint;
  }

  private get headers() {
    return {
      'Authorization': `Bearer ${this.controlToken}`,
      'Content-Type': 'application/json',
    };
  }

  async submitIntent(type: string, payload: any): Promise<SophiaIntentResponse> {
    try {
      const response = await axios.post(
        `${this.endpoint}/api/byoa/intents`,
        { type, payload },
        { headers: this.get Headers }
      );

      return response.data;
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      throw new Error(`Intent submission failed: ${errorMsg}`);
    }
  }

  async transferSol(recipient: string, amount: number): Promise<string> {
    const result = await this.submitIntent('TRANSFER_SOL', {
      recipient,
      amount,
    });

    if (result.status === 'failed') {
      throw new Error(`Transfer failed: ${result.error?.message}`);
    }

    return result.result.signature;
  }

  async checkBalance() {
    return this.submitIntent('CHECK_BALANCE', {});
  }
}

// Usage
async function main() {
  const agent = new SophiaAgent('token_xyz789');

  // Check balance
  const balance = await agent.checkBalance();
  console.log(`Balance: ${balance.result.balance.sol} SOL`);

  // Transfer SOL
  const signature = await agent.transferSol(
    '8WxCw9ULRkr4QHLtvyeHR7Q6yDwEF8qM8S5JpHJX7xRs',
    0.1
  );
  console.log(`Transfer: ${signature}`);
}

main().catch(console.error);
```

## Security Best Practices

### 1. Store Tokens Securely

```python
import os
from dotenv import load_dotenv

load_dotenv()
CONTROL_TOKEN = os.getenv('SOPHIA_CONTROL_TOKEN')  # Load from .env
```

### 2. Implement Retry Logic

```python
import time
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

def create_session():
    session = requests.Session()
    
    retries = Retry(
        total=3,
        backoff_factor=1,  # 1s, 2s, 4s
        status_forcelist=[429, 500, 502, 503, 504]
    )
    
    adapter = HTTPAdapter(max_retries=retries)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    
    return session
```

### 3. Validate Responses

```python
def validate_intent_response(response):
    """Ensure response is valid before acting on it"""
    
    required_fields = ['intentId', 'agentId', 'type', 'status']
    for field in required_fields:
        if field not in response:
            raise ValueError(f"Missing required field: {field}")
    
    if response['status'] not in ['pending', 'confirmed', 'failed']:
        raise ValueError(f"Invalid status: {response['status']}")
    
    return response
```

## Rate Limits

- **Per-wallet**: 30 transactions/minute
- **Global RPC**: 1200 calls/minute
- **Retry-After**: Provided in response headers when rate limited

## Monitoring

Check your agent's metrics:

```bash
curl http://localhost:3001/api/byoa/agents/agent-abc123 \
  -H "X-Admin-Key: your-admin-key"
```

Response:
```json
{
  "agentId": "agent-abc123",
  "name": "My Autonomous Bot",
  "status": "active",
  "stats": {
    "totalIntents": 145,
    "successRate": 0.979,
    "avgResponseTime": 350,
    "lastActivityAt": "2026-04-20T10:30:00Z"
  }
}
```

## Troubleshooting

### "UNAUTHORIZED" Error

- Check token is included in `Authorization: Bearer token` header
- Verify token hasn't expired (rotate every 30 days recommended)
- Ensure token matches your agent's control token

### "INSUFFICIENT_BALANCE" Error

- Check balance: `curl http://localhost:3001/api/wallets/{address}/balance`
- Request airdrop (devnet): `REQUEST_AIRDROP` intent
- Check pending transactions: they reserve balance until confirmed

### "RATE_LIMITED" Error

- Wait for the time specified in `Retry-After` header
- Batch intents if possible (combine multiple transfers)
- Use exponential backoff in retries

### "POLICY_VIOLATION" Error

- Check recipient is on allowlist (if configured)
- Verify amount doesn't exceed daily budget
- Ensure sufficient cooldown time between transfers

## Support

- **GitHub Issues**: https://github.com/Reinasboo/Sophia/issues
- **Discord**: [Join our community](https://discord.gg/sophia)
- **Email**: support@sophia.dev

---

**Last Updated**: April 20, 2026  
**API Version**: 1.0.0  
**Status**: Production Ready
