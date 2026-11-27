export type ActivityRun = { startedAt:number; distanceM:number; activeMs:number };
export type Day = { label:string; distanceM:number; activeMs:number; count:number };
export function weekSummary(history:ActivityRun[],now?:number):{days:Day[];distanceM:number;activeMs:number;count:number};
