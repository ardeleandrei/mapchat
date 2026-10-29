// Derive colors from the persistent ID, so every visitor sees the same pairing.
export function roomColor(id: string, color?: string | null): string {
  if (color && /^#[a-f0-9]{6}$/i.test(color)) return color;
  let hash = 0;
  for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  const hue = Math.round((hash * 137.508) % 360);

  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (.45 - .48 * .45 * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      .toString(16).padStart(2, "0");
  };
  return "#" + channel(0) + channel(8) + channel(4);
}

export function roomTheme(id: string | null, color?: string | null): Record<string, string> {
  if (!id) return {};
  if (color && /^#[a-f0-9]{6}$/i.test(color)) return {
    "--room-pin": color,
    "--room-border": `color-mix(in srgb, ${color} 75%, black)`,
    "--room-tint": `color-mix(in srgb, ${color} 8%, white)`,
    "--room-heading": `color-mix(in srgb, ${color} 15%, white)`,
    "--room-halo": color + "38",
  };
  let hash = 0;
  for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  const hue = Math.round((hash * 137.508) % 360);
  return {
    "--room-pin": `hsl(${hue} 48% 45%)`,
    "--room-border": `hsl(${hue} 42% 32%)`,
    "--room-tint": `hsl(${hue} 65% 96%)`,
    "--room-heading": `hsl(${hue} 60% 92%)`,
    "--room-halo": `hsl(${hue} 48% 45% / 22%)`,
  };
}
