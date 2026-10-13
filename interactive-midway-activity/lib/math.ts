export function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Population standard deviation: divide by N, because the room is the population. */
export function populationStddev(values: number[]) {
  if (!values.length) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

export function formatNumber(value: number | null, digits = 1) {
  return value === null || Number.isNaN(value) ? "—" : value.toFixed(digits);
}

export function histogram(values: number[]) {
  const bins = Array.from({ length: 10 }, (_, index) => ({
    label: `${index * 10}–${index === 9 ? 100 : index * 10 + 9}`,
    count: 0,
  }));

  values.forEach((value) => {
    const index = Math.min(9, Math.max(0, Math.floor(value / 10)));
    bins[index].count += 1;
  });

  return bins;
}
