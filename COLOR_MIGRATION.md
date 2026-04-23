# Color Migration - Old Theme to Brand

## Global Replacements Needed

### Background Colors

- `bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950` → `bg-black`
- `bg-slate-900` → `bg-black`
- `bg-slate-950` → `bg-black`
- `bg-gradient-to-br from-slate-800/20 to-slate-900/20` → `bg-surface-elevated/50`
- `bg-slate-800/50` → `bg-surface-elevated/50`
- `bg-slate-800/20` → `bg-black`

### Border Colors

- `border-slate-700/50` → `border-primary/20`
- `border-slate-700` → `border-primary/30`
- `border-slate-600` → `border-primary/40`
- `hover:border-cyan-500/40` → `hover:border-secondary/50`

### Text Colors

- `text-slate-50` → `text-white`
- `text-slate-400` → `text-text-secondary`
- `text-slate-500` → `text-text-muted`
- `text-slate-300` → `text-text-secondary`

### Accent Colors

- `text-cyan-300` → `text-secondary`
- `text-cyan-400` → `text-secondary`
- `text-cyan-500` → `text-secondary`
- `bg-cyan-500/10` → `bg-secondary/10`
- `border-cyan-500/30` → `border-secondary/30`
- `bg-cyan-500/20` → `bg-secondary/20`
- `bg-blue-500/20` → `bg-primary/20`
- `text-blue-400` → `text-primary`
- `text-blue-600` → `text-primary`

### Status Colors (Keep but adjust)

- `text-yellow-400` → `text-status-warning`
- `text-red-400` → `text-status-error`
- `text-green-400` → `text-status-success`

## Pages to Update

1. ✅ Sidebar.tsx - DONE
2. ✅ Header.tsx - DONE
3. ❌ pages/dashboard.tsx
4. ❌ pages/transactions.tsx
5. ❌ pages/agents/index.tsx
6. ❌ pages/agents/[id].tsx
7. ❌ pages/connected-agents/index.tsx
8. ❌ pages/connected-agents/[id].tsx
9. ❌ pages/byoa-register.tsx
10. ❌ pages/strategies.tsx
11. ❌ pages/intent-history.tsx

## Components to Update

- ❌ TransactionList.tsx
- ❌ AgentCard.tsx
- ❌ AgentList.tsx
- ❌ ActivityFeed.tsx
- ❌ StatsCards.tsx
- ❌ IntentHistory.tsx
