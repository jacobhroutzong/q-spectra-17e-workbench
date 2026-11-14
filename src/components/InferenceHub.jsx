import React, { useState } from 'react';
import { Copy, Check, RefreshCw, ArrowRight } from 'lucide-react';

export default function InferenceHub({
  inferenceMode,
  setInferenceMode,
  backendUrl,
  setBackendUrl,
  useBackendProxy,
  setUseBackendProxy,
  ollamaUrl,
  setOllamaUrl,
  ollamaModel,
  setOllamaModel,
  hfToken,
  setHfToken,
  hfModel,
  setHfModel
}) {
  const [healthStatus, setHealthStatus] = useState(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedDistill, setCopiedDistill] = useState(false);

  const distillCmd = `python colab/olmo_edge_distillation.py && ollama create olmo-quantum-edge -f Modelfile`;
  const launchCmd = `cd backend && pip install -r requirements.txt && uvicorn main:app --host 0.0.0.0 --port 8000 --reload`;

  const checkBackendHealth = async () => {
    setCheckingHealth(true);
    try {
      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHealthStatus({ ok: true, data });
    } catch (err) {
      setHealthStatus({ ok: false, error: err.message });
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(launchCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-6">
      {/* Inference Engine Selector */}
      <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Inference Bridge
          </h2>
          <span className="text-xs font-mono text-zinc-400">
            Active: <span className="text-zinc-100 uppercase">{inferenceMode}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { id: 'offline', title: 'Offline', desc: 'Deterministic Quantum Physics Reference Engine' },
            { id: 'ollama', title: 'Ollama', desc: 'Local or Colab Tunnel :11434' },
            { id: 'hf_pro', title: 'HF Pro', desc: 'Hugging Face Serverless / Dedicated API' }
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setInferenceMode(m.id)}
              className={`p-4 rounded-xl border text-left transition ${
                inferenceMode === m.id
                  ? 'bg-zinc-100/10 border-white/25 text-zinc-100'
                  : 'bg-zinc-950/50 border-white/[0.05] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className="text-xs font-mono font-medium">{m.title}</div>
              <div className="text-[11px] text-zinc-500 mt-1">{m.desc}</div>
            </button>
          ))}
        </div>

        {inferenceMode === 'ollama' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">
                Ollama Base URL
              </label>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full bg-zinc-950/70 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">
                Ollama Model Tag
              </label>
              <input
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="qwen-quantum-copilot"
                className="w-full bg-zinc-950/70 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-white/25"
              />
            </div>
          </div>
        )}

        {inferenceMode === 'hf_pro' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">
                Hugging Face Token
              </label>
              <input
                type="password"
                value={hfToken}
                onChange={(e) => setHfToken(e.target.value)}
                placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-zinc-950/70 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">
                HF Model ID
              </label>
              <input
                type="text"
                value={hfModel}
                onChange={(e) => setHfModel(e.target.value)}
                placeholder="Qwen/Qwen2.5-32B-Instruct"
                className="w-full bg-zinc-950/70 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-white/25"
              />
            </div>
          </div>
        )}
      </div>

      {/* FastAPI Physics & CORS Proxy */}
      <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            FastAPI Physics &amp; CORS Proxy
          </h3>
          <button
            onClick={() => setUseBackendProxy(!useBackendProxy)}
            className={`px-3 py-1 rounded-full font-mono text-[11px] border transition ${
              useBackendProxy
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-white/10 text-zinc-400'
            }`}
          >
            Proxy: {useBackendProxy ? 'Enabled' : 'Direct'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <input
            type="text"
            value={backendUrl}
            onChange={(e) => setBackendUrl(e.target.value)}
            placeholder="http://localhost:8000"
            className="flex-1 min-w-[240px] bg-zinc-950/70 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-white/25"
          />
          <button
            onClick={checkBackendHealth}
            disabled={checkingHealth}
            className="bg-zinc-100 text-zinc-950 hover:bg-white font-medium text-xs px-4 py-2 rounded-lg transition flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingHealth ? 'animate-spin' : ''}`} />
            Test Health
          </button>
        </div>

        {healthStatus && (
          <div
            className={`p-3 rounded-xl text-xs font-mono border ${
              healthStatus.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-zinc-950/70 border-white/10 text-zinc-400'
            }`}
          >
            {healthStatus.ok
              ? `Online • ${healthStatus.data.physics_solver} (QuTiP: ${
                  healthStatus.data.qutip_available ? 'Yes' : 'No'
                })`
              : `Offline (${healthStatus.error}) — Client-side analytical fallback active.`}
          </div>
        )}

        <div className="bg-zinc-950/70 border border-white/[0.06] rounded-xl p-3 flex items-center justify-between gap-3">
          <code className="text-xs font-mono text-zinc-300 overflow-x-auto">{launchCmd}</code>
          <button
            onClick={handleCopy}
            className="px-2.5 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-100 text-xs font-mono flex items-center gap-1.5 shrink-0 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Teacher-Student Distillation Pipeline */}
      <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Distillation Pipeline (Qwen 3.8 27B → OLMo Edge)
          </h3>
          <span className="text-xs font-mono text-zinc-400">
            Checkpoint: <span className="text-zinc-100">{ollamaModel}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center text-xs font-mono">
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-white/[0.06] space-y-1">
            <div className="text-zinc-100 font-medium">1. Teacher: Qwen 3.8 27B</div>
            <div className="text-zinc-500 text-[11px]">
              Synthesizes verified &lt;think&gt; traces in OSINT (.jsonl)
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-zinc-500 py-1">
            <ArrowRight className="w-3.5 h-3.5" />
            <span>Unsloth 4-bit QLoRA</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-white/[0.06] space-y-1">
            <div className="text-zinc-100 font-medium">2. Student: OLMo-2 7B Edge</div>
            <div className="text-zinc-500 text-[11px]">
              Exported to olmo-quantum-edge.Q4_K_M.gguf for local workstation inference
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { tag: 'qwen-quantum-copilot', title: 'qwen-quantum-copilot (27B Teacher)', desc: 'Colab / Workstation reasoning engine' },
            { tag: 'olmo-quantum-edge', title: 'olmo-quantum-edge (7B Student)', desc: 'Compact local edge checkpoint' }
          ].map((opt) => (
            <button
              key={opt.tag}
              onClick={() => setOllamaModel(opt.tag)}
              className={`p-3.5 rounded-xl border text-left font-mono text-xs transition ${
                ollamaModel === opt.tag
                  ? 'bg-zinc-100/10 border-white/25 text-zinc-100'
                  : 'bg-zinc-950/50 border-white/[0.05] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className="font-medium">{opt.title}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>

        <div className="bg-zinc-950/70 border border-white/[0.06] rounded-xl p-3 flex items-center justify-between gap-3">
          <code className="text-xs font-mono text-zinc-300 overflow-x-auto">{distillCmd}</code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(distillCmd);
              setCopiedDistill(true);
              setTimeout(() => setCopiedDistill(false), 1800);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-100 text-xs font-mono flex items-center gap-1.5 shrink-0 transition"
          >
            {copiedDistill ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedDistill ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
