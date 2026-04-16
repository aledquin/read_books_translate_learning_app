#include <Mouse.h>

#if !defined(USBCON)
#error "This sketch requires an Arduino board with native USB HID support."
#endif

namespace {
const int TOGGLE_BUTTON_PIN = 2;
const int POTENTIOMETER_PIN = A0;
const int STATUS_LED_PIN = LED_BUILTIN;

const unsigned long STARTUP_SAFETY_DELAY_MS = 5000;
const unsigned long DEBOUNCE_DELAY_MS = 40;
const unsigned long MIN_CLICK_INTERVAL_MS = 100;
const unsigned long MAX_CLICK_INTERVAL_MS = 2000;

bool autoClickEnabled = false;
bool buttonState = HIGH;
bool lastButtonReading = HIGH;
unsigned long lastDebounceTimeMs = 0;
unsigned long lastClickTimeMs = 0;

unsigned long mapPotentiometerToInterval() {
  const int raw = analogRead(POTENTIOMETER_PIN);
  return map(raw, 0, 1023, MIN_CLICK_INTERVAL_MS, MAX_CLICK_INTERVAL_MS);
}

void updateToggleButton() {
  const bool reading = digitalRead(TOGGLE_BUTTON_PIN);

  if (reading != lastButtonReading) {
    lastDebounceTimeMs = millis();
  }

  if ((millis() - lastDebounceTimeMs) > DEBOUNCE_DELAY_MS && reading != buttonState) {
    buttonState = reading;

    if (buttonState == LOW) {
      autoClickEnabled = !autoClickEnabled;
      digitalWrite(STATUS_LED_PIN, autoClickEnabled ? HIGH : LOW);

      Serial.print("Auto clicker ");
      Serial.println(autoClickEnabled ? "enabled" : "disabled");
    }
  }

  lastButtonReading = reading;
}
}  // namespace

void setup() {
  pinMode(TOGGLE_BUTTON_PIN, INPUT_PULLUP);
  pinMode(STATUS_LED_PIN, OUTPUT);
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
  Serial.println("Mouse control active. Press button on D2 to toggle clicking.");
}

void loop() {
  updateToggleButton();

  if (!autoClickEnabled) {
    return;
  }

  const unsigned long clickIntervalMs = mapPotentiometerToInterval();
  const unsigned long nowMs = millis();

  if (nowMs - lastClickTimeMs < clickIntervalMs) {
    return;
  }

  Mouse.click(MOUSE_LEFT);
  lastClickTimeMs = nowMs;

  Serial.print("Click sent. Interval (ms): ");
  Serial.println(clickIntervalMs);
}
