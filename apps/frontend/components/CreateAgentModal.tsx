'use client';

/**
 * Create Agent Modal Component — Multi-Step Flow
 *
 * Step 1: Agent name
 * Step 2: Strategy selection (from registry)
 * Step 3: Strategy-specific parameter configuration (dynamic form)
 * Step 4: Execution settings
 * Step 5: Review & create
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Bot,
  TrendingUp,
  Send,
  Shield,
  CalendarClock,
  Zap,
  Layers,
  ChevronRight,
  ChevronLeft,
  Check,
} from 'lucide-react';
import * as api from '@/lib/api';
import { useStrategies } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import type { StrategyDefinition, StrategyFieldDescriptor } from '@/lib/types';

interface CreateAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const TOTAL_STEPS = 5;

const iconMap: Record<string, React.ElementType> = {
  TrendingUp,
  Send,
  Shield,
  CalendarClock,
  Zap,
  Layers,
};

const riskTierMeta: Record<StrategyDefinition['riskTier'], { label: string; className: string }> = {
  degen: { label: 'Degen', className: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  high: { label: 'High Risk', className: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  medium: { label: 'Medium Risk', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  low: { label: 'Low Risk', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
};

/* ---------- Step indicator ---------- */
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all duration-300',
            i + 1 === current
              ? 'w-6 bg-cyan-500'
              : i + 1 < current
                ? 'w-1.5 bg-cyan-400'
                : 'w-1.5 bg-slate-600'
          )}
        />
      ))}
    </div>
  );
}

/* ---------- Dynamic field renderer ---------- */
function FieldInput({
  field,
  value,
  onChange,
}: {
  field: StrategyFieldDescriptor;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (field.type) {
    case 'boolean':
      return (
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 rounded border border-slate-600 text-cyan-500 focus:ring-cyan-500 accent-cyan-500"
          />
          <div>
            <span className="text-sm font-medium text-slate-50">{field.label}</span>
            {field.description && <p className="text-xs text-slate-400">{field.description}</p>}
          </div>
        </label>
      );
    case 'string':
      return (
        <div>
          <label
            htmlFor={`field-${field.key}`}
            className="block text-sm font-medium text-slate-50 mb-2"
          >
            {field.label}
          </label>
          {field.description && (
            <p id={`field-${field.key}-desc`} className="text-xs text-slate-400 mb-1">
              {field.description}
            </p>
          )}
          <input
            id={`field-${field.key}`}
            type="text"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.default !== undefined ? String(field.default) : ''}
            aria-describedby={field.description ? `field-${field.key}-desc` : undefined}
            className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-3 py-2 transition-all"
          />
        </div>
      );
    case 'string[]':
      return (
        <div>
          <label
            htmlFor={`field-${field.key}`}
            className="block text-sm font-medium text-slate-50 mb-2"
          >
            {field.label}
          </label>
          {field.description && (
            <p id={`field-${field.key}-desc`} className="text-xs text-slate-400 mb-1">
              {field.description}
            </p>
          )}
          <input
            id={`field-${field.key}`}
            type="text"
            value={Array.isArray(value) ? (value as string[]).join(', ') : String(value ?? '')}
            onChange={(e) =>
              onChange(
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
            aria-describedby={field.description ? `field-${field.key}-desc` : undefined}
            placeholder="Comma-separated values"
            className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-3 py-2 transition-all"
          />
        </div>
      );
    default:
      // number (default)
      return (
        <div>
          <label
            htmlFor={`field-${field.key}`}
            className="block text-sm font-medium text-slate-50 mb-2"
          >
            {field.label}
          </label>
          {field.description && (
            <p id={`field-${field.key}-desc`} className="text-xs text-slate-400 mb-1">
              {field.description}
            </p>
          )}
          <input
            id={`field-${field.key}`}
            type="number"
            value={value !== undefined && value !== '' ? Number(value) : ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            placeholder={field.default !== undefined ? String(field.default) : ''}
            aria-describedby={field.description ? `field-${field.key}-desc` : undefined}
            className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-3 py-2 transition-all"
            step="any"
          />
        </div>
      );
  }
}

/* ---------- Main modal ---------- */
export function CreateAgentModal({ isOpen, onClose, onCreated }: CreateAgentModalProps) {
  const { strategies, loading: strategiesLoading } = useStrategies();

  // Form state
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('');
  const [strategyParams, setStrategyParams] = useState<Record<string, unknown>>({});
  const [execEnabled, setExecEnabled] = useState(true);
  const [cycleInterval, setCycleInterval] = useState(30000);
  const [maxActions, setMaxActions] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived
  const currentStrategyDef = useMemo(
    () => strategies.find((s) => s.name === selectedStrategy),
    [strategies, selectedStrategy]
  );

  const recommendedStarter = useMemo(
    () => strategies.find((s) => s.riskTier === 'low') ?? strategies[0],
    [strategies]
  );

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setName('');
      setSelectedStrategy('');
      setStrategyParams({});
      setExecEnabled(true);
      setCycleInterval(30000);
      setMaxActions(100);
      setError(null);
    }
  }, [isOpen]);

  // When strategy changes, seed default params
  useEffect(() => {
    if (!currentStrategyDef) return;
    const defaults: Record<string, unknown> = {};
    for (const f of currentStrategyDef.fields) {
      if (f.default !== undefined) defaults[f.key] = f.default;
    }
    setStrategyParams(defaults);
  }, [currentStrategyDef]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const canAdvance = useCallback((): boolean => {
    switch (step) {
      case 1:
        return name.trim().length > 0;
      case 2:
        return selectedStrategy.length > 0;
      case 3:
        return true; // params have defaults
      case 4:
        return cycleInterval > 0 && maxActions > 0;
      case 5:
        return true;
      default:
        return false;
    }
  }, [step, name, selectedStrategy, cycleInterval, maxActions]);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);

    const response = await api.createAgent({
      name: name.trim(),
      strategy: selectedStrategy,
      strategyParams,
      executionSettings: {
        enabled: execEnabled,
        cycleIntervalMs: cycleInterval,
        maxActionsPerDay: maxActions,
      },
    });

    if (response.success && response.data) {
      if (execEnabled) {
        await api.startAgent(response.data.id);
      }
      onCreated?.();
      onClose();
    } else {
      setError(response.error || 'Failed to create agent');
    }

    setLoading(false);
  };

  const next = () => {
    if (step === TOTAL_STEPS) {
      handleCreate();
    } else {
      setError(null);
      setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    }
  };
  const back = () => setStep((s) => Math.max(s - 1, 1));

  const stepTitles = ['Name', 'Strategy', 'Parameters', 'Execution', 'Review'];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-[3vh] -translate-x-1/2 z-50 w-full max-w-lg px-4"
          >
            <div className="bg-gradient-card border border-slate-700/50 rounded-2xl shadow-2xl flex flex-col max-h-[94vh] backdrop-blur-md" style={{background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 217, 255, 0.04) 100%)'}}>              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700/50 shrink-0">
                <div>
                  <h2 className="text-lg font-semibold text-slate-50">
                    Create Agent &mdash; {stepTitles[step - 1]}
                  </h2>
                  <div className="mt-2">
                    <StepIndicator current={step} total={TOTAL_STEPS} />
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close agent creation dialog"
                  className="p-2 -mr-2 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400 hover:text-slate-300" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 min-h-0 flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                  {/* Step 1 — Name */}
                  {step === 1 && (
                    <motion.div
                      key="step-1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      <label
                        htmlFor="agent-name"
                        className="block text-sm font-medium text-slate-50 mb-2"
                      >
                        Agent Name
                      </label>
                      <input
                        id="agent-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && canAdvance() && next()}
                        placeholder="e.g., Treasury Manager"
                        aria-describedby="agent-name-help"
                        className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-3 py-2 transition-all"
                        autoFocus
                      />
                      <p id="agent-name-help" className="text-xs text-slate-400 mt-2">
                        Choose a memorable name for your agent. You can change it later.
                      </p>
                    </motion.div>
                  )}

                  {/* Step 2 — Strategy */}
                  {step === 2 && (
                    <motion.div
                      key="step-2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      {recommendedStarter && (
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-slate-300">
                          Suggested starter:{' '}
                          <span className="font-semibold text-emerald-300">
                            {recommendedStarter.label}
                          </span>{' '}
                          if you want a lower-risk default. This is only a hint, not a selection.
                        </div>
                      )}
                      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-slate-300">
                        Pick the strategy you want. Auto-pick can be added later as a helper, but it
                        will not override your choice.
                      </div>
                      {strategiesLoading ? (
                        <p className="text-slate-400 text-center py-8">Loading strategies…</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {strategies.map((s) => {
                            const Icon = iconMap[s.icon ?? ''] ?? Zap;
                            const isSelected = selectedStrategy === s.name;
                            return (
                              <button
                                key={s.name}
                                onClick={() => setSelectedStrategy(s.name)}
                                onDoubleClick={() => {
                                  setSelectedStrategy(s.name);
                                  next();
                                }}
                                className={cn(
                                  'p-4 rounded-xl border-2 transition-all duration-200 text-left',
                                  isSelected
                                    ? 'border-cyan-500/50 bg-cyan-500/10'
                                    : 'border-slate-700/50 hover:border-slate-600 bg-slate-800/30'
                                )}
                              >
                                <div
                                  className={cn(
                                    'w-8 h-8 rounded-lg flex items-center justify-center mb-3',
                                    isSelected ? 'bg-cyan-500/20' : 'bg-slate-700/30'
                                  )}
                                >
                                  <Icon
                                    className={cn(
                                      'w-4 h-4',
                                      isSelected ? 'text-cyan-400' : 'text-slate-500'
                                    )}
                                  />
                                </div>
                                <h3
                                  className={cn(
                                    'text-sm font-medium mb-0.5',
                                    isSelected ? 'text-cyan-300' : 'text-slate-50'
                                  )}
                                >
                                  {s.label}
                                </h3>
                                <p className="text-xs text-slate-400 line-clamp-2">
                                  {s.description}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                                  <span
                                    className={cn(
                                      'rounded-full border px-2 py-0.5 font-semibold uppercase tracking-wide',
                                      riskTierMeta[s.riskTier]?.className ??
                                        'bg-slate-500/15 text-slate-300 border-slate-500/30'
                                    )}
                                  >
                                    {riskTierMeta[s.riskTier]?.label ?? s.riskTier}
                                  </span>
                                  <span className="rounded-full border border-slate-600/40 bg-slate-700/20 px-2 py-0.5 font-semibold uppercase tracking-wide text-slate-300">
                                    {s.riskLevel}
                                  </span>
                                </div>
                                {s.gmgnSkills?.length ? (
                                  <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                                    {s.gmgnSkills.map((skill) => (
                                      <span
                                        key={skill}
                                        className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 font-semibold uppercase tracking-wide text-cyan-200"
                                      >
                                        {skill}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Step 3 — Strategy parameters */}
                  {step === 3 && (
                    <motion.div
                      key="step-3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      {currentStrategyDef && currentStrategyDef.fields.length > 0 ? (
                        currentStrategyDef.fields.map((field: any) => (
                          <FieldInput
                            key={field.key}
                            field={field}
                            value={strategyParams[field.key]}
                            onChange={(v) =>
                              setStrategyParams((prev) => ({ ...prev, [field.key]: v }))
                            }
                          />
                        ))
                      ) : (
                        <p className="text-slate-400 text-center py-8">
                          This strategy has no configurable parameters.
                        </p>
                      )}
                    </motion.div>
                  )}

                  {/* Step 4 — Execution settings */}
                  {step === 4 && (
                    <motion.div
                      key="step-4"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-5"
                    >
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={execEnabled}
                          onChange={(e) => setExecEnabled(e.target.checked)}
                          className="w-4 h-4 rounded border border-slate-600 text-cyan-500 focus:ring-cyan-500 accent-cyan-500"
                        />
                        <div>
                          <span className="text-sm font-medium text-slate-50">
                            Start agent immediately
                          </span>
                          <p className="text-xs text-slate-400">
                            If unchecked the agent is created in a paused state.
                          </p>
                        </div>
                      </label>

                      <div>
                        <label className="block text-sm font-medium text-slate-50 mb-2">
                          Cycle Interval (ms)
                        </label>
                        <input
                          type="number"
                          value={cycleInterval}
                          onChange={(e) => setCycleInterval(Number(e.target.value) || 0)}
                          className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-3 py-2 transition-all"
                          min={1000}
                          step={1000}
                        />
                        <p className="text-xs text-slate-400 mt-1">
                          How often the agent executes its strategy cycle.
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-50 mb-2">
                          Max Actions Per Day
                        </label>
                        <input
                          type="number"
                          value={maxActions}
                          onChange={(e) => setMaxActions(Number(e.target.value) || 0)}
                          className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-3 py-2 transition-all"
                          min={1}
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Step 5 — Review */}
                  {step === 5 && (
                    <motion.div
                      key="step-5"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 space-y-3">
                        <Row label="Name" value={name} />
                        <Row
                          label="Strategy"
                          value={currentStrategyDef?.label ?? selectedStrategy}
                        />
                        {currentStrategyDef?.gmgnSkills?.length ? (
                          <div className="space-y-2">
                            <span className="text-xs text-slate-400">GMGN Skills</span>
                            <div className="flex flex-wrap gap-1.5">
                              {currentStrategyDef.gmgnSkills.map((skill) => (
                                <span
                                  key={skill}
                                  className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200"
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <Row label="Auto-start" value={execEnabled ? 'Yes' : 'No'} />
                        <Row label="Cycle" value={`${cycleInterval.toLocaleString()} ms`} />
                        <Row label="Max actions/day" value={String(maxActions)} />
                        {currentStrategyDef && currentStrategyDef.fields.length > 0 && (
                          <>
                            <div className="border-t border-slate-700/50 pt-2">
                              <span className="text-xs text-slate-400">Parameters</span>
                            </div>
                            {currentStrategyDef.fields.map((f: any) => (
                              <Row
                                key={f.key}
                                label={f.label}
                                value={
                                  strategyParams[f.key] !== undefined
                                    ? JSON.stringify(strategyParams[f.key])
                                    : '—'
                                }
                              />
                            ))}
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Error */}
                {error && (
                  <div className="mt-4 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                )}
              </div>

              {/* Actions — always pinned at bottom */}
              <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-700/50 bg-slate-800/20 rounded-b-2xl shrink-0">
                {step > 1 ? (
                  <button
                    onClick={back}
                    className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-50 bg-slate-800/50 hover:bg-slate-700 border border-slate-700/50 hover:border-slate-600 rounded-lg transition-all inline-flex items-center gap-2 disabled:opacity-50"
                    disabled={loading}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>
                ) : (
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-50 bg-slate-800/50 hover:bg-slate-700 border border-slate-700/50 hover:border-slate-600 rounded-lg transition-all disabled:opacity-50"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                )}

                <div className="flex-1" />

                <button
                  onClick={next}
                  className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 rounded-lg transition-all inline-flex items-center gap-2 hover:bg-cyan-500/30 disabled:opacity-50"
                  disabled={!canAdvance() || loading}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                  ) : step === TOTAL_STEPS ? (
                    <>
                      <Bot className="w-4 h-4" />
                      Create Agent
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ---------- tiny review row ---------- */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm text-slate-50 font-medium">{value}</span>
    </div>
  );
}
