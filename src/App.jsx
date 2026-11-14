import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { computeRydbergSplitting, computeQuantumIlluminationSNR } from './physics/quantumModels';
import RydbergLab from './components/RydbergLab';
import QuantumRadarLab from './components/QuantumRadarLab';
import QuantumPntLab from './components/QuantumPntLab';
import ChallengeArena from './components/ChallengeArena';
import InferenceHub from './components/InferenceHub';
import QuantumIntelFeed from './components/QuantumIntelFeed';
import TheatreMap3D from './components/TheatreMap3D';

const TABS = [
  { id: 'rydberg', label: 'Rydberg', shortcut: '1' },
  { id: 'radar', label: 'Radar', shortcut: '2' },
  { id: 'pnt', label: 'MagNav', shortcut: '3' },
  { id: 'theatre3d', label: 'Theatre', shortcut: '4' },
  { id: 'arena', label: 'Arena', shortcut: '5' },
  { id: 'intel', label: 'OSINT', shortcut: '6' },
  { id: 'hub', label: 'Models', shortcut: '7' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('rydberg');

  // Tab 1: Rydberg state
  const [species, setSpecies] = useState('Rb85');
  const [vaporRegime, setVaporRegime] = useState('thermal_300k');
  const [nPrincipal, setNPrincipal] = useState(58);
  const [rfPowerDbm, setRfPowerDbm] = useState(-15);
  const [rfFreqGhz, setRfFreqGhz] = useState(14.2);
  const [hpmPulseActive, setHpmPulseActive] = useState(false);

  // Tab 2: Quantum Radar state
  const [nsPhotons, setNsPhotons] = useState(0.02);
  const [nbThermal, setNbThermal] = useState(1200);
  const [kappaReflectivity, setKappaReflectivity] = useState(0.01);
  const [mModesExp, setMModesExp] = useState(6);
  const [drfmSpoofActive, setDrfmSpoofActive] = useState(true);
  const [quantumIdlerCorrelation, setQuantumIdlerCorrelation] = useState(true);

  // Tab 3: Quantum PNT & MagNav state
  const [missionHours, setMissionHours] = useState(2.5);
  const [gpsSpoofDb, setGpsSpoofDb] = useState(30);
  const [magNavLock, setMagNavLock] = useState(true);

  // Tab 7 / Tab 5: Inference & FastAPI Bridge config
  const [inferenceMode, setInferenceMode] = useState('offline');
  const [backendUrl, setBackendUrl] = useState('http://localhost:8000');
  const [useBackendProxy, setUseBackendProxy] = useState(true);
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('qwen-17e-cema');
  const [hfToken, setHfToken] = useState('');
  const [hfModel, setHfModel] = useState('Qwen/Qwen2.5-32B-Instruct');

  // Dynamic OSINT Challenges, Training Corpus, & Tactical Toast
  const [dynamicChallenges, setDynamicChallenges] = useState([]);
  const [activeChallengeId, setActiveChallengeId] = useState(null);
  const [trainingCorpus, setTrainingCorpus] = useState([]);
  const [toastMsg, setToastMsg] = useState(null);

  // Keyboard shortcuts 1-7 when not typing in an input
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < TABS.length) {
        setActiveTab(TABS[idx].id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const dispatchScenario = useCallback((payload = {}) => {
    const ov = payload.telemetryOverride || payload;
    if (ov.rydberg) {
      if (ov.rydberg.species !== undefined) setSpecies(ov.rydberg.species);
      if (ov.rydberg.nPrincipal !== undefined) setNPrincipal(Number(ov.rydberg.nPrincipal));
      if (ov.rydberg.rfPowerDbm !== undefined) setRfPowerDbm(Number(ov.rydberg.rfPowerDbm));
      if (ov.rydberg.rfFreqGhz !== undefined) setRfFreqGhz(Number(ov.rydberg.rfFreqGhz));
      if (ov.rydberg.hpmPulseActive !== undefined) setHpmPulseActive(Boolean(ov.rydberg.hpmPulseActive));
    }
    if (ov.radar) {
      if (ov.radar.nsPhotons !== undefined) setNsPhotons(Number(ov.radar.nsPhotons));
      if (ov.radar.nbThermal !== undefined) setNbThermal(Number(ov.radar.nbThermal));
      if (ov.radar.kappaReflectivity !== undefined) setKappaReflectivity(Number(ov.radar.kappaReflectivity));
      if (ov.radar.mModesExp !== undefined) setMModesExp(Number(ov.radar.mModesExp));
      if (ov.radar.drfmSpoofActive !== undefined) setDrfmSpoofActive(Boolean(ov.radar.drfmSpoofActive));
      if (ov.radar.quantumIdlerCorrelation !== undefined) {
        setQuantumIdlerCorrelation(Boolean(ov.radar.quantumIdlerCorrelation));
      }
    }
    if (ov.pnt) {
      if (ov.pnt.missionHours !== undefined) setMissionHours(Number(ov.pnt.missionHours));
      if (ov.pnt.gpsSpoofDb !== undefined) setGpsSpoofDb(Number(ov.pnt.gpsSpoofDb));
      if (ov.pnt.magNavLock !== undefined) setMagNavLock(Boolean(ov.pnt.magNavLock));
    }
    if (payload.challenge) {
      setDynamicChallenges((prev) => [payload.challenge, ...prev]);
      setActiveChallengeId(payload.challenge.id);
    }
    if (payload.targetTab) {
      setActiveTab(payload.targetTab);
    }
    if (payload.toastText) {
      setToastMsg(payload.toastText);
      setTimeout(() => setToastMsg(null), 4000);
    }
  }, []);

  // Derived physics telemetry
  const effectivePowerDbm = hpmPulseActive ? 28 : rfPowerDbm;
  const rydbergStats = useMemo(
    () => computeRydbergSplitting(nPrincipal, effectivePowerDbm, species, vaporRegime),
    [nPrincipal, effectivePowerDbm, species, vaporRegime]
  );

  const radarStats = useMemo(
    () =>
      computeQuantumIlluminationSNR(
        nsPhotons,
        nbThermal,
        kappaReflectivity,
        Math.pow(10, mModesExp),
        drfmSpoofActive
      ),
    [nsPhotons, nbThermal, kappaReflectivity, mModesExp, drfmSpoofActive]
  );

  const classicalInsDriftMeters = (1850 * Math.pow(missionHours, 1.45)).toFixed(0);
  const gpsSpoofedErrorMeters = (gpsSpoofDb * 145).toFixed(0);
  const quantumPntErrorMeters = magNavLock
    ? (4.2 + Math.sin(missionHours) * 0.4).toFixed(1)
    : (12.5 * missionHours).toFixed(1);

  const missionTelemetry = useMemo(
    () => ({
      rydberg: {
        species,
        vaporRegime,
        nPrincipal,
        rfPowerDbm,
        effectivePowerDbm,
        rfFreqGhz,
        hpmPulseActive,
        ...rydbergStats
      },
      radar: {
        nsPhotons,
        nbThermal,
        kappaReflectivity,
        mModesExp,
        drfmSpoofActive,
        quantumIdlerCorrelation,
        ...radarStats
      },
      pnt: {
        missionHours,
        gpsSpoofDb,
        magNavLock,
        classicalInsDriftMeters,
        gpsSpoofedErrorMeters,
        quantumPntErrorMeters
      }
    }),
    [
      species,
      nPrincipal,
      rfPowerDbm,
      effectivePowerDbm,
      rfFreqGhz,
      hpmPulseActive,
      rydbergStats,
      nsPhotons,
      nbThermal,
      kappaReflectivity,
      mModesExp,
      drfmSpoofActive,
      quantumIdlerCorrelation,
      radarStats,
      missionHours,
      gpsSpoofDb,
      magNavLock,
      classicalInsDriftMeters,
      gpsSpoofedErrorMeters,
      quantumPntErrorMeters
    ]
  );

  const modeLabel =
    inferenceMode === 'ollama' ? 'Ollama' : inferenceMode === 'hf_pro' ? 'HF Pro' : 'Offline';
  const checkpointLabel = ollamaModel.includes('olmo') ? 'OLMo-7B' : 'Qwen-27B';

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans selection:bg-sky-500/20 selection:text-sky-200">
      {/* Ultra-Clean Single-Row Top Bar */}
      <header className="h-14 px-6 border-b border-white/[0.06] bg-[#09090b]/85 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between gap-4">
        {/* Left: Minimalist Wordmark */}
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-sm font-semibold tracking-tight text-zinc-100">Q-SPECTRA</span>
          <span className="text-[10px] font-mono text-zinc-400 border border-white/10 px-1.5 py-0.5 rounded">
            17E
          </span>
        </div>

        {/* Center: Segmented Pill Navigation */}
        <nav className="bg-zinc-900/80 p-1 rounded-full border border-white/[0.06] flex items-center gap-0.5 overflow-x-auto max-w-full">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                title={`Press ${tab.shortcut}`}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Right: Compact Live Status Dot */}
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-zinc-400 shrink-0">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              inferenceMode === 'offline' ? 'bg-zinc-400' : 'bg-emerald-400 animate-pulse'
            }`}
          />
          <span className="text-zinc-300">{modeLabel}</span>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-400">{checkpointLabel}</span>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {toastMsg && (
          <div className="mb-6 px-4 py-2.5 rounded-xl bg-zinc-900/80 backdrop-blur-md border border-white/[0.08] text-zinc-200 text-xs font-mono flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              {toastMsg}
            </span>
            <button
              onClick={() => setActiveTab('arena')}
              className="px-3 py-1 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white font-sans font-medium text-xs transition"
            >
              Open Arena
            </button>
          </div>
        )}

        {activeTab === 'rydberg' && (
          <RydbergLab
            species={species}
            setSpecies={setSpecies}
            vaporRegime={vaporRegime}
            setVaporRegime={setVaporRegime}
            nPrincipal={nPrincipal}
            setNPrincipal={setNPrincipal}
            rfPowerDbm={rfPowerDbm}
            setRfPowerDbm={setRfPowerDbm}
            rfFreqGhz={rfFreqGhz}
            setRfFreqGhz={setRfFreqGhz}
            hpmPulseActive={hpmPulseActive}
            setHpmPulseActive={setHpmPulseActive}
            effectivePowerDbm={effectivePowerDbm}
            rydbergStats={rydbergStats}
            backendUrl={backendUrl}
          />
        )}

        {activeTab === 'radar' && (
          <QuantumRadarLab
            nsPhotons={nsPhotons}
            setNsPhotons={setNsPhotons}
            nbThermal={nbThermal}
            setNbThermal={setNbThermal}
            kappaReflectivity={kappaReflectivity}
            setKappaReflectivity={setKappaReflectivity}
            mModesExp={mModesExp}
            setMModesExp={setMModesExp}
            drfmSpoofActive={drfmSpoofActive}
            setDrfmSpoofActive={setDrfmSpoofActive}
            quantumIdlerCorrelation={quantumIdlerCorrelation}
            setQuantumIdlerCorrelation={setQuantumIdlerCorrelation}
            radarStats={radarStats}
          />
        )}

        {activeTab === 'pnt' && (
          <QuantumPntLab
            missionHours={missionHours}
            setMissionHours={setMissionHours}
            gpsSpoofDb={gpsSpoofDb}
            setGpsSpoofDb={setGpsSpoofDb}
            magNavLock={magNavLock}
            setMagNavLock={setMagNavLock}
            gpsSpoofedErrorMeters={gpsSpoofedErrorMeters}
            classicalInsDriftMeters={classicalInsDriftMeters}
            quantumPntErrorMeters={quantumPntErrorMeters}
          />
        )}

        {activeTab === 'theatre3d' && (
          <TheatreMap3D telemetry={missionTelemetry} dispatchScenario={dispatchScenario} />
        )}

        {activeTab === 'arena' && (
          <ChallengeArena
            inferenceMode={inferenceMode}
            backendUrl={backendUrl}
            useBackendProxy={useBackendProxy}
            ollamaUrl={ollamaUrl}
            ollamaModel={ollamaModel}
            hfToken={hfToken}
            hfModel={hfModel}
            telemetry={missionTelemetry}
            dynamicChallenges={dynamicChallenges}
            activeChallengeId={activeChallengeId}
            dispatchScenario={dispatchScenario}
          />
        )}

        {activeTab === 'intel' && (
          <QuantumIntelFeed
            backendUrl={backendUrl}
            inferenceMode={inferenceMode}
            ollamaUrl={ollamaUrl}
            ollamaModel={ollamaModel}
            hfToken={hfToken}
            hfModel={hfModel}
            telemetry={missionTelemetry}
            dispatchScenario={dispatchScenario}
            trainingCorpus={trainingCorpus}
            setTrainingCorpus={setTrainingCorpus}
          />
        )}

        {activeTab === 'hub' && (
          <InferenceHub
            inferenceMode={inferenceMode}
            setInferenceMode={setInferenceMode}
            backendUrl={backendUrl}
            setBackendUrl={setBackendUrl}
            useBackendProxy={useBackendProxy}
            setUseBackendProxy={setUseBackendProxy}
            ollamaUrl={ollamaUrl}
            setOllamaUrl={setOllamaUrl}
            ollamaModel={ollamaModel}
            setOllamaModel={setOllamaModel}
            hfToken={hfToken}
            setHfToken={setHfToken}
            hfModel={hfModel}
            setHfModel={setHfModel}
          />
        )}
      </main>
    </div>
  );
}
