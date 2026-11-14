# Q-SPECTRA // 17E Quantum CEMA & EMS Workbench — Product Roadmap
**Lead Product Designer & Architect:** Gemini  
**Lead Implementation & Engineering Agent:** Antigravity  
**Domain:** US Army MOS 17E (Electronic Warfare Specialist) — Transitioning from Classical RF/EMS to Quantum CEMA (Rydberg ES, Quantum Illumination EP, Cold-Atom PNT/MagNav)

---

## 1. Product Vision & North Star
Traditional Electronic Warfare relies on metallic antennas, superheterodyne receivers, GaAs/GaN Low-Noise Amplifiers (LNAs), and satellite-dependent GPS—all of which are vulnerable to High-Power Microwave (HPM) front-end burnout, Digital Radio Frequency Memory (DRFM) deceptive jamming, and L1/L2 GPS spoofing.

**Q-SPECTRA** is an interactive, GPU-backed Quantum CEMA Workbench and Training Arena powered by a fine-tuned **Qwen 3.8 27B** model (trained via **Unsloth QLoRA** and served via **Ollama / Colab MCP** or **Hugging Face Pro**).

---

## 2. Phased Architecture & Feature Roadmap

### Phase 1: MVP Foundation (Current Build v1.0 — Included in ZIP)
- **01 // Rydberg Atomic RF Sensor Lab (Quantum ES):** Interactive $n=30–90$ $^{85}	ext{Rb}$ and $^{133}	ext{Cs}$ vapor cell simulator computing Autler-Townes splitting ($\Delta f_{	ext{AT}} = \mu E / h$), transition dipole moments, and HPM/EMP survivability vs. classical LNA burnout.
- **02 // Quantum Illumination Radar Lab (Quantum EP):** Spontaneous Parametric Down-Conversion (SPDC) entangled Signal-Idler SNR calculator with active Counter-DRFM spoofing rejection.
- **03 // GPS-Denied Quantum PNT & MagNav Simulator:** Radial CEP drift comparator contrasting spoofed GPS, drifting ring-laser INS, and Cold-Atom Interferometry + NV-Diamond Crustal Magnetic Anomaly matching.
- **04 // 17E Challenge Arena & Qwen 3.8 27B Co-Pilot:** 4 MOS-aligned tactical physics challenges + live LLM inference bridge.
- **05 // Unsloth + Ollama Colab Pipeline:** Ready-to-run Python training & GGUF export script.

### Phase 2: Antigravity Sprint 1 — Live QuTiP Lindblad Master Equation Backend & WebSocket Telemetry
- **FastAPI Physics Microservice (`/api/physics/rydberg`):** Replace analytical Lorentzian approximations with an exact 4-level ladder Hamiltonian solved via `qutip.mesolve()` on the Colab GPU backend, returning real-time density matrix $ho_{12}$ probe absorption spectra.
- **Interactive Waterfall Spectrogram & IQ Constellation View:** Add a 60fps WebGL/Canvas waterfall spectrogram in Tab 01 and Tab 02 showing frequency-hopping LPI/LPD emitters and DRFM false-target ghosts being filtered out when Quantum Idler Correlation is toggled ON.

### Phase 3: Antigravity Sprint 2 — OLMo ↔ Qwen 3.8 27B Distillation & Automated Grading Loop
- **Teacher-Student CEMA Distillation Pipeline:** Use Qwen 3.8 27B to synthesize 2,500 verified 17E Quantum EW reasoning traces (`<think>...</think>`) and distill them into a compact local **OLMo** checkpoint for disconnected tactical edge deployment.
- **Dynamic Scenario Generator:** Allow Qwen 3.8 27B to emit structured JSON mission scenarios that dynamically mutate the sliders, threat emitters, and challenge tolerances inside the React frontend.

### Phase 4: Antigravity Sprint 3 — Multi-Emitter 3D Theatre Map & Hardware-in-the-Loop SDR Ingest
- **3D Contested EMS Theatre Map (Three.js / Deck.gl):** Plot friendly 17E Rydberg sensor nodes, enemy HPM jammers, and MagNav flight corridors over digital elevation models.
- **SDR IQ File Ingest (`.sigmf` / `.iq`):** Allow users to drag-and-drop real RF captures and benchmark classical FFT detection against simulated Rydberg atomic demodulation.
