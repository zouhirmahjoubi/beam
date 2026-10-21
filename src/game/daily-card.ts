/**
 * The daily result card: a few lines a player can share after today's
 * puzzle, with counts only, so it spoils nothing.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface DailyResult {
  /** Local day key, YYYY-MM-DD. */
  day: string;
  crystals: number;
  pieces: number;
  /** Palms that touched the beam in the final answer, 0 to 2. */
  palms: number;
  streak: number;
  url: string;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function dailyCard(r: DailyResult): string {
  const [y, m, d] = r.day.split('-').map(Number);
  const date = `${d} ${MONTHS[(m - 1 + 12) % 12]} ${y}`;
  const used: string[] = [];
  if (r.pieces > 0) used.push(count(r.pieces, 'piece', 'pieces'));
  if (r.palms === 2) used.push('both palms');
  else if (r.palms === 1) used.push('1 palm');
  const how = used.length ? ` with ${used.join(' and ')}` : '';
  return [
    `Palmlight daily, ${date}`,
    `Lit ${count(r.crystals, 'crystal', 'crystals')}${how}.`,
    `Streak: ${count(r.streak, 'day', 'days')}`,
    r.url,
  ].join('\n');
}
