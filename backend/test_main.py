import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402


class TestQSpectraBackend(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_health_endpoint(self) -> None:
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["service"], "q-spectra-quantum-home")
        self.assertIn("physics_solver", data)

    def test_rydberg_master_eq_thermal_and_mot(self) -> None:
        thermal_resp = self.client.post(
            "/api/physics/rydberg-master-eq",
            json={
                "n_principal": 58,
                "rf_power_dbm": -15.0,
                "species": "Rb85",
                "regime": "thermal_300k",
            },
        )
        self.assertEqual(thermal_resp.status_code, 200)
        thermal = thermal_resp.json()
        self.assertEqual(len(thermal["detuning_mhz"]), 241)
        self.assertEqual(len(thermal["absorption"]), 241)
        self.assertGreater(thermal["splitting_mhz"], 0)
        self.assertEqual(thermal["species"], "Rb85")

        mot_resp = self.client.post(
            "/api/physics/rydberg-master-eq",
            json={
                "n_principal": 58,
                "rf_power_dbm": -15.0,
                "species": "Cs133",
                "regime": "mot_100uk",
            },
        )
        self.assertEqual(mot_resp.status_code, 200)
        mot = mot_resp.json()
        self.assertEqual(mot["species"], "Cs133")
        self.assertGreater(mot["splitting_mhz"], thermal["splitting_mhz"])
        self.assertNotEqual(mot["absorption"], thermal["absorption"])

    def test_sdr_analyze_iq_synthetic(self) -> None:
        resp = self.client.post(
            "/api/sdr/analyze-iq",
            data={
                "waveform_type": "hpm_emp_burst",
                "snr_db": "15.0",
                "sample_rate_mhz": "120.0",
                "n_principal": "52",
                "species": "Rb85",
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["lna_saturated"])
        self.assertGreater(len(data["rydberg_frames"]), 0)
        self.assertEqual(len(data["rydberg_frames"]), len(data["classical_frames"]))
        self.assertGreater(data["peak_at_splitting_mhz"], 0)

    def test_synthesize_challenge_offline_fallback(self) -> None:
        resp = self.client.post(
            "/api/intel/synthesize-challenge",
            json={
                "title": "Rydberg Atom Superheterodyne Receiver in HPM Clutter",
                "text": (
                    "A cesium Rydberg vapor cell at principal quantum number n=62 "
                    "demonstrates resilient RF electric-field sensing under +25 dBm "
                    "high-power microwave jamming where classical GaAs LNAs saturate."
                ),
                "source_citation": "arXiv:2501.00001",
                "mode": "offline",
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("id", data)
        self.assertIn("code", data)
        self.assertIn("targetAnswer", data)
        self.assertIn("telemetryOverride", data)


if __name__ == "__main__":
    unittest.main()
