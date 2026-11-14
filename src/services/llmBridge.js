/**
 * Hybrid Inference & Physics Bridge for Q-SPECTRA (Qwen 3.8 27B + FastAPI)
 * Supports:
 * 1. FastAPI Backend Proxy (/api/chat) -> Ollama or Hugging Face Pro (avoids browser CORS)
 * 2. Direct Ollama / HF Pro fallback
 * 3. Deterministic Tactical Fallback (Offline 17E CEMA Reference Engine with live telemetry)
 */

export function parseThinkBlocks(rawText = '') {
  const regex = /<think>([\s\S]*?)<\/think>/gi;
  const matches = [];
  let match;
  while ((match = regex.exec(rawText)) !== null) {
    if (match[1]?.trim()) {
      matches.push(match[1].trim());
    }
  }
  const thinking = matches.join('\n\n');
  const answer = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  return {
    raw: rawText,
    thinking,
    answer: answer || rawText.trim(),
    hasThinking: matches.length > 0
  };
}

export function formatTelemetryContext(telemetry) {
  if (!telemetry) return '';
  const { rydberg, radar, pnt } = telemetry;
  return [
    '[LIVE MISSION TELEMETRY SNAPSHOT]',
    rydberg
      ? `Rydberg ES: species=${rydberg.species}, n=${rydberg.nPrincipal}, power=${rydberg.effectivePowerDbm} dBm @ ${rydberg.rfFreqGhz} GHz, HPM=${rydberg.hpmPulseActive ? 'ACTIVE' : 'OFF'}, splitting=${rydberg.splittingMHz} MHz, E=${rydberg.eFieldVm} V/m, LNA_Burnout=${rydberg.lnaBurnout}`
      : '',
    radar
      ? `Quantum EP Radar: Ns=${radar.nsPhotons}, Nb=${radar.nbThermal}, kappa=${radar.kappaReflectivity}, M=1e${radar.mModesExp}, DRFM_Spoof=${radar.drfmSpoofActive ? 'ACTIVE' : 'OFF'}, Idler_Correlation=${radar.quantumIdlerCorrelation ? 'ON' : 'OFF'}, Classical_SNR=${radar.classicalSnrDb} dB, Quantum_SNR=${radar.quantumSnrDb} dB (+${radar.advantageDb} dB)`
      : '',
    pnt
      ? `Quantum PNT/MagNav: duration=${pnt.missionHours} hrs, GPS_Spoof=${pnt.gpsSpoofDb} dB, MagNav_Lock=${pnt.magNavLock ? 'ENGAGED' : 'OFF'}, Spoofed_GPS_Err=${pnt.gpsSpoofedErrorMeters} m, Classical_INS_Drift=${pnt.classicalInsDriftMeters} m, Quantum_PNT_CEP=${pnt.quantumPntErrorMeters} m`
      : ''
  ]
    .filter(Boolean)
    .join('\n');
}

export async function queryQwenCemaCoPilot({
  prompt,
  mode = 'offline', // 'ollama' | 'hf_pro' | 'offline'
  backendUrl = 'http://localhost:8000',
  useBackendProxy = true,
  ollamaUrl = 'http://localhost:11434',
  ollamaModel = 'qwen-17e-cema',
  hfToken = '',
  hfModel = 'Qwen/Qwen2.5-32B-Instruct',
  telemetry = null,
  systemContext = 'You are Q-SPECTRA, an elite US Army 17E Electronic Warfare & Quantum Physics AI Co-Pilot fine-tuned via Unsloth.'
}) {
  const telemetryText = formatTelemetryContext(telemetry);
  const fullSystemContext = telemetryText
    ? `${systemContext}\n\n${telemetryText}`
    : systemContext;

  // Attempt FastAPI /api/chat proxy first when enabled
  if (useBackendProxy && backendUrl) {
    try {
      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          mode,
          ollama_url: ollamaUrl,
          ollama_model: ollamaModel,
          hf_token: hfToken,
          hf_model: hfModel,
          system_context: systemContext,
          telemetry
        })
      });
      if (res.ok) {
        const data = await res.json();
        return {
          raw: data.raw_content || '',
          thinking: data.thinking || '',
          answer: data.answer || data.raw_content || '',
          hasThinking: Boolean(data.has_thinking),
          viaBackend: true,
          mode: data.mode || mode
        };
      }
      if (mode !== 'offline') {
        const errText = await res.text();
        throw new Error(`Backend Proxy HTTP ${res.status}: ${errText}`);
      }
    } catch (err) {
      // If offline mode and backend isn't running, fall through to local deterministic fallback
      if (mode !== 'offline' && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }
  }

  if (mode === 'ollama') {
    const res = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        stream: false,
        messages: [
          { role: 'system', content: fullSystemContext },
          { role: 'user', content: prompt }
        ]
      })
    });
    if (!res.ok) throw new Error(`Ollama Bridge HTTP ${res.status}`);
    const data = await res.json();
    const raw = data.message?.content || 'No response from Ollama endpoint.';
    return { ...parseThinkBlocks(raw), viaBackend: false, mode };
  }

  if (mode === 'hf_pro') {
    if (!hfToken) throw new Error('Hugging Face Pro API token required.');
    const res = await fetch(`https://api-inference.huggingface.co/models/${hfModel}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: hfModel,
        messages: [
          { role: 'system', content: fullSystemContext },
          { role: 'user', content: prompt }
        ],
        max_tokens: 700,
        temperature: 0.3
      })
    });
    if (!res.ok) throw new Error(`HF Pro Endpoint HTTP ${res.status}`);
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || 'No completion returned.';
    return { ...parseThinkBlocks(raw), viaBackend: false, mode };
  }

  // Offline deterministic fallback with live telemetry awareness & <think> reasoning trace
  await new Promise((r) => setTimeout(r, 320));
  const ryd = telemetry?.rydberg;
  const rad = telemetry?.radar;
  const pnt = telemetry?.pnt;

  const raw = `<think>
1. Analyzing 17E CEMA query against SI-traceable quantum sensing constraints.
2. Live Rydberg state: ${ryd ? `${ryd.species} n=${ryd.nPrincipal}, ${ryd.effectivePowerDbm} dBm @ ${ryd.rfFreqGhz} GHz -> Δf_AT=${ryd.splittingMHz} MHz` : 'nominal'}.
3. Live Radar state: ${rad ? `Ns=${rad.nsPhotons}, Nb=${rad.nbThermal}, DRFM=${rad.drfmSpoofActive}, Advantage=+${rad.advantageDb} dB` : 'nominal'}.
4. Live PNT state: ${pnt ? `t=${pnt.missionHours}h, MagNav=${pnt.magNavLock}, CEP=${pnt.quantumPntErrorMeters}m` : 'nominal'}.
</think>
**Tactical Assessment (Qwen 3.8 27B 17E-CEMA Offline Reference):**
- **Rydberg Atomic ES:** ${ryd ? `With ${ryd.species} tuned to $n=${ryd.nPrincipal}$ at ${ryd.effectivePowerDbm} dBm (${ryd.rfFreqGhz} GHz), Autler-Townes splitting is **${ryd.splittingMHz} MHz** (${ryd.eFieldVm} V/m). Classical GaAs LNA status: **${ryd.lnaBurnout ? 'BURNOUT / SATURATED' : 'NOMINAL'}**, while the dielectric vapor cell remains survivable.` : 'Tuning to n=68 provides wideband SI-traceable optical readout without LNA burnout.'}
- **Quantum EP Counter-DRFM:** ${rad ? `At $N_b=${rad.nbThermal}$ thermal photons/mode, SPDC joint-detection yields **+${rad.advantageDb} dB** SNR advantage and ${rad.drfmSpoofActive ? 'actively suppresses the 4 uncorrelated DRFM ghost targets.' : 'ready to reject DRFM spoofing.'}` : 'Retaining the entangled idler mode rejects uncorrelated DRFM repeater spoofing.'}
- **Contested PNT / MagNav:** ${pnt ? `At ${pnt.missionHours} hrs under +${pnt.gpsSpoofDb} dB GPS spoofing, Cold-Atom INS + NV-Diamond MagNav (${pnt.magNavLock ? 'LOCKED' : 'UNLOCKED'}) holds **${pnt.quantumPntErrorMeters} m CEP** vs. ${pnt.classicalInsDriftMeters} m classical INS drift.` : 'Crustal magnetic anomaly matching bounds CEP drift.'}`;

  return { ...parseThinkBlocks(raw), viaBackend: false, mode: 'offline' };
}

export async function fetchRydbergMasterEq(backendUrl, params) {
  const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/physics/rydberg-master-eq`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    throw new Error(`Master Eq HTTP ${res.status}`);
  }
  return res.json();
}
