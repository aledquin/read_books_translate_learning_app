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

const float ACTIVE_MIN_DISTANCE_CM = 4.0;
const float ACTIVE_MAX_DISTANCE_CM = 20.0;

bool targetDetected = false;
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
  return distanceCm >= ACTIVE_MIN_DISTANCE_CM &&
         distanceCm <= ACTIVE_MAX_DISTANCE_CM;
}

void updateDetectionState(float distanceCm) {
  const bool detectedNow = isTargetInRange(distanceCm);
  if (detectedNow == targetDetected) {
    return;
  }

  targetDetected = detectedNow;
  digitalWrite(STATUS_LED_PIN, targetDetected ? HIGH : LOW);

  if (targetDetected) {
    Serial.print("Target detected at ");
    Serial.print(distanceCm);
    Serial.println(" cm");
    return;
  }

  Serial.println("Target left detection range");
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
  Serial.println("Mouse control active. Present a hand in front of the ultrasonic sensor to click.");
}

void loop() {
  const float distanceCm = readDistanceCm();
  if (distanceCm < 0.0) {
    if (targetDetected) {
      targetDetected = false;
      digitalWrite(STATUS_LED_PIN, LOW);
      Serial.println("Ultrasonic reading timed out; clicking paused");
    }
    delay(60);
    return;
  }

  updateDetectionState(distanceCm);

  if (!targetDetected) {
    delay(30);
    return;
  }

  const unsigned long clickIntervalMs = mapPotentiometerToInterval();
  const unsigned long nowMs = millis();

  if (nowMs - lastClickTimeMs < clickIntervalMs) {
    return;
  }

  Mouse.click(MOUSE_LEFT);
  lastClickTimeMs = nowMs;

  Serial.print("Click sent at ");
  Serial.print(distanceCm);
  Serial.print(" cm. Interval (ms): ");
  Serial.println(clickIntervalMs);
}
