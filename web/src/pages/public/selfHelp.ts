/** Curated, deterministic safe checks (PRD §5.2). Every list ends with "if unsure, stop and submit". */
export const SELF_HELP: Record<string, { title: string; checks: string[] }> = {
  breaker_gfci: {
    title: 'Dead outlet or no power in a room?',
    checks: [
      'Look for a GFCI outlet (with TEST/RESET buttons) in the kitchen, bathroom, garage or outside. Press RESET firmly.',
      'Open the breaker panel. If a switch sits in the middle or is OFF, push it fully OFF, then back ON.',
      'Try a lamp you know works in the outlet.',
    ],
  },
  disposal_reset: {
    title: 'Garbage disposal humming or stopped?',
    checks: [
      'Switch the disposal OFF. Never put your hand inside.',
      'Press the small red reset button on the bottom of the unit under the sink.',
      'Run cold water and switch it back on.',
    ],
  },
  thermostat: {
    title: 'Heating or cooling not working?',
    checks: ['Check the thermostat is set to HEAT or COOL (not OFF) and the temperature is above or below the room.', 'Replace the thermostat batteries if the screen is blank or dim.', 'Make sure the furnace or air-handler switch (looks like a light switch) is ON.'],
  },
  clogged_toilet: {
    title: 'Toilet clogged or running?',
    checks: ['Use a flange plunger with a firm seal, 10–15 strong pushes.', 'If it is about to overflow, turn the valve behind the toilet clockwise to shut off the water.', 'For a running toilet, jiggle the handle and check the flapper chain isn’t caught.'],
  },
  smoke_alarm: {
    title: 'Smoke alarm chirping?',
    checks: ['A single chirp every minute usually means a low battery. Replace the battery (often 9V) if you can reach it safely.', 'Press and hold the TEST button for 5 seconds after replacing it.', 'If it sounds continuously and there’s no smoke, open windows and call us.'],
  },
};
