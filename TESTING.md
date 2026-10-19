# Test Beam on your Quest 3S

About 15 minutes. Do this at the end of each milestone.

## Before the first test

1. On the headset, finish Space Setup (Settings, Environment setup, Space setup) and include your desk. This lets the game find the desk.
2. Put the headset and this laptop on the same Wi-Fi network.

## Start the game on the laptop

```bash
npm run dev
```

The terminal prints a **Network** address such as `https://192.168.x.x:8081/`. That is the one to open on the headset.

## Open it on the headset

1. Sit at your desk and put the headset on. Put the controllers down so hand tracking takes over.
2. Open the Browser and type the Network address.
3. The browser shows a certificate warning, which is normal for a local test build. Choose Advanced, then continue.
4. Press **Play in headset** and allow the passthrough and hand tracking prompts.

## What to try (M1)

1. The board should appear on your desk, about an arm's length away. If no desk is found, it stands on a dark pillar instead.
2. A beam runs from the emitter on the left until it hits a dark blocker.
3. Two mirrors sit on the tray to the right of the board. Pinch one to pick it up.
4. While holding it, turn your hand like a dial. You hear a soft tick for each 45 degree step.
5. Hover over a cell: a blue square shows where it will land, and the beam bends live.
6. Let go to drop it. Goal: light the crystal at the far right.

Hint: the beam needs to go up and over the blockers. Both mirrors point the same way.

## Tell me

- Where the board landed: on your desk or on the pillar, and whether the height and distance felt right.
- How pinching and turning felt, including any pieces that jumped or slipped.
- How clear the beam looked against your room.
- Any stutter or lag you noticed.
