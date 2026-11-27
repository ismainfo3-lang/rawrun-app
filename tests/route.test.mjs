import test from 'node:test';
import assert from 'node:assert/strict';
import {addPoint,pause,resume} from '../src/run.mjs';
const p=(longitude,timestamp)=>({latitude:0,longitude,timestamp,accuracy:4});
test('route marks separate segments after pause and GPS gaps',()=>{
 let r={id:'a',startedAt:1000,activeMs:0,resumeAt:1000,distanceM:0,lastPoint:null,momentAtMs:600000,momentStatus:'waiting'};
 r=addPoint(r,p(0,1000));r=addPoint(r,p(.00005,2000));
 assert.equal(r.route.length,2);assert.equal(r.route[0].breakBefore,true);
 const d=r.distanceM;r=resume(pause(r,3000),10000);r=addPoint(r,p(.01,10000));
 assert.equal(r.distanceM,d);assert.equal(r.route.at(-1).breakBefore,true);
 r=addPoint(r,p(.02,50000));assert.equal(r.distanceM,d);assert.equal(r.route.at(-1).breakBefore,true);
});
