// Rain and the ripple/splash it produces share one color identity.
export const RAIN_COLORS = {
  gold: ['#64ceff', '#4dd7e2', '#edc78c'],
  rose: ['#64ceff', '#4dd7e2', '#ee83c0'],
  aurora: ['#64ceff', '#4dd7e2', '#aaa1ec'],
  auto: ['#64ceff', '#4dd7e2', '#f0b3a4']
};

// Blue and cyan each occupy 40% of drops; the theme accent occupies 20%.
// A repeating distribution keeps the balance without changing physics randomness.
const RAIN_COLOR_SEQUENCE = [0, 1, 2, 0, 1, 0, 1, 2, 0, 1];
export const rainColorIndex = cursor => RAIN_COLOR_SEQUENCE[cursor % RAIN_COLOR_SEQUENCE.length];
