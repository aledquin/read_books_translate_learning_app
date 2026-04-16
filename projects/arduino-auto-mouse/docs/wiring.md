# Wiring guide

## Components

- Arduino Leonardo, Micro, or compatible USB HID board
- 1 HC-SR04 or similar ultrasonic distance sensor
- 1 10k potentiometer
- Jumper wires

## Connections

### Ultrasonic sensor

The default sketch pinout assumes an HC-SR04-style sensor.

- Sensor `VCC` -> `5V`
- Sensor `GND` -> `GND`
- Sensor `TRIG` -> `D3`
- Sensor `ECHO` -> `D4`

When an object such as a hand enters the configured range, the board starts sending repeated mouse clicks.

### Potentiometer

- Left pin -> `5V`
- Center pin (wiper) -> `A0`
- Right pin -> `GND`

Turning the potentiometer changes the click interval from about `100 ms` to `2000 ms`.

## Distance behavior

- Default active range: about `4 cm` to `20 cm`
- Distances outside that range pause clicking
- You can tune the range in `arduino-auto-mouse.ino` by editing:
  - `ACTIVE_MIN_DISTANCE_CM`
  - `ACTIVE_MAX_DISTANCE_CM`

## Notes

- `LED_BUILTIN` turns on while the sensor sees a target in the active range.
- If your board uses a different built-in LED pin, the Arduino core handles it through `LED_BUILTIN`.
- Do not use Arduino Uno or Nano for this exact sketch unless you add a separate USB HID solution, because standard versions do not expose native USB mouse emulation through the built-in `Mouse` library.
- Some ultrasonic modules are electrically noisy on long jumper wires; keep wiring short if readings are unstable.
