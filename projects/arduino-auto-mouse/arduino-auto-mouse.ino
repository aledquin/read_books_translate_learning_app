#include <Mouse.h>

#if !defined(USBCON)
#error "This sketch requires an Arduino board with native USB HID support."
#endif

namespace {
const int ULTRASONIC_TRIGGER_PIN = 3;
const int ULTRASONIC_ECHO_PIN = 4;
const int POTENTIOMETER_PIN = A0;
const int STATUS_LED_PIN = LED_BUILTIN;

const unsigned long STARTUP_SAFETY_DELAY_MS = 5000;
const unsigned long MIN_CLICK_INTERVAL_MS = 100;
const unsigned long MAX_CLICK_INTERVAL_MS = 2000;
const unsigned long SENSOR_TIMEOUT_US = 25000;

const float NEAR_GATE_MIN_DISTANCE_CM = 6.0;
const float NEAR_GATE_MAX_DISTANCE_CM = 12.0;
const float FAR_GATE_MIN_DISTANCE_CM = 13.0;
const float FAR_GATE_MAX_DISTANCE_CM = 22.0;

enum class GateState {
  kNone,
  kNear,
  kFar,
};

GateState activeGate = GateState::kNone;
unsigned long lastClickTimeMs = 0;

unsigned long mapPotentiometerToInterval() {
  const int raw = analogRead(POTENTIOMETER_PIN);
  return map(raw, 0, 1023, MIN_CLICK_INTERVAL_MS, MAX_CLICK_INTERVAL_MS);
}

float readDistanceCm() {
  digitalWrite(ULTRASONIC_TRIGGER_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(ULTRASONIC_TRIGGER_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(ULTRASONIC_TRIGGER_PIN, LOW);

  const unsigned long durationUs =
      pulseIn(ULTRASONIC_ECHO_PIN, HIGH, SENSOR_TIMEOUT_US);
  if (durationUs == 0) {
    return -1.0;
  }

  return durationUs / 58.0;
}

bool isTargetInRange(float distanceCm) {
  return distanceCm >= NEAR_GATE_MIN_DISTANCE_CM &&
         distanceCm <= FAR_GATE_MAX_DISTANCE_CM;
}

GateState classifyGate(float distanceCm) {
  if (distanceCm >= NEAR_GATE_MIN_DISTANCE_CM &&
      distanceCm <= NEAR_GATE_MAX_DISTANCE_CM) {
    return GateState::kNear;
  }

  if (distanceCm >= FAR_GATE_MIN_DISTANCE_CM &&
      distanceCm <= FAR_GATE_MAX_DISTANCE_CM) {
    return GateState::kFar;
  }

  return GateState::kNone;
}

const char* gateLabel(GateState gate) {
  switch (gate) {
    case GateState::kNear:
      return "near gate";
    case GateState::kFar:
      return "far gate";
    case GateState::kNone:
    default:
      return "no gate";
  }
}

void updateDetectionState(float distanceCm) {
  const GateState detectedGate = classifyGate(distanceCm);
  if (detectedGate == activeGate) {
    return;
  }

  activeGate = detectedGate;
  digitalWrite(STATUS_LED_PIN, activeGate != GateState::kNone ? HIGH : LOW);

  if (activeGate != GateState::kNone) {
    Serial.print("Target entered ");
    Serial.print(gateLabel(activeGate));
    Serial.print(" at ");
    Serial.print(distanceCm);
    Serial.println(" cm");
    return;
  }

  if (isTargetInRange(distanceCm)) {
    return;
  }

  Serial.println("Target left both gates");
}
}  // namespace

void setup() {
  pinMode(ULTRASONIC_TRIGGER_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(ULTRASONIC_TRIGGER_PIN, LOW);
  digitalWrite(STATUS_LED_PIN, LOW);

  Serial.begin(115200);
  while (!Serial && millis() < 1500) {
    // Allow time for boards that enumerate a USB serial port.
  }

  Serial.println("Arduino Auto Mouse starting...");
  Serial.print("Safety delay (ms): ");
  Serial.println(STARTUP_SAFETY_DELAY_MS);

  delay(STARTUP_SAFETY_DELAY_MS);

  Mouse.begin();
  Serial.println("Mouse control active. Mount the ultrasonic sensor above the target area and move a hand through either gate.");
}

void loop() {
  const float distanceCm = readDistanceCm();
  if (distanceCm < 0.0) {
    if (activeGate != GateState::kNone) {
      activeGate = GateState::kNone;
      digitalWrite(STATUS_LED_PIN, LOW);
      Serial.println("Ultrasonic reading timed out; clicking paused");
    }
    delay(60);
    return;
  }

  updateDetectionState(distanceCm);

  if (activeGate == GateState::kNone) {
    delay(30);
    return;
  }

  const unsigned long clickIntervalMs = mapPotentiometerToInterval();
  const unsigned long nowMs = millis();

  if (nowMs - lastClickTimeMs < clickIntervalMs) {
    return;
  }

  const uint8_t button =
      activeGate == GateState::kNear ? MOUSE_LEFT : MOUSE_RIGHT;
  Mouse.click(button);
  lastClickTimeMs = nowMs;

  Serial.print(activeGate == GateState::kNear ? "Left" : "Right");
  Serial.print(" click sent from ");
  Serial.print(gateLabel(activeGate));
  Serial.print(" at ");
  Serial.print(distanceCm);
  Serial.print(" cm. Interval (ms): ");
  Serial.println(clickIntervalMs);
}
