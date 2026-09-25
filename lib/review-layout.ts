// One card scale for every player's actual/optimal view of this round.
export function fitReview(views: number[][], width: number, height: number) {
  for (let card = 64; card >= 14; card--) {
    const rowHeight = card * 1.4 + 52;
    const fits = views.every((counts) => {
      let used = 0,
        rows = 1;
      for (const count of counts.filter(Boolean)) {
        const group = Math.max(82, count * (card + 3) - 3 + 14);
        if (group > width) return false;
        if (used && used + 8 + group > width) {
          rows++;
          used = 0;
        }
        used += (used ? 8 : 0) + group;
      }
      return rows * rowHeight + (rows - 1) * 8 <= height;
    });
    if (fits) return { card, rowHeight };
  }
  return { card: 14, rowHeight: 72 };
}
