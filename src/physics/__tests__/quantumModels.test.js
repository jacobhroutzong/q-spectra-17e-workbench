import { describe, expect, it } from 'vitest';
import {
  computeRydbergSplitting,
  computeQuantumIlluminationSNR,
} from '../quantumModels.js';
import {
  fftRadix2,
  generateSyntheticIqClient,
  analyzeIqClient,
} from '../sdrEngine.js';

describe('computeRydbergSplitting', () => {
  it('scales dipole moment with n^2', () => {
    const lowN = computeRydbergSplitting(30, -20, 'Rb85', 'thermal_300k');
    const highN = computeRydbergSplitting(60, -20, 'Rb85', 'thermal_300k');
    const ratio = parseFloat(highN.dipoleMomentDebye) / parseFloat(lowN.dipoleMomentDebye);
    expect(ratio).toBeCloseTo(4.0, 2);
  });

  it('produces larger dipole moment for Cs133 than Rb85 at equal n', () => {
    const rb = computeRydbergSplitting(52, -20, 'Rb85', 'thermal_300k');
    const cs = computeRydbergSplitting(52, -20, 'Cs133', 'thermal_300k');
    expect(parseFloat(cs.dipoleMomentDebye)).toBeGreaterThan(parseFloat(rb.dipoleMomentDebye));
  });

  it('flags classical LNA burnout at rfPowerDbm >= 15', () => {
    const safe = computeRydbergSplitting(52, 14.9, 'Rb85', 'thermal_300k');
    const burnoutThreshold = computeRydbergSplitting(52, 15, 'Rb85', 'thermal_300k');
    const hpm = computeRydbergSplitting(52, 30, 'Rb85', 'thermal_300k');
    expect(safe.lnaBurnout).toBe(false);
    expect(burnoutThreshold.lnaBurnout).toBe(true);
    expect(hpm.lnaBurnout).toBe(true);
  });

  it('resolves weak Autler-Townes doublets in MOT 100 uK regime where thermal 300 K blurs them', () => {
    // At n=52 and -15 dBm, splitting is ~1.58 MHz: resolved at 0.6 MHz MOT linewidth, unresolved at 6.2 MHz thermal linewidth
    const thermal = computeRydbergSplitting(52, -15, 'Rb85', 'thermal_300k');
    const mot = computeRydbergSplitting(52, -15, 'Rb85', 'mot_100uk');

    expect(thermal.linewidthMhz).toBe(6.2);
    expect(mot.linewidthMhz).toBe(0.6);
    expect(parseFloat(mot.splittingMHz)).toBeGreaterThan(mot.linewidthMhz);
    expect(parseFloat(thermal.splittingMHz)).toBeLessThan(thermal.linewidthMhz);
    expect(thermal.doubletResolved).toBe(false);
    expect(mot.doubletResolved).toBe(true);
  });
});

describe('computeQuantumIlluminationSNR', () => {
  it('achieves ~6.02 dB (4x) quantum advantage in high thermal clutter (Nb >> 1, Ns << 1)', () => {
    const res = computeQuantumIlluminationSNR(0.01, 200, 0.01, 10000, false);
    expect(parseFloat(res.advantageDb)).toBeCloseTo(6.02, 1);
    expect(parseFloat(res.quantumSnrDb)).toBeGreaterThan(parseFloat(res.classicalSnrDb));
  });

  it('reports > 99% DRFM ghost rejection when drfmSpoofActive is true', () => {
    const res = computeQuantumIlluminationSNR(0.02, 500, 0.01, 50000, true);
    expect(parseFloat(res.drfmRejectionPercent)).toBeGreaterThan(99);
  });
});

describe('sdrEngine.js client-side Radix-2 FFT & synthetic threats', () => {
  it('computes a valid Radix-2 Cooley-Tukey FFT on a pure tone', () => {
    const N = 64;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    const bin = 8;
    for (let i = 0; i < N; i++) {
      re[i] = Math.cos((2 * Math.PI * bin * i) / N);
      im[i] = Math.sin((2 * Math.PI * bin * i) / N);
    }
    fftRadix2(re, im);

    const mags = Array.from({ length: N }, (_, k) => Math.hypot(re[k], im[k]));
    const maxMag = Math.max(...mags);
    const peakBin = mags.indexOf(maxMag);
    expect(peakBin).toBe(bin);
    expect(maxMag).toBeCloseTo(N, 2);
  });

  it.each(['lpi_fhss', 'lfm_chirp', 'drfm_repeater', 'hpm_emp_burst'])(
    'generates finite PSD frames for %s',
    (waveformType) => {
      const { re, im, nominalPeakDbm } = generateSyntheticIqClient(waveformType, 15.0, 120.0);
      expect(re.length).toBeGreaterThan(0);
      expect(im.length).toBe(re.length);

      const analysis = analyzeIqClient({
        re,
        im,
        sampleRateMhz: 120.0,
        nPrincipal: 52,
        species: 'Rb85',
        nominalPeakDbm,
      });

      expect(analysis.num_frames).toBeGreaterThan(0);
      expect(analysis.rydberg_frames.length).toBe(analysis.num_frames);
      expect(analysis.classical_frames.length).toBe(analysis.num_frames);
      expect(Number.isFinite(analysis.peak_e_field_vm)).toBe(true);
      expect(Number.isFinite(analysis.peak_at_splitting_mhz)).toBe(true);

      for (const frame of analysis.rydberg_frames) {
        expect(frame.every((v) => Number.isFinite(v))).toBe(true);
      }
      for (const frame of analysis.classical_frames) {
        expect(frame.every((v) => Number.isFinite(v))).toBe(true);
      }

      if (waveformType === 'hpm_emp_burst') {
        expect(analysis.lna_saturated).toBe(true);
        expect(analysis.classical_clipped_percent).toBeGreaterThan(0);
      } else {
        expect(analysis.lna_saturated).toBe(false);
        expect(analysis.classical_clipped_percent).toBeGreaterThanOrEqual(0);
        expect(analysis.classical_clipped_percent).toBeLessThanOrEqual(100);
      }
    }
  );
});
