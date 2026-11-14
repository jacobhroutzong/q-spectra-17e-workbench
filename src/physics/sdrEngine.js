/**
 * Q-SPECTRA Client-Side SDR DSP Engine
 * Pure JavaScript Radix-2 FFT + Hann window + Envelope Detector mirroring backend/sdr_processor.py.
 * Provides zero-latency offline fallback for .iq / .sigmf-data files and synthetic threat waveforms.
 */

import { BOHR_RADIUS, ELEMENTARY_CHARGE, PLANCK_H } from './quantumModels';

/**
 * In-place Radix-2 Cooley-Tukey FFT (N must be power of 2).
 */
export function fftRadix2(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wLenRe = Math.cos(ang);
    const wLenIm = Math.sin(ang);

    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const idx = i + j + half;
        const vRe = re[idx] * wRe - im[idx] * wIm;
        const vIm = re[idx] * wIm + im[idx] * wRe;

        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[idx] = uRe - vRe;
        im[idx] = uIm - vIm;

        const nextWRe = wRe * wLenRe - wIm * wLenIm;
        wIm = wRe * wLenIm + wIm * wLenRe;
        wRe = nextWRe;
      }
    }
  }
}

function gaussianNoise() {
  const u1 = Math.max(1e-7, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

export function generateSyntheticIqClient(
  waveformType = 'lpi_fhss',
  snrDb = 15.0,
  sampleRateMhz = 120.0,
  numSamples = 4608
) {
  const re = new Float32Array(numSamples);
  const im = new Float32Array(numSamples);
  const dt = 1.0 / (sampleRateMhz * 1e6);
  const noiseSigma = Math.pow(10, -snrDb / 20.0) / Math.SQRT2;

  let nominalPeakDbm = 0.0;
  const hopFreqs = [-42e6, -18e6, 26e6, -31e6, 44e6, 11e6, -8e6, 35e6];
  const hopLen = Math.floor(numSamples / hopFreqs.length);
  const totalDur = numSamples * dt;

  for (let i = 0; i < numSamples; i++) {
    const t = i * dt;
    let sRe = 0;
    let sIm = 0;

    if (waveformType === 'lpi_fhss') {
      const hopIdx = Math.min(hopFreqs.length - 1, Math.floor(i / hopLen));
      const ph = 2 * Math.PI * hopFreqs[hopIdx] * t;
      sRe = 0.85 * Math.cos(ph);
      sIm = 0.85 * Math.sin(ph);
      nominalPeakDbm = -8.0;
    } else if (waveformType === 'lfm_chirp') {
      const bw = 96e6;
      const k = bw / totalDur;
      const ph = 2 * Math.PI * (-bw * 0.5 * t + 0.5 * k * t * t);
      sRe = Math.cos(ph);
      sIm = Math.sin(ph);
      nominalPeakDbm = 2.0;
    } else if (waveformType === 'drfm_repeater') {
      const freqs = [14e6, -28e6, -12e6, 29e6, 41e6];
      const amps = [0.55, 0.9, 0.85, 0.92, 0.88];
      for (let m = 0; m < freqs.length; m++) {
        const ph = 2 * Math.PI * freqs[m] * t;
        sRe += amps[m] * Math.cos(ph);
        sIm += amps[m] * Math.sin(ph);
      }
      nominalPeakDbm = 8.0;
    } else {
      // hpm_emp_burst
      const phBase = 2 * Math.PI * 18e6 * t;
      sRe = 0.25 * Math.cos(phBase);
      sIm = 0.25 * Math.sin(phBase);
      if (i >= numSamples * 0.25 && i <= numSamples * 0.72) {
        const phBurst = 2 * Math.PI * -14e6 * t;
        sRe += 4.5 * Math.cos(phBurst);
        sIm += 4.5 * Math.sin(phBurst);
      }
      nominalPeakDbm = 28.0;
    }

    re[i] = sRe + gaussianNoise() * noiseSigma;
    im[i] = sIm + gaussianNoise() * noiseSigma;
  }

  return { re, im, nominalPeakDbm };
}

export function decodeIqArrayBuffer(arrayBuffer, iqFormat = 'complex64') {
  if (iqFormat === 'int16') {
    const view = new Int16Array(arrayBuffer);
    const pairs = Math.floor(view.length / 2);
    if (pairs < 128) throw new Error('IQ file too short for int16 complex pairs.');
    const count = Math.min(pairs, 4608);
    const re = new Float32Array(count);
    const im = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      re[i] = view[i * 2] / 32768.0;
      im[i] = view[i * 2 + 1] / 32768.0;
    }
    return { re, im };
  }

  const view = new Float32Array(arrayBuffer);
  const pairs = Math.floor(view.length / 2);
  if (pairs < 128) throw new Error('IQ file too short for complex64 samples.');
  const count = Math.min(pairs, 4608);
  const re = new Float32Array(count);
  const im = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    re[i] = view[i * 2];
    im[i] = view[i * 2 + 1];
  }
  return { re, im };
}

export function analyzeIqClient({
  re,
  im,
  sampleRateMhz = 120.0,
  nPrincipal = 58,
  species = 'Rb85',
  nominalPeakDbm = 0.0,
  fftSize = 128,
  maxFrames = 36,
  source = 'client-dsp'
}) {
  const numFrames = Math.min(maxFrames, Math.max(1, Math.floor(re.length / fftSize)));
  const hann = new Float32Array(fftSize);
  for (let k = 0; k < fftSize; k++) {
    hann[k] = 0.5 * (1 - Math.cos((2 * Math.PI * k) / (fftSize - 1)));
  }

  let maxEnv = 1e-6;
  for (let i = 0; i < numFrames * fftSize; i++) {
    const e = Math.hypot(re[i], im[i]);
    if (e > maxEnv) maxEnv = e;
  }

  const powerWattsPeak = Math.pow(10, (nominalPeakDbm - 30) / 10);
  const peakEFieldVm = Math.sqrt(powerWattsPeak * 377) * 0.45;
  const speciesScale = species === 'Cs133' ? 1.14 : 1.0;
  const dipoleCm = Math.pow(nPrincipal, 2) * speciesScale * ELEMENTARY_CHARGE * BOHR_RADIUS;
  const peakAtSplittingMhz = Math.min(250, ((dipoleCm * peakEFieldVm) / PLANCK_H) / 1e6);

  const lnaSaturated = nominalPeakDbm >= 15.0;
  const driveGain = Math.pow(10, Math.max(0, nominalPeakDbm - 10) / 20);
  let clippedCount = 0;

  const computePsdFrames = (isClassical) => {
    const rawDb = [];
    let minDb = Infinity;
    let maxDb = -Infinity;

    for (let f = 0; f < numFrames; f++) {
      const bufRe = new Float32Array(fftSize);
      const bufIm = new Float32Array(fftSize);
      let framePeak = 0;

      for (let k = 0; k < fftSize; k++) {
        const idx = f * fftSize + k;
        let xRe = re[idx];
        let xIm = im[idx];
        if (isClassical) {
          const dRe = xRe * driveGain;
          const dIm = xIm * driveGain;
          if (Math.hypot(dRe, dIm) > 1.15) clippedCount++;
          xRe = Math.tanh(dRe);
          xIm = Math.tanh(dIm);
          const mag = Math.hypot(xRe, xIm);
          if (mag > framePeak) framePeak = mag;
        }
        bufRe[k] = xRe * hann[k];
        bufIm[k] = xIm * hann[k];
      }

      fftRadix2(bufRe, bufIm);

      const row = new Array(fftSize);
      const half = fftSize >> 1;
      for (let k = 0; k < fftSize; k++) {
        const shifted = (k + half) % fftSize;
        const mag = Math.hypot(bufRe[shifted], bufIm[shifted]) + 1e-6;
        let db = 20 * Math.log10(mag);
        if (isClassical && lnaSaturated && framePeak > 0.85) {
          db += 18.0;
        }
        row[k] = db;
        if (db < minDb) minDb = db;
        if (db > maxDb) maxDb = db;
      }
      rawDb.push(row);
    }

    const span = Math.max(6.0, maxDb - minDb);
    return rawDb.map((row) =>
      row.map((v) => Number(Math.max(0, Math.min(1, (v - minDb) / span)).toFixed(3)))
    );
  };

  const rydbergFrames = computePsdFrames(false);
  const classicalFrames = computePsdFrames(true);
  const clippedPercent = Number(((clippedCount / (numFrames * fftSize)) * 100).toFixed(1));

  return {
    source,
    sample_rate_mhz: sampleRateMhz,
    fft_size: fftSize,
    num_frames: numFrames,
    nominal_peak_dbm: Number(nominalPeakDbm.toFixed(2)),
    peak_e_field_vm: Number(peakEFieldVm.toFixed(4)),
    peak_at_splitting_mhz: Number(peakAtSplittingMhz.toFixed(2)),
    lna_saturated: lnaSaturated,
    classical_clipped_percent: clippedPercent,
    rydberg_frames: rydbergFrames,
    classical_frames: classicalFrames
  };
}
