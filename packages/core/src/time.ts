/** Compare validated UTC ISO timestamps without losing fractional-second precision. */
export function compareInstants(left: string, right: string): number {
  const whole = (value: string) => Date.parse(value.replace(/\.\d+(?=Z$)/, ''));
  const seconds = whole(left) - whole(right);
  if (seconds !== 0) return Math.sign(seconds);
  const fraction = (value: string) => value.match(/\.(\d+)Z$/)?.[1] ?? '';
  const a = fraction(left),
    b = fraction(right);
  const width = Math.max(a.length, b.length);
  const paddedA = a.padEnd(width, '0'),
    paddedB = b.padEnd(width, '0');
  return paddedA < paddedB ? -1 : paddedA > paddedB ? 1 : 0;
}
