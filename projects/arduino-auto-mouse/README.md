# Arduino Auto Mouse

A starter Git project for building an Arduino-powered automated mouse clicker.

This project targets Arduino boards with native USB HID support, such as:

- Arduino Leonardo
- Arduino Micro
- Pro Micro compatible boards

It uses the built-in `Mouse` library so the Arduino can appear to the computer as a USB mouse and issue left-click events at a configurable interval.

## Features

- Toggle automatic clicking with a physical button
- Adjust click interval with a potentiometer
- Built-in safety delay before mouse control starts
- Status output over Serial for debugging
- LED indicator while clicking is enabled

## Repository layout

```text
projects/arduino-auto-mouse/
  README.md
  arduino-auto-mouse.ino
  docs/
    wiring.md
```

## Hardware required

- 1 Arduino board with native USB HID support
- 1 momentary push button
- 1 10k potentiometer
- Jumper wires
- Breadboard (optional)

## Default pin mapping

- Toggle button: `D2`
- Status LED: `LED_BUILTIN`
- Speed potentiometer: `A0`

## How it works

1. On startup, the sketch waits a few seconds before enabling mouse output.
2. Press the button connected to `D2` to toggle the auto-clicker on or off.
3. Turn the potentiometer to change the delay between clicks.
4. When active, the board sends repeated left mouse clicks to the connected computer.

## Upload instructions

1. Open `arduino-auto-mouse.ino` in the Arduino IDE.
2. Select a supported board such as **Arduino Leonardo** or **Arduino Micro**.
3. Choose the correct serial port.
4. Upload the sketch.
5. Open the Serial Monitor at `115200` baud if you want status logs.

## Safety notes

- This sketch controls the host computer's mouse. Keep a hardware disconnect option available while testing.
- The startup delay is intentional so you have time to unplug the board if needed.
- Only use automation where it is allowed and appropriate.

## Next ideas

- Add right-click or scroll modes
- Store settings in EEPROM
- Add an OLED display for click rate and state
- Add a serial command interface for remote configuration
