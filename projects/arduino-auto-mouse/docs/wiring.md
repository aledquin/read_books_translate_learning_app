# Wiring guide

## Components

- Arduino Leonardo, Micro, or compatible USB HID board
- 1 push button
- 1 10k potentiometer
- Jumper wires

## Connections

### Toggle button

The sketch uses `INPUT_PULLUP`, so the button is wired between the input pin and ground.

- One side of the button -> `D2`
- Other side of the button -> `GND`

When pressed, the input reads `LOW` and toggles the auto-clicker state.

### Potentiometer

- Left pin -> `5V`
- Center pin (wiper) -> `A0`
- Right pin -> `GND`

Turning the potentiometer changes the click interval from about `100 ms` to `2000 ms`.

## Notes

- `LED_BUILTIN` turns on while auto-clicking is enabled.
- If your board uses a different built-in LED pin, the Arduino core handles it through `LED_BUILTIN`.
- Do not use Arduino Uno or Nano for this exact sketch unless you add a separate USB HID solution, because standard versions do not expose native USB mouse emulation through the built-in `Mouse` library.
