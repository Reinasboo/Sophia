'use client';

import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import {
  Shield,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Clock,
  Zap,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';
import { PageLayout } from '@/components';
import * as api from '@/lib/api';
import { cn } from '@/lib/utils';

type Step = 'type' | 'info' | 'intents' | 'verification' | 'security' | 'verify' | 'confirm';
type AgentType = 'local' | 'remote';
type VerificationMethod = 'none' | 'challenge-response' | 'hmac-signature';

interface FormData {
  agentType: AgentType;
  agentName: string;
  agentId: string;
  agentSecret: string;
  webhookUrl: string;
  signingKey: string;
  supportedIntents: SupportedIntentType[];
  verificationMethods: VerificationMethod[];
}

type SupportedIntentType =
  | 'REQUEST_AIRDROP'
  | 'TRANSFER_SOL'
  | 'TRANSFER_TOKEN'
  | 'QUERY_BALANCE'
  | 'AUTONOMOUS';

const AVAILABLE_INTENTS: { value: SupportedIntentType; label: string; description: string }[] = [
  {
    value: 'REQUEST_AIRDROP',
    label: 'Request Airdrop',
    description: 'Allow agent to request airdrops',
  },
  {
    value: 'TRANSFER_SOL',
    label: 'Transfer SOL',
    description: 'Allow agent to transfer SOL tokens',
  },
  {
    value: 'TRANSFER_TOKEN',
    label: 'Transfer Tokens',
    description: 'Allow agent to transfer other SPL tokens',
  },
  {
    value: 'QUERY_BALANCE',
    label: 'Query Balance',
    description: 'Allow agent to query wallet balances',
  },
  {
    value: 'AUTONOMOUS',
    label: 'Autonomous Actions',
    description: 'Allow agent to take autonomous actions',
  },
];

export default function ByoaRegisterPage() {
  const [currentStep, setCurrentStep] = useState<Step>('type');
  const [isRegistering, setIsRegistering] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    agentType: 'local',
    agentName: '',
    agentId: '',
    agentSecret: '',
    webhookUrl: '',
    signingKey: '',
    supportedIntents: [],
    verificationMethods: ['none'],
  });
  const [showSecret, setShowSecret] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [registrationResult, setRegistrationResult] = useState<{
    success: boolean;
    message?: string;
    agentId?: string;
  } | null>(null);

  const steps: { id: Step; label: string; icon: React.ElementType }[] = [
    { id: 'type', label: 'Agent Type', icon: Zap },
    { id: 'info', label: 'Agent Info', icon: Zap },
    { id: 'intents', label: 'Supported Intents', icon: Shield },
    { id: 'verification', label: 'Verification Method', icon: Shield },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'verify', label: 'Verification', icon: CheckCircle2 },
    { id: 'confirm', label: 'Confirm', icon: AlertCircle },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);
  const isLastStep = currentStepIndex === steps.length - 1;
  const isFirstStep = currentStepIndex === 0;

  const handleNext = () => {
    if (isLastStep) return;
    // Can't proceed from type selection without choosing a type
    if (currentStep === 'type' && !isTypeSelected) return;
    setCurrentStep(steps[currentStepIndex + 1].id);
  };

  const handlePrev = () => {
    if (isFirstStep) return;
    setCurrentStep(steps[currentStepIndex - 1].id);
  };

  const handleRegister = async () => {
    setIsRegistering(true);
    try {
      const response = await api.registerExternalAgent({
        agentName: formData.agentName,
        agentType: formData.agentType,
        agentEndpoint: formData.agentType === 'remote' ? formData.webhookUrl : undefined,
        supportedIntents: formData.supportedIntents,
        verificationMethods:
          formData.verificationMethods.length > 0 ? formData.verificationMethods : ['none'],
        metadata: {
          agentId: formData.agentId,
          agentSecret: formData.agentSecret,
          signingKey: formData.signingKey,
        },
      });

      if (response.success && response.data) {
        const result = {
          success: true,
          message: response.data.message,
          agentId: response.data.agentId,
        };
        setRegistrationResult(result);
        setCurrentStep('confirm');
      } else {
        setRegistrationResult({
          success: false,
          message: response.error || 'Registration failed',
        });
      }
    } catch (err) {
      setRegistrationResult({
        success: false,
        message: err instanceof Error ? err.message : 'Registration failed',
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const updateFormData = (key: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const isFormValid =
    formData.agentName &&
    formData.agentId &&
    formData.agentSecret &&
    formData.signingKey &&
    formData.supportedIntents.length > 0 &&
    (formData.agentType === 'remote' ? !!formData.webhookUrl : true);

  const isTypeSelected = formData.agentType !== null;

  return (
    <>
      <Head>
        <title>BYOA Agent Registration | Sophia</title>
      </Head>

      <PageLayout title="Register Agent" subtitle="Bring your own agent and integrate with Sophia">
        <div className="max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[1.4rem] border border-white/10 bg-white/[0.05] p-8 backdrop-blur-xl transition-colors duration-200"
            >
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-6">
                  <div className="flex-1 h-1 bg-gradient-to-r from-primary via-surface-elevated to-surface-elevated rounded-full" />
                </div>

                <div className="flex items-start justify-between mb-8">
                  {steps.map((step, index) => {
                    const isActive = step.id === currentStep;
                    const isCompleted = index < currentStepIndex;
                    const StepIcon = step.icon;

                    return (
                      <motion.div key={step.id} className="flex flex-col items-center flex-1">
                        <motion.div
                          className={cn(
                            'w-12 h-12 rounded-full border-2 flex items-center justify-center font-semibold transition-all mb-2',
                            isCompleted
                              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                              : isActive
                                ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                                : 'bg-slate-800/50 border-slate-700 text-slate-500'
                          )}
                        >
                          <StepIcon className="w-5 h-5" />
                        </motion.div>
                        <span
                          className={cn(
                            'text-xs font-medium text-center whitespace-nowrap',
                            isActive || isCompleted ? 'text-slate-50' : 'text-slate-400'
                          )}
                        >
                          {step.label}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6 min-h-[300px]"
                >
                  {currentStep === 'type' && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-white">Select Agent Type</h3>
                      <p className="text-sm text-white/60 mb-6">
                        Choose how your agent will communicate with Sophia.
                      </p>

                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => setFormData((prev) => ({ ...prev, agentType: 'local' }))}
                          className={cn(
                            'p-6 rounded-lg border-2 transition-all text-left',
                            formData.agentType === 'local'
                              ? 'border-cyan-400/60 bg-cyan-400/10'
                              : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                          )}
                        >
                          <div className="font-semibold text-slate-50 mb-2">Local Agent</div>
                          <div className="text-sm text-slate-400 space-y-2">
                            <p>• Runs on your infrastructure</p>
                            <p>• No webhook required</p>
                            <p>• Polls for intents</p>
                            <p>• Best for internal agents</p>
                          </div>
                        </button>

                        <button
                          onClick={() => setFormData((prev) => ({ ...prev, agentType: 'remote' }))}
                          className={cn(
                            'p-6 rounded-lg border-2 transition-all text-left',
                            formData.agentType === 'remote'
                              ? 'border-cyan-400/60 bg-cyan-400/10'
                              : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                          )}
                        >
                          <div className="font-semibold text-slate-50 mb-2">Remote Agent</div>
                          <div className="text-sm text-slate-400 space-y-2">
                            <p>• Accessed via webhook URL</p>
                            <p>• Event-driven architecture</p>
                            <p>• Lower latency</p>
                            <p>• Best for cloud agents</p>
                          </div>
                        </button>
                      </div>

                      {formData.agentType && (
                        <div className="mt-6 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-[1.4rem]">
                          <p className="text-sm text-cyan-200">
                            ✓ Selected:{' '}
                            <span className="font-semibold capitalize">{formData.agentType}</span>{' '}
                            Agent
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {currentStep === 'info' && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-white">Agent Information</h3>
                      <p className="text-sm text-white/60 mb-4">
                        Enter the basic information about your agent.
                      </p>

                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                          Agent Name
                        </label>
                        <input
                          type="text"
                          placeholder="My Trading Agent"
                          value={formData.agentName}
                          onChange={(e) => updateFormData('agentName', e.target.value)}
                          className="w-full rounded-xl border border-cyan-400/30 bg-white/5 px-4 py-3 text-sm font-semibold text-cyan-100 placeholder:text-white/40 transition hover:border-cyan-300/60 hover:bg-cyan-400/10"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                          Agent ID
                        </label>
                        <input
                          type="text"
                          placeholder="agent_abc123def456"
                          value={formData.agentId}
                          onChange={(e) => updateFormData('agentId', e.target.value)}
                          className="w-full rounded-xl border border-cyan-400/30 bg-white/5 px-4 py-3 text-sm font-semibold text-cyan-100 placeholder:text-white/40 transition hover:border-cyan-300/60 hover:bg-cyan-400/10"
                        />
                        <p className="text-xs text-white/50 mt-1">
                          Unique identifier for your agent
                        </p>
                      </div>
                    </div>
                  )}

                  {currentStep === 'intents' && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-white">Supported Intents</h3>
                      <p className="text-sm text-white/60 mb-6">Select which operations your agent will support.</p>

                      <div className="space-y-3">
                        {AVAILABLE_INTENTS.map((intent) => (
                          <label
                            key={intent.value}
                            className="flex items-start gap-3 p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:border-cyan-400/60 cursor-pointer transition-all"
                          >
                            <input
                              type="checkbox"
                              checked={formData.supportedIntents.includes(intent.value)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData((prev) => ({
                                    ...prev,
                                    supportedIntents: [...prev.supportedIntents, intent.value],
                                  }));
                                } else {
                                  setFormData((prev) => ({
                                    ...prev,
                                    supportedIntents: prev.supportedIntents.filter((i) => i !== intent.value),
                                  }));
                                }
                              }}
                              className="w-4 h-4 rounded border border-slate-600 text-cyan-500 focus:ring-cyan-500 accent-cyan-500 mt-1 flex-shrink-0"
                            />
                            <div>
                              <div className="font-medium text-white">{intent.label}</div>
                              <div className="text-xs text-white/60">{intent.description}</div>
                            </div>
                          </label>
                        ))}
                      </div>

                      {formData.supportedIntents.length === 0 && (
                        <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
                          Select at least one intent to continue.
                        </div>
                      )}
                    </div>
                  )}

                  {currentStep === 'verification' && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-white">Verification Methods</h3>
                      <p className="text-sm text-white/60 mb-6">Select optional security verification methods for your agent.</p>

                      <div className="space-y-3">
                        <label className="flex items-start gap-3 p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:border-cyan-400/60 cursor-pointer transition-all">
                          <input
                            type="checkbox"
                            checked={formData.verificationMethods.includes('challenge-response')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData((prev) => ({
                                  ...prev,
                                  verificationMethods: [...prev.verificationMethods, 'challenge-response'],
                                }));
                              } else {
                                setFormData((prev) => ({
                                  ...prev,
                                  verificationMethods: prev.verificationMethods.filter((m) => m !== 'challenge-response'),
                                }));
                              }
                            }}
                            className="w-4 h-4 rounded border border-slate-600 text-cyan-500 focus:ring-cyan-500 accent-cyan-500 mt-1 flex-shrink-0"
                          />
                          <div>
                            <div className="font-medium text-white">Challenge-Response Handshake</div>
                            <div className="text-xs text-white/60">Verify endpoint ownership with a cryptographic challenge during registration</div>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:border-cyan-400/60 cursor-pointer transition-all">
                          <input
                            type="checkbox"
                            checked={formData.verificationMethods.includes('hmac-signature')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData((prev) => ({
                                  ...prev,
                                  verificationMethods: [...prev.verificationMethods, 'hmac-signature'],
                                }));
                              } else {
                                setFormData((prev) => ({
                                  ...prev,
                                  verificationMethods: prev.verificationMethods.filter((m) => m !== 'hmac-signature'),
                                }));
                              }
                            }}
                            className="w-4 h-4 rounded border border-slate-600 text-cyan-500 focus:ring-cyan-500 accent-cyan-500 mt-1 flex-shrink-0"
                          />
                          <div>
                            <div className="font-medium text-white">HMAC Webhook Signatures</div>
                            <div className="text-xs text-white/60">Sign all webhook notifications with HMAC-SHA256 for integrity verification</div>
                          </div>
                        </label>
                      </div>

                      <div className="text-xs text-white/60 bg-white/[0.04] border border-white/10 rounded-xl p-3">
                        <p className="font-medium text-white/80 mb-1">Note:</p>
                        <p>You can skip verification (no checkboxes selected) for basic integrations.</p>
                      </div>
                    </div>
                  )}

                  {currentStep === 'security' && (
                    <div className="space-y-4">
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3 mb-6">
                        <AlertCircle className="w-5 h-5 text-red-300 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-red-300 mb-1">Security Warning</p>
                          <p className="text-xs text-red-200">
                            Keep your agent secret and signing key safe. Never share them publicly
                            or commit them to version control.
                          </p>
                        </div>
                      </div>

                      <h3 className="text-lg font-semibold text-white">Security Credentials</h3>
                      <p className="text-sm text-white/60 mb-4">Don't share these credentials with anyone.</p>

                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                          Agent Secret
                        </label>
                        <div className="relative">
                          <input
                            type={showSecret ? 'text' : 'password'}
                            placeholder="sk_live_xxxxxxxxxxxxxxxxxx"
                            value={formData.agentSecret}
                            onChange={(e) => updateFormData('agentSecret', e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-4 py-3 pr-12 text-sm transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSecret(!showSecret)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                          >
                            {showSecret ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                          Signing Key
                        </label>
                        <div className="relative">
                          <input
                            type={showKey ? 'text' : 'password'}
                            placeholder="0x1234567890abcdef..."
                            value={formData.signingKey}
                            onChange={(e) => updateFormData('signingKey', e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-4 py-3 pr-12 text-sm transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                          >
                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {currentStep === 'verify' && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-slate-50">Verification</h3>
                      <p className="text-sm text-slate-400 mb-4">
                        {formData.agentType === 'remote'
                          ? 'Configure webhook for agent communication.'
                          : 'Local agent configuration complete. Ready to register.'}
                      </p>

                      {formData.agentType === 'remote' && (
                        <div>
                          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                            Webhook URL
                          </label>
                          <input
                            type="url"
                            placeholder="https://api.example.com/webhook"
                            value={formData.webhookUrl}
                            onChange={(e) => updateFormData('webhookUrl', e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-4 py-3 text-sm transition-all"
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            Where Sophia will send intent notifications
                          </p>
                        </div>
                      )}

                      <div className="mt-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                        <p className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wider">
                          {formData.agentType === 'remote'
                            ? 'Verification Details'
                            : 'Configuration Status'}
                        </p>
                        <div className="space-y-2 text-xs text-slate-300">
                          {formData.agentType === 'remote' ? (
                            <>
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-cyan-300 flex-shrink-0" />
                                <span>Webhook URL validated</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-yellow-300 flex-shrink-0" />
                                <span>Secret verification pending</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-cyan-300 flex-shrink-0" />
                                <span>Local agent infrastructure enabled</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-cyan-300 flex-shrink-0" />
                                <span>Intent polling configured</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-yellow-300 flex-shrink-0" />
                                <span>Ready for agent deployment</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {currentStep === 'confirm' && (
                    <div className="space-y-4">
                      {registrationResult?.success ? (
                        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-6 text-center">
                          <CheckCircle2 className="w-12 h-12 mx-auto text-cyan-300 mb-4" />
                          <h3 className="text-lg font-semibold text-cyan-300 mb-2">
                            Registration Successful!
                          </h3>
                          <p className="text-sm text-cyan-200 mb-4">
                            Your agent has been registered and is ready to use.
                          </p>
                          <div className="bg-slate-800/50 rounded-lg p-4 text-left mb-4">
                            <p className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wider">
                              Agent ID
                            </p>
                            <div className="flex items-center gap-2">
                              <code className="text-sm text-slate-300 font-mono flex-1 break-all">
                                {registrationResult.agentId}
                              </code>
                              <button
                                aria-label="Copy agent ID"
                                className="text-slate-400 hover:text-cyan-300 transition-colors"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : registrationResult?.success === false ? (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
                          <AlertCircle className="w-12 h-12 mx-auto text-red-300 mb-4" />
                          <h3 className="text-lg font-semibold text-red-300 mb-2">
                            Registration Failed
                          </h3>
                          <p className="text-sm text-red-200">{registrationResult.message}</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold text-slate-50">
                            Confirm Registration
                          </h3>
                          <p className="text-sm text-slate-400">
                            Review your agent details before registration.
                          </p>

                          <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
                            <div className="flex justify-between items-start">
                              <span className="text-xs text-slate-400 font-medium">Agent Name</span>
                              <span className="text-sm text-slate-300">{formData.agentName}</span>
                            </div>
                            <div className="flex justify-between items-start">
                              <span className="text-xs text-slate-400 font-medium">Agent ID</span>
                              <span className="text-sm text-slate-300 font-mono">
                                {formData.agentId}
                              </span>
                            </div>
                            <div className="flex justify-between items-start">
                              <span className="text-xs text-slate-400 font-medium">
                                Webhook URL
                              </span>
                              <span className="text-sm text-slate-300 break-all max-w-xs text-right">
                                {formData.webhookUrl}
                              </span>
                            </div>
                          </div>

                          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3 flex items-start gap-2">
                            <Shield className="w-4 h-4 text-cyan-300 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-cyan-200">
                              Your credentials are encrypted and stored securely.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              <div className="flex items-center gap-3 pt-8 border-t border-slate-700/50 mt-8">
                <button
                  onClick={handlePrev}
                  disabled={isFirstStep || isRegistering}
                  className="flex-1 bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 text-slate-300 hover:text-slate-50 rounded-lg px-4 py-3 font-medium transition-all disabled:opacity-50"
                >
                  Back
                </button>

                {currentStep === 'confirm' && !registrationResult ? (
                  <button
                    onClick={handleRegister}
                    disabled={!isFormValid || isRegistering}
                    className={cn(
                      'flex-1 rounded-lg px-4 py-3 font-medium transition-all inline-flex items-center justify-center gap-2',
                      isFormValid && !isRegistering
                        ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/30'
                        : 'bg-slate-800/50 border border-slate-700/50 text-slate-400'
                    )}
                  >
                    {isRegistering && <RefreshCw className="w-4 h-4 animate-spin" />}
                    {isRegistering ? 'Registering...' : 'Register Agent'}
                  </button>
                ) : isLastStep ? (
                  <div className="flex-1 bg-slate-800/50 border border-slate-700/50 text-slate-400 rounded-lg px-4 py-3 font-medium text-center">
                    Complete
                  </div>
                ) : (
                  <button
                    onClick={handleNext}
                    className="flex-1 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 rounded-lg px-4 py-3 font-medium transition-all hover:bg-cyan-500/30"
                  >
                    Next
                  </button>
                )}
              </div>
            </motion.div>
        </div>
      </PageLayout>
    </>
  );
}
