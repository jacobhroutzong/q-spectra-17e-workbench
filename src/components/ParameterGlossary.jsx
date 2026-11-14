import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';

const GLOSSARY_ENTRIES = [
  {
    symbol: 'n',
    name: 'Principal Quantum Number',
    unit: 'Dimensionless (25–110)',
    category: 'Rydberg',
    definition:
      'Shell index of the excited valence electron in Rb-85 or Cs-133. Higher n places the electron farther from the nucleus, creating a giant electric dipole antenna.',
    sliderEffect:
      'Increasing n scales the RF transition dipole moment as n², enlarging Autler-Townes splitting and improving weak-field RF sensitivity.',
  },
  {
    symbol: 'Δf_AT',
    name: 'Autler-Townes Splitting',
    unit: 'MHz',
    category: 'Rydberg',
    definition:
      'Frequency separation between the |−⟩ and |+⟩ dressed EIT transmission peaks induced by an incident RF field: Δf_AT = (d · E_RF) / h.',
    sliderEffect:
      'Higher RF power or higher n widens Δf_AT linearly with electric-field amplitude E_RF (V/m), making the doublet easier to resolve above linewidth Γ.',
  },
  {
    symbol: 'Γ / Regime',
    name: 'EIT Linewidth & Vapor Cell Regime',
    unit: 'MHz (300 K vs 100 μK)',
    category: 'Rydberg',
    definition:
      'Spectral width of the optical probe transmission window. Room-temperature 300 K cells suffer Doppler broadening (~6.2 MHz), while laser-cooled MOT cells reach ~0.6 MHz.',
    sliderEffect:
      'Switching to MOT (100 μK) narrows Γ by ~10×, resolving weak RF doublets that remain blurred inside a thermal vapor cell.',
  },
  {
    symbol: '+15 dBm',
    name: 'Classical LNA Burnout vs. Rydberg Resilience',
    unit: 'dBm',
    category: 'Rydberg',
    definition:
      'Front-end saturation and physical damage threshold for conventional GaAs low-noise amplifiers during High-Power Microwave (HPM) / EMP pulses.',
    sliderEffect:
      'Above +15 dBm, the classical superheterodyne front-end clips and blinds, whereas the glass atomic vapor cell continues linear optical readout.',
  },
  {
    symbol: 'Ns',
    name: 'Signal Photons per Mode',
    unit: 'Photons / mode (≪ 1)',
    category: 'Radar',
    definition:
      'Mean number of entangled signal photons transmitted per time-bandwidth mode in Quantum Illumination radar.',
    sliderEffect:
      'Keeping Ns ≪ 1 maintains low-probability-of-intercept (LPI) stealth operation while preserving entanglement correlation with the retained idler.',
  },
  {
    symbol: 'Nb',
    name: 'Thermal Background Clutter',
    unit: 'Photons / mode',
    category: 'Radar',
    definition:
      'Ambient thermal noise and broadband jamming photons per mode competing with the weak target echo.',
    sliderEffect:
      'As Nb grows large (Nb ≫ 1), classical coherent radar SNR degrades rapidly, whereas Quantum Illumination retains up to a 6.02 dB (4×) error-exponent advantage.',
  },
  {
    symbol: 'M',
    name: 'Time-Bandwidth Entangled Modes',
    unit: '10^M modes',
    category: 'Radar',
    definition:
      'Total number of entangled signal-idler photon pairs integrated over the radar dwell time and optical bandwidth.',
    sliderEffect:
      'Increasing M linearly boosts post-integration SNR for both classical and quantum receivers without raising peak transmit power.',
  },
  {
    symbol: 'κ',
    name: 'Target Reflectivity',
    unit: 'Ratio (0.001–0.10)',
    category: 'Radar',
    definition:
      'Fraction of transmitted radar power reflected back by a low-observable (stealth) airframe toward the receiver.',
    sliderEffect:
      'Lower κ models smaller radar cross-sections (RCS), requiring higher mode count M or quantum idler correlation to detect.',
  },
  {
    symbol: 'CEP',
    name: 'Circular Error Probable (INS vs. MagNav)',
    unit: 'Meters',
    category: 'MagNav',
    definition:
      'Radius within which 50% of navigation position estimates fall. Uncalibrated inertial navigation (INS) drifts with mission duration, while GPS is vulnerable to jamming/spoofing.',
    sliderEffect:
      'Enabling Quantum MagNav Lock bounds position error to ~4 m regardless of mission hours or GPS jamming power.',
  },
  {
    symbol: 'F',
    name: 'Quantum State & Gate Fidelity',
    unit: 'Percentage (%)',
    category: 'Coding',
    definition:
      'Overlap between the noisy physical quantum state produced by a circuit and the ideal target state |ψ⟩, degraded by single- and two-qubit depolarizing gate errors.',
    sliderEffect:
      'Increasing circuit depth (especially 2-qubit CNOT/Toffoli gates) or raising depolarizing noise ε lowers final circuit fidelity F.',
  },
  {
    symbol: 'QBER',
    name: 'Quantum Bit Error Rate',
    unit: 'Percentage (%)',
    category: 'QKD',
    definition:
      'Fraction of mismatched bits between Alice and Bob after BB84 basis sifting. Under the Shor-Preskill bound, QBER ≥ 11.0% indicates potential eavesdropping.',
    sliderEffect:
      'Toggling Eve Intercept-Resend injects ~25% QBER via measurement basis collapse, triggering automatic key abort.',
  },
];

const CATEGORIES = ['All', 'Rydberg', 'Radar', 'MagNav', 'Coding', 'QKD'];

export default function ParameterGlossary({ isOpen, onClose, activeTab }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    const mapTabToCat = {
      rydberg: 'Rydberg',
      radar: 'Radar',
      pnt: 'MagNav',
      coding: 'Coding',
      crypto: 'QKD',
    };
    if (isOpen && mapTabToCat[activeTab]) {
      setCategory(mapTabToCat[activeTab]);
    }
  }, [isOpen, activeTab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GLOSSARY_ENTRIES.filter((entry) => {
      const catOk = category === 'All' || entry.category === category;
      if (!catOk) return false;
      if (!q) return true;
      return (
        entry.symbol.toLowerCase().includes(q) ||
        entry.name.toLowerCase().includes(q) ||
        entry.definition.toLowerCase().includes(q) ||
        entry.sliderEffect.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/65 backdrop-blur-sm transition-opacity"
      />

      {/* Side-Sliding Drawer */}
      <aside className="relative z-10 w-full max-w-md h-full bg-[#09090b] border-l border-white/[0.08] flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-sky-400" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Parameter Glossary &amp; Physics Guide
              </h2>
              <p className="text-[11px] font-mono text-zinc-400">
                Plain-English slider &amp; telemetry reference
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close glossary"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="p-4 border-b border-white/[0.06] space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search symbol or term (e.g. QBER, CEP, Ns)..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900/80 border border-white/[0.08] text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-sky-400/50"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition ${
                  category === cat
                    ? 'bg-zinc-100 text-zinc-950 border-zinc-100 font-semibold'
                    : 'bg-zinc-900/60 text-zinc-400 border-white/[0.07] hover:text-zinc-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-xs font-mono text-zinc-500">
              No matching parameters found.
            </div>
          ) : (
            filtered.map((entry) => (
              <div
                key={entry.symbol}
                className="p-4 rounded-xl bg-zinc-900/50 border border-white/[0.07] space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/30 text-sky-300 font-mono text-xs font-semibold">
                        {entry.symbol}
                      </span>
                      <span className="text-xs font-semibold text-zinc-100">
                        {entry.name}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500 mt-1">
                      Unit: {entry.unit}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400 border border-white/[0.07] px-1.5 py-0.5 rounded">
                    {entry.category}
                  </span>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed">{entry.definition}</p>

                <div className="pt-1.5 border-t border-white/[0.05] text-[11px] text-zinc-400 leading-relaxed">
                  <span className="text-emerald-400 font-mono mr-1.5">SLIDER EFFECT:</span>
                  {entry.sliderEffect}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
