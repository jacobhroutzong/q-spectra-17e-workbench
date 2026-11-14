import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Brain, ChevronDown, ChevronRight, Sliders } from 'lucide-react';
import { queryQwenCemaCoPilot } from '../services/llmBridge';

export const CHALLENGES = [
  {
    id: 'ch1',
    code: 'CEMA-101',
    title: 'Wideband Rydberg E-Field Calibration',
    mosTask: '17E-ES-4012 // Non-Metallic Vapor Cell Receiver',
    objective:
      'Compute the incident electric field E (V/m) from an observed Autler-Townes splitting of 42.5 MHz in 85Rb at principal quantum number n=62 (mu = 3.25e-26 C*m).',
    expectedFormula: 'E = (h * delta_f) / mu',
    targetAnswer: 0.866,
    tolerance: 0.05,
    unit: 'V/m',
    hint: 'Multiply Planck constant (6.626e-34 J*s) by 42.5e6 Hz, then divide by dipole moment 3.25e-26 C*m.'
  },
  {
    id: 'ch2',
    code: 'CEMA-204',
    title: 'HPM / EMP Front-End Survivability Triage',
    mosTask: '17E-EP-4028 // High-Power Microwave Electronic Protection',
    objective:
      'An adversary fires a +28 dBm HPM pulse at 9.4 GHz. Determine the maximum safe principal quantum number n where the Autler-Townes splitting stays below 180 MHz to prevent stark-shift state mixing.',
    expectedFormula: 'Tune n slider in Rydberg Lab at +28 dBm',
    targetAnswer: 44,
    tolerance: 6,
    unit: 'n (principal)',
    hint: 'Higher n increases sensitivity (n^2) but saturates faster under high field strength. Test n between 38 and 50.'
  },
  {
    id: 'ch3',
    code: 'CEMA-309',
    title: 'Counter-DRFM Entangled Idler Discrimination',
    mosTask: '17E-EP-5011 // Reject Coherent Deceptive Jamming',
    objective:
      'Calculate the Quantum Illumination SNR advantage (in dB) over a classical coherent radar when thermal noise Nb = 1200 photons/mode and DRFM spoofing is active (use M=1e6, kappa=0.01, Ns=0.02).',
    expectedFormula: '10 * log10(SNR_quantum / SNR_classical)',
    targetAnswer: 6.84,
    tolerance: 0.6,
    unit: 'dB',
    hint: 'Quantum Illumination achieves a 4x (6.02 dB) base error-exponent gain plus immunity to injected uncorrelated DRFM photons.'
  },
  {
    id: 'ch4',
    code: 'CEMA-415',
    title: 'GPS-Denied Cold-Atom INS + MagNav Fix',
    mosTask: '17E-PNT-6004 // Contested PNT Navigation',
    objective:
      'Under a +25 dB L1/L2 GPS meaconing attack over a 4-hour mission, compute the radial CEP position error (in meters) of a hybrid Cold-Atom Interferometer + NV-Diamond MagNav system with crustal map lock.',
    expectedFormula: 'Bounded by crustal magnetic anomaly gradient correlation (~4.2 m CEP)',
    targetAnswer: 4.2,
    tolerance: 1.5,
    unit: 'meters CEP',
    hint: 'Unlike classical INS which drifts unbound with t^3, MagNav map-matching clamps CEP to ~3 to 5.5 meters.'
  }
];

export default function ChallengeArena({
  inferenceMode,
  backendUrl,
  useBackendProxy,
  ollamaUrl,
  ollamaModel,
  hfToken,
  hfModel,
  telemetry,
  dynamicChallenges = [],
  activeChallengeId = null,
  dispatchScenario
}) {
  const allChallenges = useMemo(
    () => [...dynamicChallenges, ...CHALLENGES],
    [dynamicChallenges]
  );

  const [selectedChallenge, setSelectedChallenge] = useState(allChallenges[0]);
  const [userNumericAnswer, setUserNumericAnswer] = useState('');
  const [solvedMap, setSolvedMap] = useState({});
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  const [copilotPrompt, setCopilotPrompt] = useState(
    'Analyze my current Rydberg, Quantum Radar, and MagNav telemetry and recommend 17E CEMA tactical adjustments.'
  );
  const [copilotResult, setCopilotResult] = useState(null);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [showThinking, setShowThinking] = useState(true);

  useEffect(() => {
    if (activeChallengeId) {
      const found = allChallenges.find((c) => c.id === activeChallengeId);
      if (found) {
        setSelectedChallenge(found);
        setFeedbackMsg(null);
      }
    }
  }, [activeChallengeId, allChallenges]);

  const handleVerifyChallenge = () => {
    const val = parseFloat(userNumericAnswer);
    if (isNaN(val)) {
      setFeedbackMsg({ ok: false, text: 'Enter a valid numeric value.' });
      return;
    }
    const diff = Math.abs(val - selectedChallenge.targetAnswer);
    if (diff <= selectedChallenge.tolerance) {
      setSolvedMap((prev) => ({ ...prev, [selectedChallenge.id]: true }));
      setFeedbackMsg({
        ok: true,
        text: `Verified: ${selectedChallenge.targetAnswer} ${selectedChallenge.unit}.`
      });
    } else {
      setFeedbackMsg({
        ok: false,
        text: `Out of tolerance (~${selectedChallenge.targetAnswer} ${selectedChallenge.unit}). ${selectedChallenge.hint}`
      });
    }
  };

  const handleRunCopilot = async () => {
    setCopilotLoading(true);
    try {
      const res = await queryQwenCemaCoPilot({
        prompt: copilotPrompt,
        mode: inferenceMode,
        backendUrl,
        useBackendProxy,
        ollamaUrl,
        ollamaModel,
        hfToken,
        hfModel,
        telemetry
      });
      setCopilotResult(res);
    } catch (err) {
      setCopilotResult({
        thinking: '',
        answer: `Error contacting inference bridge: ${err.message}`,
        hasThinking: false
      });
    } finally {
      setCopilotLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Challenge Arena */}
      <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            17E Challenge Arena
          </h2>
          <span className="text-xs font-mono text-zinc-400">
            {Object.keys(solvedMap).length}/{allChallenges.length} Solved
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
          {allChallenges.map((ch) => (
            <button
              key={ch.id}
              onClick={() => {
                setSelectedChallenge(ch);
                setFeedbackMsg(null);
              }}
              className={`p-3 rounded-xl text-left font-mono text-xs border transition ${
                selectedChallenge.id === ch.id
                  ? 'bg-zinc-100/10 border-white/25 text-zinc-100'
                  : 'bg-zinc-950/50 border-white/[0.05] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{ch.code}</span>
                {solvedMap[ch.id] && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
              </div>
              <div className="truncate text-[11px] text-zinc-400 mt-1">{ch.title}</div>
            </button>
          ))}
        </div>

        <div className="p-4 rounded-xl bg-zinc-950/60 border border-white/[0.06] space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-mono text-zinc-400">{selectedChallenge.mosTask}</div>
            {selectedChallenge.telemetryOverride && dispatchScenario && (
              <button
                onClick={() =>
                  dispatchScenario({
                    telemetryOverride: selectedChallenge.telemetryOverride,
                    targetTab: selectedChallenge.targetTab,
                    toastText: `Loaded ${selectedChallenge.code} telemetry into workbench`
                  })
                }
                className="px-2.5 py-1 rounded-lg border border-white/10 text-zinc-200 text-[11px] font-mono flex items-center gap-1 hover:border-white/25 transition"
              >
                <Sliders className="w-3 h-3" />
                Load Sliders
              </button>
            )}
          </div>
          {selectedChallenge.sourceCitation && (
            <div className="text-[11px] font-mono text-sky-300">
              {selectedChallenge.sourceCitation}
            </div>
          )}
          <p className="text-sm text-zinc-200 leading-relaxed">{selectedChallenge.objective}</p>
          <div className="text-xs font-mono text-zinc-500">
            Formula: {selectedChallenge.expectedFormula}
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder={`Value (${selectedChallenge.unit})`}
            value={userNumericAnswer}
            onChange={(e) => setUserNumericAnswer(e.target.value)}
            className="flex-1 bg-zinc-950/70 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/25"
          />
          <button
            onClick={handleVerifyChallenge}
            className="bg-zinc-100 text-zinc-950 hover:bg-white font-medium text-xs px-4 py-2 rounded-lg transition"
          >
            Verify
          </button>
        </div>

        {feedbackMsg && (
          <div
            className={`p-3 rounded-xl text-xs font-mono border ${
              feedbackMsg.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {feedbackMsg.text}
          </div>
        )}
      </div>

      {/* Qwen 3.8 27B Co-Pilot */}
      <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 flex flex-col justify-between space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Qwen 3.8 27B Co-Pilot
            </h2>
            <span className="text-[11px] font-mono text-emerald-400">Telemetry Synced</span>
          </div>

          <div className="text-[11px] font-mono text-zinc-500 flex flex-wrap gap-x-3 gap-y-1">
            <span>
              {telemetry.rydberg.species} n={telemetry.rydberg.nPrincipal} ({telemetry.rydberg.splittingMHz} MHz)
            </span>
            <span>•</span>
            <span>+{telemetry.radar.advantageDb} dB EP</span>
            <span>•</span>
            <span>{telemetry.pnt.quantumPntErrorMeters}m CEP</span>
          </div>

          <textarea
            rows={3}
            value={copilotPrompt}
            onChange={(e) => setCopilotPrompt(e.target.value)}
            className="w-full bg-zinc-950/70 border border-white/10 rounded-xl p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-white/25"
          />
          <button
            onClick={handleRunCopilot}
            disabled={copilotLoading}
            className="w-full bg-zinc-100 text-zinc-950 hover:bg-white font-medium text-xs px-4 py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {copilotLoading ? 'Querying Co-Pilot...' : 'Query Co-Pilot'}
          </button>
        </div>

        <div className="flex-1 bg-zinc-950/70 border border-white/[0.06] rounded-xl p-4 text-xs font-mono text-zinc-300 overflow-y-auto max-h-72 space-y-3">
          {!copilotResult && (
            <div className="text-zinc-500">
              Live slider telemetry is automatically injected into every Co-Pilot query.
            </div>
          )}

          {copilotResult?.hasThinking && (
            <div className="border border-white/[0.07] bg-zinc-900/50 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowThinking(!showThinking)}
                className="w-full px-3 py-1.5 flex items-center justify-between text-[11px] text-zinc-400 hover:text-zinc-200"
              >
                <span className="flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5" />
                  Reasoning Trace
                </span>
                {showThinking ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {showThinking && (
                <div className="p-3 pt-1 text-[11px] text-zinc-400 whitespace-pre-wrap leading-relaxed border-t border-white/[0.05]">
                  {copilotResult.thinking}
                </div>
              )}
            </div>
          )}

          {copilotResult && (
            <div className="whitespace-pre-wrap leading-relaxed text-zinc-200">
              {copilotResult.answer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
