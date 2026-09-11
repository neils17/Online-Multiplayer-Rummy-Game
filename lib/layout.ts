// Dimensions are logical CSS pixels. One uniform scale preserves card geometry
// and pointer coordinates while keeping the whole table inside the visible area.
export function fitViewport(width: number, height: number) {
  const landscape = width > height;
  const scale = Math.min(
    1,
    width / (landscape ? 1000 : 440),
    height / (landscape ? 720 : 900),
  );
  return { width: width / scale, height: height / scale, scale, landscape };
}

export function fitHand(
  counts: number[],
  width: number,
  height: number,
  expert = false,
) {
  const gap = 8,
    padding = expert ? 0 : 14,
    label = expert ? 0 : 28;
  for (let card = 116; card >= 18; card--) {
    const step = card * (expert ? 0.43 : 0.52);
    let rows = 1,
      used = 0,
      fits = true;
    for (const count of counts) {
      const group = Math.max(
        expert ? 0 : 64,
        card + Math.max(0, count - 1) * step + padding,
      );
      if (group > width) {
        fits = false;
        break;
      }
      if (used && used + gap + group > width) {
        rows++;
        used = 0;
      }
      used += (used ? gap : 0) + group;
    }
    const rowHeight = card * 1.4 + label + 16;
    if (fits && rows * rowHeight + (rows - 1) * gap <= height)
      return { card, step, rows, rowHeight };
  }
  return { card: 18, step: 9, rows: counts.length, rowHeight: 66 };
}
