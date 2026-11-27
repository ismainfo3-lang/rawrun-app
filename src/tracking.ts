import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { addPoint,elapsed,pause } from './run.mjs';
import { updateState } from './session';
const TASK='rawrun-active-location-v1';
TaskManager.defineTask<{locations:Location.LocationObject[]}>(TASK,async({data,error})=>{
  if(error){
    await updateState(s=>s.run?.resumeAt!=null?{...s,run:pause(s.run,Math.max(s.run.resumeAt,s.checkpoint)),trackingError:'El sistema interrumpió el GPS'}:s);
    return;
  }
  if(!data?.locations?.length)return;
  await updateState(s=>{
    if(!s.run||s.run.resumeAt===null||s.trackingMode!=='background')return s;
    let r=s.run;
    const locations=[...data.locations].sort((a,b)=>a.timestamp-b.timestamp);
    for(const loc of locations){
      r=addPoint(r,{latitude:loc.coords.latitude,longitude:loc.coords.longitude,accuracy:loc.coords.accuracy,timestamp:loc.timestamp});
    }
    const last=locations[locations.length-1].timestamp;
    if(last<r.resumeAt!)return s;
    const stamp=Math.min(Date.now(),last);
    if(r.momentStatus==='waiting'&&elapsed(r,stamp)>=r.momentAtMs)r={...r,momentStatus:'offered'};
    return {...s,run:r,checkpoint:Math.max(s.checkpoint,stamp)};
  });
});
export async function trackingStarted(){return Location.hasStartedLocationUpdatesAsync(TASK);}
export async function startTracking(){
  if(await trackingStarted())return;
  await Location.startLocationUpdatesAsync(TASK,{
    accuracy:Location.Accuracy.High,
    activityType:Location.ActivityType.Fitness,
    distanceInterval:5,timeInterval:1000,
    pausesUpdatesAutomatically:false,
    showsBackgroundLocationIndicator:true,
  });
}
export async function stopTracking(){
  if(await trackingStarted())await Location.stopLocationUpdatesAsync(TASK);
}
