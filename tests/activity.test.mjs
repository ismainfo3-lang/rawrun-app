import test from 'node:test';
import assert from 'node:assert/strict';
import { weekSummary } from '../src/activity.mjs';
test('weekly totals include only current local Monday-Sunday up to now',()=>{
 const at=(d,h=12)=>new Date(2026,10,d,h).getTime();
 const r=(d,meters)=>({startedAt:at(d),distanceM:meters,activeMs:meters*300});
 const a=weekSummary([r(22,9000),r(23,3000),r(25,5000),r(29,9000)],at(27));
 assert.equal(a.distanceM,8000);assert.equal(a.activeMs,2400000);assert.equal(a.count,2);assert.equal(a.days[0].distanceM,3000);assert.equal(a.days[2].distanceM,5000);
});
test('empty weeks have seven zero days',()=>{const a=weekSummary([],new Date(2026,10,27).getTime());assert.equal(a.days.length,7);assert.equal(a.count,0);assert.equal(a.distanceM,0);});
