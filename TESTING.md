# Test Palmlight on your Quest 3S

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

## What to try (M2)

Eight levels play in a row. The dots on the far edge of the board show which one you are on, and a solved board moves to the next after a short pause.

1. Open Hand: no pieces. Hold your open palm upright in the beam, facing back toward the emitter at an angle, and the light bounces off your hand to the far crystal.
2. First Light: two mirrors. Point at a mirror (a blue ring shows under it) and pinch to pull it into your hand, or reach and pinch it. Turn your hand like a dial to rotate it, then let go over a cell.
3. Hand Off: one mirror plus your palm.
4. Fork: a splitter sends light two ways.
5. Amber: the amber crystal only lights with amber light. Use the amber filter.
6. Lift: tip your palm up toward the beam under the floating crystal, as if holding a tray.
7. Periscope: one palm lifts the beam, the other hand, higher up, turns it flat into the crystal's ring. Two hands needed.
8. Prism: mirror, splitter and cyan filter together.

The light on your palm glows when the beam touches it. Your real hand should hide the beam where it passes in front of it.

## Tell me

- Where the board landed: on your desk or on the pillar, and whether the height and distance felt right.
- How pinching and turning felt, including any pieces that jumped or slipped.
- How clear the beam looked against your room.
- Any stutter or lag you noticed.
- Whether the beam ever vanished near the desk surface (a side effect the hand-hiding effect can have).
