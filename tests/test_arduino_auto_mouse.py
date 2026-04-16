import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = REPO_ROOT / "projects" / "arduino-auto-mouse"
SKETCH_PATH = PROJECT_ROOT / "arduino-auto-mouse.ino"
README_PATH = PROJECT_ROOT / "README.md"
WIRING_PATH = PROJECT_ROOT / "docs" / "wiring.md"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def extract_constant_value(source: str, name: str) -> str:
    match = re.search(
        rf"const\s+(?:unsigned\s+long|int|float)\s+{re.escape(name)}\s*=\s*([A-Za-z0-9.]+);",
        source,
    )
    if not match:
        raise AssertionError(f"Could not find constant {name} in sketch")
    return match.group(1)


class ArduinoAutoMouseDocsConsistencyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sketch = read_text(SKETCH_PATH)
        cls.readme = read_text(README_PATH)
        cls.wiring = read_text(WIRING_PATH)

    def test_sketch_targets_native_usb_mouse_boards(self) -> None:
        self.assertIn("#include <Mouse.h>", self.sketch)
        self.assertIn("!defined(USBCON)", self.sketch)
        self.assertIn("Mouse.begin();", self.sketch)

    def test_readme_pin_mapping_matches_sketch(self) -> None:
        trigger_pin = extract_constant_value(self.sketch, "ULTRASONIC_TRIGGER_PIN")
        echo_pin = extract_constant_value(self.sketch, "ULTRASONIC_ECHO_PIN")
        potentiometer_pin = extract_constant_value(self.sketch, "POTENTIOMETER_PIN")

        self.assertIn(f"Ultrasonic trigger: `D{trigger_pin}`", self.readme)
        self.assertIn(f"Ultrasonic echo: `D{echo_pin}`", self.readme)
        self.assertIn(f"Speed potentiometer: `{potentiometer_pin}`", self.readme)

    def test_project_docs_match_distance_range_and_click_interval(self) -> None:
        near_gate_min_cm = extract_constant_value(self.sketch, "NEAR_GATE_MIN_DISTANCE_CM")
        near_gate_max_cm = extract_constant_value(self.sketch, "NEAR_GATE_MAX_DISTANCE_CM")
        far_gate_min_cm = extract_constant_value(self.sketch, "FAR_GATE_MIN_DISTANCE_CM")
        far_gate_max_cm = extract_constant_value(self.sketch, "FAR_GATE_MAX_DISTANCE_CM")
        min_click_ms = extract_constant_value(self.sketch, "MIN_CLICK_INTERVAL_MS")
        max_click_ms = extract_constant_value(self.sketch, "MAX_CLICK_INTERVAL_MS")

        self.assertIn(
            f"Near gate minimum distance: `{near_gate_min_cm.rstrip('0').rstrip('.')} cm`",
            self.readme,
        )
        self.assertIn(
            f"Near gate maximum distance: `{near_gate_max_cm.rstrip('0').rstrip('.')} cm`",
            self.readme,
        )
        self.assertIn(
            f"Far gate minimum distance: `{far_gate_min_cm.rstrip('0').rstrip('.')} cm`",
            self.readme,
        )
        self.assertIn(
            f"Far gate maximum distance: `{far_gate_max_cm.rstrip('0').rstrip('.')} cm`",
            self.readme,
        )
        self.assertIn(
            f"Turning the potentiometer changes the click interval from about `{min_click_ms} ms` to `{max_click_ms} ms`.",
            self.wiring,
        )

    def test_wiring_doc_matches_sketch(self) -> None:
        trigger_pin = extract_constant_value(self.sketch, "ULTRASONIC_TRIGGER_PIN")
        echo_pin = extract_constant_value(self.sketch, "ULTRASONIC_ECHO_PIN")
        near_gate_min_cm = extract_constant_value(self.sketch, "NEAR_GATE_MIN_DISTANCE_CM")
        near_gate_max_cm = extract_constant_value(self.sketch, "NEAR_GATE_MAX_DISTANCE_CM")
        far_gate_min_cm = extract_constant_value(self.sketch, "FAR_GATE_MIN_DISTANCE_CM")
        far_gate_max_cm = extract_constant_value(self.sketch, "FAR_GATE_MAX_DISTANCE_CM")

        self.assertIn(f"- Sensor `TRIG` -> `D{trigger_pin}`", self.wiring)
        self.assertIn(f"- Sensor `ECHO` -> `D{echo_pin}`", self.wiring)
        self.assertIn(
            "Mount the ultrasonic sensor above the hand area so it points straight down.",
            self.wiring,
        )
        self.assertIn(
            f"- Default near gate: about `{near_gate_min_cm.rstrip('0').rstrip('.')} cm` to `{near_gate_max_cm.rstrip('0').rstrip('.')} cm`",
            self.wiring,
        )
        self.assertIn(
            f"- Default far gate: about `{far_gate_min_cm.rstrip('0').rstrip('.')} cm` to `{far_gate_max_cm.rstrip('0').rstrip('.')} cm`",
            self.wiring,
        )


if __name__ == "__main__":
    unittest.main()
