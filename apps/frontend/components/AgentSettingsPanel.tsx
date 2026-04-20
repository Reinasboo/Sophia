'use client';

/**
 * Agent Settings Panel Component
 *
 * Inline settings section for the Agent Detail page.
 * Allows editing strategy params, execution settings, and pause/resume.
 */

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Settings,
  Save,
  RotateCcw,
  Pause,
  Play,
  TrendingUp,
  Send,
  Shield,
  CalendarClock,
  Zap,
  Layers,
} from 'lucide-react';
import * as api from '@/lib/api';
import { useStrategies } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import type { Agent, StrategyFieldDescriptor } from '@/lib/types';

const iconMap: Record<string, React.ElementType> = {
  TrendingUp,
  Send,
  Shield,
  CalendarClock,
  Zap,
  Layers,
};

interface AgentSettingsPanelProps {
  agent: Agent;
  onUpdated: () => void;
}

/* ---------- Dynamic field input ---------- */
function ParamInput({
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
        <label className="flex items-center gap-3 cursor-pointer py-1">
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
          <label className="block text-sm font-medium text-slate-50 mb-2">{field.label}</label>
          {field.description && (
            <p className="text-xs text-slate-400 mb-1">{field.description}</p>
          )}
          <input
            type="text"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-3 py-2 transition-all"
          />
        </div>
      );
    case 'string[]':
      return (
        <div>
          <label className="block text-sm font-medium text-slate-50 mb-2">{field.label}</label>
          {field.description && (
            <p className="text-xs text-slate-400 mb-1">{field.description}</p>
          )}
          <input
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
            placeholder="Comma-separated values"
            className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-3 py-2 transition-all"
          />
        </div>
      );
    default:
      return (
        <div>
          <label className="block text-sm font-medium text-slate-50 mb-2">{field.label}</label>
          {field.description && (
            <p className="text-xs text-slate-400 mb-1">{field.description}</p>
          )}
          <input
            type="number"
            value={value !== undefined && value !== '' ? Number(value) : ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-3 py-2 transition-all"
            step="any"
          />
        </div>
      );
  }
}

export function AgentSettingsPanel({ agent, onUpdated }: AgentSettingsPanelProps) {
  const { strategies } = useStrategies();
  const strategyDef = useMemo(
    () => strategies.find((s) => s.name === agent.strategy),
    [strategies, agent.strategy]
  );

  // Local editable state
  const [params, setParams] = useState<Record<string, unknown>>(agent.strategyParams ?? {});
  const [cycleInterval, setCycleInterval] = useState(
    agent.executionSettings?.cycleIntervalMs ?? 30000
  );
  const [maxActions, setMaxActions] = useState(agent.executionSettings?.maxActionsPerDay ?? 100);
  const [enabled, setEnabled] = useState(agent.executionSettings?.enabled ?? true);

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync when agent changes
  useEffect(() => {
    setParams(agent.strategyParams ?? {});
    setCycleInterval(agent.executionSettings?.cycleIntervalMs ?? 30000);
    setMaxActions(agent.executionSettings?.maxActionsPerDay ?? 100);
    setEnabled(agent.executionSettings?.enabled ?? true);
  }, [agent]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    const res = await api.updateAgentConfig(agent.id, {
      strategyParams: params,
      executionSettings: {
        cycleIntervalMs: cycleInterval,
        maxActionsPerDay: maxActions,
        enabled,
      },
    });

    if (res.success) {
      setSuccess(true);
      onUpdated();
      setTimeout(() => setSuccess(false), 2000);
    } else {
      setError(res.error || 'Failed to update agent configuration');
    }

    setSaving(false);
  };

  const handleReset = () => {
    setParams(agent.strategyParams ?? {});
    setCycleInterval(agent.executionSettings?.cycleIntervalMs ?? 30000);
    setMaxActions(agent.executionSettings?.maxActionsPerDay ?? 100);
    setEnabled(agent.executionSettings?.enabled ?? true);
    setError(null);
    setSuccess(false);
  };

  const Icon = iconMap[strategyDef?.icon ?? ''] ?? Settings;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.22, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="bg-gradient-to-br from-slate-800/20 to-slate-900/20 border border-slate-700/50 rounded-lg p-6 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-base font-medium text-slate-50">Agent Configuration</h3>
            {strategyDef && (
              <p className="text-xs text-slate-400">{strategyDef.label} strategy</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={saving}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-slate-50 bg-slate-800/50 hover:bg-slate-700 border border-slate-700/50 hover:border-slate-600 rounded transition-all inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'px-2.5 py-1.5 text-xs font-medium bg-cyan-500/10 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 hover:text-cyan-200 rounded transition-all hover:bg-cyan-500/20 inline-flex items-center gap-1.5',
              success && 'bg-green-500/10 border-green-500/30 text-green-300'
            )}
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
            ) : success ? (
              <span className="text-green-300">Saved!</span>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                Save
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Strategy Parameters */}
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-3">Strategy Parameters</h4>
          {strategyDef && strategyDef.fields.length > 0 ? (
            <div className="space-y-3">
              {strategyDef.fields.map((field: any) => (
                <ParamInput
                  key={field.key}
                  field={field}
                  value={params[field.key]}
                  onChange={(v) => setParams((prev) => ({ ...prev, [field.key]: v }))}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-4">
              No configurable parameters for this strategy.
            </p>
          )}
        </div>

        {/* Execution Settings */}
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-3">Execution Settings</h4>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4 rounded border border-slate-600 text-cyan-500 focus:ring-cyan-500 accent-cyan-500"
              />
              <div>
                <span className="text-sm font-medium text-slate-50 flex items-center gap-2">
                  {enabled ? (
                    <>
                      <Play className="w-3.5 h-3.5 text-green-400" /> Enabled
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5 text-yellow-400" /> Paused
                    </>
                  )}
                </span>
                <p className="text-xs text-slate-400">
                  {enabled
                    ? 'Agent will execute on schedule.'
                    : 'Agent is paused and will not execute.'}
                </p>
              </div>
            </label>

            <div>
              <label className="block text-sm font-medium text-slate-50 mb-2">Cycle Interval (ms)</label>
              <input
                type="number"
                value={cycleInterval}
                onChange={(e) => setCycleInterval(Number(e.target.value) || 0)}
                className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-3 py-2 transition-all"
                min={5000}
                step={1000}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-50 mb-2">Max Actions Per Day</label>
              <input
                type="number"
                value={maxActions}
                onChange={(e) => setMaxActions(Number(e.target.value) || 0)}
                className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-3 py-2 transition-all"
                min={1}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 bg-status-error/10 border border-status-error/20 rounded-lg">
          <p className="text-sm text-status-error">{error}</p>
        </div>
      )}
    </motion.div>
  );
}
