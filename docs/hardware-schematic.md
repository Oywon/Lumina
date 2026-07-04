# Hardware Schematic — Representative Room

The brief allows a schematic for **one representative room** (5 devices) instead of all 18. Build this in Wokwi or Tinkercad using the pin mapping and connection list below.

## Components

| Ref  | Part                                     | Qty | Purpose                                    |
| ---- | ---------------------------------------- | --- | ------------------------------------------ |
| U1   | ESP32 DevKit v1 (30-pin)                 | 1   | MCU + Wi-Fi                                |
| K1–5 | 5V single-channel relay module (opto-iso) | 5  | Switch mains loads for 2 fans + 3 lights   |
| M1–2 | 230 V AC fan (60 W)                      | 2   | Load                                       |
| L1–3 | 230 V AC light (15 W CFL/LED)            | 3   | Load                                       |
| CS1  | ACS712 5A current sensor (Hall)          | 1   | Whole-room current sense on the L conductor |
| PSU  | 5 V / 2 A DC supply                      | 1   | Powers ESP32 and relay coils               |
| —    | 230 V mains + fuse + neutral bus         | 1   | Wall supply                                |

## Pin mapping (ESP32 → peripherals)

| ESP32 pin | Direction | Signal          | Peripheral         | Notes                                              |
| --------- | --------- | --------------- | ------------------ | -------------------------------------------------- |
| GPIO 25   | OUT       | RELAY_FAN_1     | K1 IN              | HIGH → coil energised → fan ON (active-high module) |
| GPIO 26   | OUT       | RELAY_FAN_2     | K2 IN              | Same                                               |
| GPIO 27   | OUT       | RELAY_LIGHT_1   | K3 IN              | Same                                               |
| GPIO 32   | OUT       | RELAY_LIGHT_2   | K4 IN              | Same                                               |
| GPIO 33   | OUT       | RELAY_LIGHT_3   | K5 IN              | Same                                               |
| GPIO 34   | IN (ADC1) | CURRENT_SENSE   | ACS712 OUT         | Analog only (34 is input-only). Read with `analogRead()`. |
| 3V3       | PWR       | 3V3 rail        | ACS712 VCC *(via level shifter — see note)* | Do NOT feed 5V into a GPIO |
| 5V/VIN    | PWR       | 5V rail         | Relay module VCC   | Common supply from external 5V PSU                 |
| GND       | GND       | Ground          | Relay GND, ACS712 GND, PSU GND | Single common ground                    |

### Why these pins

- **GPIO 25, 26, 27, 32, 33** — safe general-purpose output pins on ESP32. They avoid the strapping pins (0, 2, 5, 12, 15) that must be in a known state at boot.
- **GPIO 34** — input-only, has an ADC. Perfect for a sensor output. Avoid GPIO 36/39 unless you also need those.
- ACS712 outputs ~2.5 V at 0 A and swings around it. Since VCC = 5 V, use a **resistor divider (10k / 10k)** on the OUT line before GPIO 34 — ESP32 ADC max is 3.3 V.

## Connection list

**Mains (dangerous — for schematic only):**

```
L (live) --> Fuse --> Split into 5 branches:
    branch 1: --> ACS712 (through-hole current path) --> K1 COM
    branch 2: --> K2 COM
    branch 3: --> K3 COM
    branch 4: --> K4 COM
    branch 5: --> K5 COM

Each K* NO --> load (fan/light) --> N (neutral bus) --> back to supply
```

Placing **only branch 1** through the ACS712 measures a single circuit. To measure the whole room's current, thread the common Live wire through the ACS712 core before it fans out — that way one sensor reads the sum.

**Low-voltage side:**

```
5V PSU (+) --> ESP32 VIN, Relay VCC (all 5), ACS712 VCC (with divider on OUT)
5V PSU (-) --> ESP32 GND, Relay GND, ACS712 GND  (common ground)

ESP32 GPIO 25 --> K1 IN
ESP32 GPIO 26 --> K2 IN
ESP32 GPIO 27 --> K3 IN
ESP32 GPIO 32 --> K4 IN
ESP32 GPIO 33 --> K5 IN
ACS712 OUT --(10k)--+--(10k)-- GND
                    |
                    +--> ESP32 GPIO 34
```

## Electrical reasoning

1. **Isolation.** Relay modules with an on-board optocoupler electrically separate the ESP32's 3.3 V logic from mains. Never wire mains directly to a GPIO or transistor without isolation.
2. **Relay VCC must be 5 V**, not 3.3 V — most relay coils don't reliably pull in at 3.3 V. The ESP32's *logic* HIGH (3.3 V) is enough for the optocoupler LED though, so IN pins can be driven straight from GPIO.
3. **Fuse before everything.** A 3 A fuse on L protects the 5 loads (60W×2 + 15W×3 = 165 W ≈ 0.75 A @ 230 V) with margin for inrush.
4. **Common ground.** ESP32 GND, relay GND, ACS712 GND, and the 5 V PSU GND must all tie together, or the opto-couplers see no reference.
5. **ADC scaling.** ACS712-5A outputs 2.5 V ± 0.185 V/A. The 10k/10k divider halves that to fit inside 3.3 V; scale in firmware: `A = ((raw/4095 * 3.3) * 2 - 2.5) / 0.185`.
6. **Boot safety.** The chosen output pins don't affect ESP32 boot mode. If you swap in GPIO 2 or 15, add a pull-down / pull-up to keep the strapping value correct.

## What this maps to in the app

Each `devices` row corresponds to one relay. In the real build, firmware would:

- Read the commanded state from the backend (`GET /api/public/devices/:id`) and drive the corresponding GPIO.
- Report the actual state back after every change.
- Sample GPIO 34, convert to Amps, multiply by 230 V, and POST periodic `power_reading` messages to a `hourly_usage`-style table.

For the demo we replace the ESP32 with `pg_cron → /api/public/tick`; the DB shape stays identical, so the real hardware could be swapped in later without changing the dashboard or the Discord bot.
