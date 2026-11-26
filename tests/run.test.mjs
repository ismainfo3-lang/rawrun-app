import test from 'node:test';
import assert from 'node:assert/strict';
import { elapsed,pause,resume,addPoint,distance,formatTime,formatPace } from '../src/run.mjs';
const run = {id:'a',startedAt:1000,activeMs:0,resumeAt:1000,distanceM:0,lastPoint:null,momentAtMs:600000,momentStatus:'waiting'};
const p = (longitude,timestamp,accuracy=4)=>({latitude:0,longitude,timestamp,accuracy});
test('pause excludes stopped time and clears GPS anchor',()=>{
  const stopped=pause({...run,lastPoint:p(0,1000)},11000);
  assert.equal(elapsed(stopped,30000),10000);
  assert.equal(stopped.lastPoint,null);
  assert.equal(elapsed(resume(stopped,30000),35000),15000);
});
test('distance is measured in metres',()=>assert.ok(Math.abs(distance(p(0,1000),p(.001,2000))-111.195)<.1));
test('poor fixes, jumps and paused points do not add distance',()=>{
  let r=addPoint(run,p(0,1000));
  r=addPoint(r,p(.00005,2000));
  assert.ok(r.distanceM>5 && r.distanceM<6);
  assert.equal(addPoint(r,p(.0001,3000,70)),r);
  assert.equal(addPoint(r,p(.1,3000)).distanceM,r.distanceM);
  assert.equal(addPoint(pause(r,4000),p(.2,5000)).distanceM,r.distanceM);
});
test('time and pace formats',()=>{
  assert.equal(formatTime(3661000),'01:01:01');
  assert.equal(formatPace(300000,1000),'5:00');
  assert.equal(formatPace(1000,1),'—');
});
