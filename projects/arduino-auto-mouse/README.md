# Arduino Auto Mouse

A starter Git project for building an Arduino-powered automated mouse controller that reacts to hand distance measured by a top-mounted ultrasonic sensor.

This project targets Arduino boards with native USB HID support, such as:

- Arduino Leonardo
- Arduino Micro
- Pro Micro compatible boards

It uses the built-in `Mouse` library so the Arduino can appear to the computer as a USB mouse and map two vertical distance gates to different actions.

## Features

- Use an HC-SR04 style ultrasonic sensor mounted above the hand area
- Split the sensing field into two configurable gates
- Near gate sends repeated left clicks
- Far gate sends repeated right clicks
- Adjust repeat interval with a potentiometer
- Built-in safety delay before mouse control starts
- Status output over Serial for debugging
- LED indicator while either gate is active

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
- 1 HC-SR04 or compatible ultrasonic sensor
- 1 10k potentiometer
- Jumper wires
- Breadboard (optional)
- A top bracket or mount so the sensor can point downward

## Default pin mapping

- Ultrasonic trigger: `D3`
- Ultrasonic echo: `D4`
- Status LED: `LED_BUILTIN`
- Speed potentiometer: `A0`

## How it works

1. Mount the ultrasonic sensor above the interaction area so it points downward.
2. On startup, the sketch waits a few seconds before enabling mouse output.
3. The sensor continuously measures the distance to the hand or surface below it.
4. If the measured distance enters the far gate, the board sends repeated right clicks.
5. If the measured distance enters the near gate, the board sends repeated left clicks.
6. Turn the potentiometer to change the delay between repeated actions.

## Default gate ranges

- Near gate minimum distance: `6 cm`
- Near gate maximum distance: `12 cm`
- Far gate minimum distance: `13 cm`
- Far gate maximum distance: `22 cm`

You can adjust these values directly in `arduino-auto-mouse.ino`.

## Upload instructions

1. Open `arduino-auto-mouse.ino` in the Arduino IDE.
2. Select a supported board such as **Arduino Leonardo** or **Arduino Micro**.
3. Choose the correct serial port.
4. Upload the sketch.
5. Open the Serial Monitor at `115200` baud if you want status logs.

## Safety notes

- This sketch controls the host computer's mouse. Keep a hardware disconnect option available while testing.
- The startup delay is intentional so you have time to unplug the board if needed.
- Distance sensors can be noisy, so leave a small gap between the two gates to avoid accidental switching.
- Only use automation where it is allowed and appropriate.

## Next ideas

- Add a second potentiometer for live gate-threshold tuning
- Add scroll mode as a third gate or gesture
- Store settings in EEPROM
- Add an OLED display for distance, click rate, and state
- Add a serial command interface for remote configuration
