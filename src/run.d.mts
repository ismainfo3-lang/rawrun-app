export type Point = { latitude: number; longitude: number; accuracy: number | null; timestamp: number };
export type Run = { id: string; startedAt: number; activeMs: number; resumeAt: number | null; distanceM: number; lastPoint: Point | null; momentAtMs: number; momentStatus: 'waiting' | 'offered' | 'skipped' };
export function elapsed(run: Run, now: number): number;
export function pause(run: Run, now: number): Run;
export function resume(run: Run, now: number): Run;
export function distance(a: Point, b: Point): number;
export function addPoint(run: Run, point: Point): Run;
export function formatTime(ms: number): string;
export function formatPace(ms: number, meters: number): string;
