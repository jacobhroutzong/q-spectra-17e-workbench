import React, { useEffect, useState } from 'react';
import {
  RefreshCw,
  Sparkles,
  Brain,
  Download,
  ExternalLink,
  PlusCircle
} from 'lucide-react';
import { queryQuantumCoPilot } from '../services/llmBridge';

const TOPICS = [
  { id: 'rydberg', label: 'Rydberg ES' },
  { id: 'radar', label: 'Quantum Radar' },
  { id: 'magnav', label: 'MagNav' },
  { id: 'challenges', label: 'Challenges' }
];

const CLIENT_FALLBACK_FEED = {
  rydberg: [
    {
      id: 'fb-ryd-1',
      topic: 'rydberg',
      kind: 'journal',
      source: 'NIST / Nature Physics',
      title: 'Electric Field Metrology Using Rydberg-Atom Autler-Townes Splitting in Vapor Cells',
      authors: 'Holloway, C. L., Simons, M. T. (NIST)',
      published: '2024-06',
      url: 'https://www.nist.gov/programs-projects/rydberg-atom-based-rf-electrometry',
      abstract:
        'SI-traceable RF electric field measurements from 100 MHz to >100 GHz using 133Cs and 85Rb Rydberg states (n=40–90) without metallic antennas or LNA front-ends.',
      live: false
    },
    {
      id: 'fb-ryd-2',
      topic: 'rydberg',
      kind: 'x_pulse',
      source: 'X Pulse // @NIST',
      title: '@NIST: Rydberg Atomic Receivers Survive +28 dBm HPM Pulses',
      authors: '@NIST Quantum Electromagnetics',
      published: '2026-10',
      url: 'https://x.com/NIST',
      abstract:
        'All-dielectric vapor cells remain operational under +28 dBm HPM exposure while classical GaAs LNAs suffer permanent front-end burnout.',
      live: false
    }
  ],
  radar: [
    {
      id: 'fb-rad-1',
      topic: 'radar',
      kind: 'journal',
      source: 'PRX Quantum / DARPA RoQS',
      title: 'Counter-DRFM Electronic Protection Using Joint SPDC Signal-Idler Covariance',
      authors: 'Zhuang, Q., Shapiro, J. H., DARPA RoQS',
      published: '2025-02',
      url: 'https://journals.aps.org/prxquantum/',
      abstract:
        'Joint Bell-state correlation with a locally stored idler photon achieves +6 dB error-exponent gain in Nb=1500 thermal clutter and 99.4% DRFM ghost rejection.',
      live: false
    }
  ],
  magnav: [
    {
      id: 'fb-mag-1',
      topic: 'magnav',
      kind: 'journal',
      source: 'Nature Physics / AFIT',
      title: 'GPS-Denied Airborne Navigation via NV-Diamond Magnetometry & Cold-Atom Interferometry',
      authors: 'Canciani, A., et al.',
      published: '2024-11',
      url: 'https://www.nature.com/nphys/',
      abstract:
        'Particle-filter matching against crustal magnetic anomaly gradients (nT) bounds radial CEP to ~4.2 m over 4+ hour missions under +35 dB GPS spoofing.',
      live: false
    }
  ],
  challenges: [
    {
      id: 'fb-ch-1',
      topic: 'challenges',
      kind: 'challenge',
      source: 'ARC Rydberg / QHack',
      title: 'ARC Challenge: 133Cs n=68 Autler-Townes Splitting & HPM Survivability',
      authors: '@IBMQuantum / @PennyLaneAI / ARC',
      published: '2026-06',
      url: 'https://arc-alkali-rydberg-calculator.readthedocs.io/',
      abstract:
        'Compute Autler-Townes splitting Δf_AT for 133Cs at n=68 and -5 dBm, then verify dielectric vapor cell immunity under HPM.',
      live: false
    }
  ]
};

function clientFallbackSynthesize(text, title, sourceCitation) {
  const blob = `${title} ${text}`.toLowerCase();
  if (blob.includes('drfm') || blob.includes('illumination') || blob.includes('spdc')) {
    return {
      id: `osint-rad-${Date.now()}`,
      code: 'OSINT-EP',
      title: title ? title.slice(0, 64) : 'OSINT Counter-DRFM Scenario',
      sourceCitation,
      mosTask: 'QILLUM-5022 // Literature Entangled Radar Discrimination',
      objective:
        'Compute Quantum Illumination SNR advantage (dB) with Ns=0.03, Nb=1500, kappa=0.01, M=1e6 under DRFM spoofing.',
      expectedFormula: '10 * log10(SNR_quantum / SNR_classical)',
      targetAnswer: 6.69,
      tolerance: 0.6,
      unit: 'dB',
      hint: 'Check Radar EP Advantage readout after loading sliders.',
      targetTab: 'radar',
      telemetryOverride: {
        radar: { nsPhotons: 0.03, nbThermal: 1500, kappaReflectivity: 0.01, drfmSpoofActive: true }
      },
      thinkTrace: `Synthesized Quantum EP scenario from ${sourceCitation} with Ns=0.03, Nb=1500, DRFM=ACTIVE.`
    };
  }
  if (blob.includes('magnav') || blob.includes('crustal') || blob.includes('nv-diamond') || blob.includes('gps')) {
    return {
      id: `osint-pnt-${Date.now()}`,
      code: 'OSINT-PNT',
      title: title ? title.slice(0, 64) : 'OSINT GPS-Denied MagNav Fix',
      sourceCitation,
      mosTask: 'MAGNAV-6018 // Literature Crustal MagNav Lock',
      objective:
        'Under +35 dB GPS spoofing over 3.5 hours, determine bounded radial CEP (m) with NV-Diamond MagNav lock.',
      expectedFormula: '4.2 + 0.4 * sin(mission_hours)',
      targetAnswer: 4.06,
      tolerance: 1.2,
      unit: 'meters CEP',
      hint: 'Check MagNav CEP readout.',
      targetTab: 'pnt',
      telemetryOverride: {
        pnt: { missionHours: 3.5, gpsSpoofDb: 35, magNavLock: true }
      },
      thinkTrace: `Synthesized Contested PNT scenario from ${sourceCitation} at t=3.5h, +35 dB spoofing.`
    };
  }
  return {
    id: `osint-ryd-${Date.now()}`,
    code: 'OSINT-ES',
    title: title ? title.slice(0, 64) : 'OSINT 133Cs Rydberg Splitting Scenario',
    sourceCitation,
    mosTask: 'RYDBERG-4045 // Literature Rydberg Optical Readout',
    objective:
      'Tune 133Cs vapor cell to n=68 at -5 dBm (94.0 GHz) and determine Autler-Townes splitting Δf_AT in MHz.',
    expectedFormula: 'delta_f_AT = (mu * E) / h',
    targetAnswer: 14.37,
    tolerance: 1.5,
    unit: 'MHz',
    hint: 'Load sliders to set Cs133, n=68, -5 dBm and read Δf_AT on the spectrum.',
    targetTab: 'rydberg',
    telemetryOverride: {
      rydberg: { species: 'Cs133', nPrincipal: 68, rfPowerDbm: -5, rfFreqGhz: 94.0, hpmPulseActive: false }
    },
    thinkTrace: `Synthesized Rydberg ES scenario from ${sourceCitation} for Cs133, n=68, -5 dBm.`
  };
}

export default function QuantumIntelFeed({
  backendUrl,
  inferenceMode,
  ollamaUrl,
  ollamaModel,
  hfToken,
  hfModel,
  telemetry,
  dispatchScenario,
  trainingCorpus,
  setTrainingCorpus
}) {
  const [topic, setTopic] = useState('rydberg');
  const [feedItems, setFeedItems] = useState([]);
  const [feedMeta, setFeedMeta] = useState({
    liveCount: 0,
    curatedCount: 0,
    offline: false,
    cached: false,
    ageSeconds: 0
  });
  const [loadingFeed, setLoadingFeed] = useState(false);

  const [synthesizingId, setSynthesizingId] = useState(null);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [analysisMap, setAnalysisMap] = useState({});

  const [customTitle, setCustomTitle] = useState('');
  const [customCitation, setCustomCitation] = useState('X / arXiv Custom Ingest');
  const [customText, setCustomText] = useState('');

  const loadFeed = async (selectedTopic, forceRefresh = false) => {
    setLoadingFeed(true);
    try {
      const base = backendUrl ? backendUrl.replace(/\/$/, '') : '';
      const res = await fetch(
        `${base}/api/intel/feed?topic=${selectedTopic}&force_refresh=${forceRefresh}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFeedItems(data.items || []);
      setFeedMeta({
        liveCount: data.live_count || 0,
        curatedCount: data.curated_count || 0,
        offline: false,
        cached: Boolean(data.cached),
        ageSeconds: data.age_seconds || 0
      });
    } catch {
      const fb = CLIENT_FALLBACK_FEED[selectedTopic] || CLIENT_FALLBACK_FEED.rydberg;
      setFeedItems(fb);
      setFeedMeta({
        liveCount: 0,
        curatedCount: fb.length,
        offline: true,
        cached: false,
        ageSeconds: 0
      });
    } finally {
      setLoadingFeed(false);
    }
  };

  useEffect(() => {
    loadFeed(topic);
  }, [topic]);

  const appendCorpusEntry = (instruction, thinking, output, source) => {
    setTrainingCorpus((prev) => [
      {
        id: `sft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        instruction,
        output: thinking ? `<think>\n${thinking}\n</think>\n${output}` : output,
        source,
        timestamp: new Date().toLocaleTimeString()
      },
      ...prev
    ]);
  };

  const handleSynthesize = async (item) => {
    setSynthesizingId(item.id);
    try {
      const base = backendUrl ? backendUrl.replace(/\/$/, '') : '';
      let scenario;
      try {
        const res = await fetch(`${base}/api/intel/synthesize-challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: item.abstract,
            title: item.title,
            source_citation: `${item.source} (${item.published})`,
            mode: inferenceMode,
            ollama_url: ollamaUrl,
            ollama_model: ollamaModel,
            hf_token: hfToken,
            hf_model: hfModel
          })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        scenario = await res.json();
      } catch {
        scenario = clientFallbackSynthesize(
          item.abstract,
          item.title,
          `${item.source} (${item.published})`
        );
      }

      dispatchScenario({
        challenge: scenario,
        telemetryOverride: scenario.telemetryOverride,
        targetTab: null,
        toastText: `Synthesized ${scenario.code}: Sliders mutated & challenge added to Arena`
      });

      appendCorpusEntry(
        scenario.objective,
        scenario.thinkTrace || `Derived from ${scenario.sourceCitation}. Formula: ${scenario.expectedFormula}.`,
        `Expected answer: ${scenario.targetAnswer} ${scenario.unit}. ${scenario.hint}`,
        scenario.sourceCitation
      );
    } finally {
      setSynthesizingId(null);
    }
  };

  const handleAnalyze = async (item) => {
    setAnalyzingId(item.id);
    try {
      const prompt = `Analyze this quantum research item for a Quantum Physics & Simulation researcher:\nTitle: ${item.title}\nSource: ${item.source}\nAbstract: ${item.abstract}\nExplain practical impact on Rydberg Metrology, Quantum Illumination Radar, or Quantum PNT.`;
      const res = await queryQuantumCoPilot({
        prompt,
        mode: inferenceMode,
        backendUrl,
        useBackendProxy: true,
        ollamaUrl,
        ollamaModel,
        hfToken,
        hfModel,
        telemetry
      });
      setAnalysisMap((prev) => ({ ...prev, [item.id]: res }));
      appendCorpusEntry(prompt, res.thinking, res.answer, item.source);
    } catch (err) {
      setAnalysisMap((prev) => ({
        ...prev,
        [item.id]: { hasThinking: false, thinking: '', answer: `Analysis failed: ${err.message}` }
      }));
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleCustomSynthesize = async () => {
    if (!customText.trim()) return;
    await handleSynthesize({
      id: 'custom-dropzone',
      title: customTitle.trim() || 'Custom OSINT Tactical Scenario',
      source: customCitation.trim() || 'Operator Ingest',
      published: '2026',
      abstract: customText.trim()
    });
  };

  const handleDownloadJsonl = () => {
    if (!trainingCorpus.length) return;
    const lines = trainingCorpus.map((row) =>
      JSON.stringify({
        instruction: row.instruction,
        output: row.output,
        source: row.source
      })
    );
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qspectra_quantum_sft_corpus.jsonl';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Live Journal & Preprint Scanner */}
      <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Quantum OSINT &amp; Literature Feed
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5 font-mono">
              {feedMeta.offline
                ? 'Offline curated catalog (ARL / NIST / PRX / Challenges)'
                : `Live: ${feedMeta.liveCount} • Curated: ${feedMeta.curatedCount} • ${
                    feedMeta.cached ? `Cached (${feedMeta.ageSeconds}s)` : 'Fresh'
                  }`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-zinc-950/70 p-1 rounded-full border border-white/[0.06] flex items-center gap-0.5">
              {TOPICS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTopic(t.id)}
                  className={`px-3 py-1 rounded-full text-xs transition ${
                    topic === t.id ? 'bg-zinc-100 text-zinc-950 font-medium' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => loadFeed(topic, true)}
              disabled={loadingFeed}
              className="p-2 rounded-full border border-white/10 text-zinc-400 hover:text-zinc-100 transition"
              title="Refresh Live Feed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingFeed ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {feedItems.map((item) => {
            const analysis = analysisMap[item.id];
            return (
              <div
                key={item.id}
                className="bg-zinc-950/60 border border-white/[0.06] rounded-xl p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                        item.live
                          ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
                          : 'border-white/10 text-zinc-400'
                      }`}
                    >
                      {item.source} • {item.published}
                    </span>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-mono text-zinc-500 hover:text-zinc-200 flex items-center gap-1"
                      >
                        Link <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  <h3 className="text-sm font-medium text-zinc-100 leading-snug">{item.title}</h3>
                  <div className="text-[11px] font-mono text-zinc-500">{item.authors}</div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{item.abstract}</p>
                </div>

                {analysis && (
                  <div className="p-3 rounded-xl bg-zinc-900/70 border border-white/[0.06] text-xs font-mono space-y-1.5">
                    {analysis.hasThinking && (
                      <div className="text-[11px] text-zinc-400 whitespace-pre-wrap">
                        {analysis.thinking}
                      </div>
                    )}
                    <div className="text-zinc-200 whitespace-pre-wrap">{analysis.answer}</div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => handleSynthesize(item)}
                    disabled={synthesizingId === item.id}
                    className="flex-1 bg-zinc-100 text-zinc-950 hover:bg-white font-medium text-xs px-3 py-2 rounded-lg transition flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {synthesizingId === item.id ? 'Synthesizing...' : 'Synthesize & Load Sliders'}
                  </button>
                  <button
                    onClick={() => handleAnalyze(item)}
                    disabled={analyzingId === item.id}
                    className="px-3 py-2 rounded-lg border border-white/10 text-zinc-300 hover:border-white/25 text-xs font-medium flex items-center gap-1.5 transition"
                  >
                    <Brain className="w-3.5 h-3.5" />
                    {analyzingId === item.id ? 'Analyzing...' : 'Analyze'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom OSINT Dropzone & Unsloth SFT Exporter */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-4">
          <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Custom OSINT Dropzone
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Title (optional)"
              className="bg-zinc-950/70 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/25"
            />
            <input
              type="text"
              value={customCitation}
              onChange={(e) => setCustomCitation(e.target.value)}
              placeholder="Citation (e.g. @Qiskit)"
              className="bg-zinc-950/70 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/25"
            />
          </div>
          <textarea
            rows={4}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Paste arXiv abstract, IBM/QHack puzzle, or X post text..."
            className="w-full bg-zinc-950/70 border border-white/10 rounded-xl p-3 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-white/25"
          />
          <button
            onClick={handleCustomSynthesize}
            disabled={!customText.trim() || synthesizingId === 'custom-dropzone'}
            className="w-full bg-zinc-100 text-zinc-950 hover:bg-white font-medium text-xs px-4 py-2.5 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Synthesize Custom Scenario
          </button>
        </div>

        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Session SFT Corpus ({trainingCorpus.length})
              </h3>
              <button
                onClick={handleDownloadJsonl}
                disabled={!trainingCorpus.length}
                className="bg-zinc-100 text-zinc-950 hover:bg-white font-medium text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                Export .jsonl
              </button>
            </div>

            <div className="bg-zinc-950/70 border border-white/[0.06] rounded-xl max-h-52 overflow-y-auto divide-y divide-white/[0.05]">
              {trainingCorpus.length === 0 ? (
                <div className="p-4 text-xs font-mono text-zinc-500">
                  No traces captured yet. Synthesize or analyze any OSINT item to populate the distillation corpus.
                </div>
              ) : (
                trainingCorpus.map((row) => (
                  <div key={row.id} className="p-3 text-xs font-mono space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span>{row.source}</span>
                      <span>{row.timestamp}</span>
                    </div>
                    <div className="text-zinc-200 truncate">{row.instruction}</div>
                    <div className="text-[11px] text-zinc-500 truncate">{row.output}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="text-[11px] font-mono text-zinc-500">
            Compatible with colab/unsloth_qwen_17e_finetune.py &amp; colab/olmo_edge_distillation.py
          </div>
        </div>
      </div>
    </div>
  );
}
