import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Run, RoutePoint } from './run.mjs';
export type Finished = { id:string; startedAt:number; endedAt:number; activeMs:number; distanceM:number; route?:RoutePoint[] };
export type Saved = { run:Run|null; history:Finished[]; checkpoint:number; localProfile?:{name:string;weeklyKm:number}; trackingMode?:'background'; trackingError?:string };
const KEY='rawrun.local.v1';
export const initial:Saved={run:null,history:[],checkpoint:0};
// Task and foreground UI use the same serialized persistence path. Read fresh state before every mutation.
let tail:Promise<unknown>=Promise.resolve();
const listeners=new Set<(s:Saved)=>void>();
function serial<T>(work:()=>Promise<T>):Promise<T>{
  const job=tail.catch(()=>{}).then(work);
  tail=job.catch(()=>{});
  return job;
}
async function load():Promise<Saved>{
  const raw=await AsyncStorage.getItem(KEY);
  if(!raw)return initial;
  const parsed=JSON.parse(raw) as Saved;
  if(!Array.isArray(parsed.history)||!Number.isFinite(parsed.checkpoint))throw Error('Invalid saved state');
  return parsed;
}
export function readState(){return serial(load);}
export function subscribe(listener:(s:Saved)=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function updateState(fn:(s:Saved)=>Saved){
  return serial(async()=>{
    const before=await load(),next=fn(before);
    if(next!==before){await AsyncStorage.setItem(KEY,JSON.stringify(next));listeners.forEach(f=>f(next));}
    return next;
  });
}
