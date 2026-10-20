# Test Palmlight on a Quest

For anyone with a Quest 3 or 3S who can try a build (Zouhir develops in the emulator only). About 15 minutes.

## Before the first test

1. On the headset, finish Space Setup (Settings, Environment setup, Space setup) and include your desk. This lets the game find the desk.
2. For a local build, put the headset and the laptop running it on the same Wi-Fi network. For a hosted build, just open its link.

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

## What to try (M3)

Sixteen levels play in two chapters. The dots on the far edge show where you are.

1. First start: Open Hand shows a caption above the board. After a short pause a see-through ghost hand shows the move: an open palm in the beam. Copy it and the crystal lights.
2. Levels with pieces show the ghost pinching a piece in the tray, carrying it to its cell and turning it. Point at a piece (a blue ring shows under it) and pinch to pull it into your hand, or reach and pinch it.
3. Lift and High Shelf: the beam runs toward you. Tip your palm up and slightly away under the floating crystal, like holding a tray.
4. Periscope and Both Hands need both hands.
5. Buttons on the front edge: Restart, Next, Daily (today's puzzle, with your streak once you have one) and the tray side switch for left-handed play. Each works with a fingertip press or by pointing and pinching.
6. Take the headset off mid-level and come back: the level and your pieces are where you left them.
7. Next session, the board should come back to the same spot on your desk.
8. Picking up a controller pauses the game until you put it down.

To report speed, add ?fps=1 to the link: a small readout above the buttons shows the time per frame and the share of slow frames.

## Tell me

- Where the board landed: on your desk or on the pillar, and whether the height and distance felt right.
- How pinching and turning felt, including any pieces that jumped or slipped.
- How clear the beam looked against your room.
- Any stutter or lag you noticed.
- Whether the beam ever vanished near the desk surface (a side effect the hand-hiding effect can have).
- If the headset's menu icon appeared on your palm during Lift or Periscope, or the game closed by itself.
- Any moment in Periscope when a hand stopped tracking because one hand was in front of the other.
