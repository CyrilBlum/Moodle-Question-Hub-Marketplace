/** "1 Frage", "3 Fragen". */
export const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
