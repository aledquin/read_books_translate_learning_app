# Wiring guide

## Components

- Arduino Leonardo, Micro, or compatible USB HID board
- 1 HC-SR04 or similar ultrasonic distance sensor
- 1 10k potentiometer
- Jumper wires

## Mounting concept

Mount the ultrasonic sensor above the hand area so it points straight down. The sketch interprets two vertical distance bands as two separate gates:

- **Far gate**: farther from the sensor, used for repeated right clicks
- **Near gate**: closer to the sensor, used for repeated left clicks

This lets one overhead sensor behave like two invisible zones.

## Connections

### Ultrasonic sensor

The default sketch pinout assumes an HC-SR04-style sensor.

- Sensor `VCC` -> `5V`
- Sensor `GND` -> `GND`
- Sensor `TRIG` -> `D3`
- Sensor `ECHO` -> `D4`

### Potentiometer

- Left pin -> `5V`
- Center pin (wiper) -> `A0`
- Right pin -> `GND`

Turning the potentiometer changes the click interval from about `100 ms` to `2000 ms`.

## Gate behavior

- Default near gate: about `6 cm` to `12 cm`
- Default far gate: about `13 cm` to `22 cm`
- Distances between the gates or outside both gates pause clicking
- You can tune the gates in `arduino-auto-mouse.ino` by editing:
  - `NEAR_GATE_MIN_DISTANCE_CM`
  - `NEAR_GATE_MAX_DISTANCE_CM`
  - `FAR_GATE_MIN_DISTANCE_CM`
  - `FAR_GATE_MAX_DISTANCE_CM`

## Notes

- `LED_BUILTIN` turns on while a hand is inside either gate.
- If your board uses a different built-in LED pin, the Arduino core handles it through `LED_BUILTIN`.
- Do not use Arduino Uno or Nano for this exact sketch unless you add a separate USB HID solution, because standard versions do not expose native USB mouse emulation through the built-in `Mouse` library.
- Some ultrasonic modules are electrically noisy on long jumper wires; keep wiring short if readings are unstable.
