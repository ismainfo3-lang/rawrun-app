// Pure running calculations, independent of React Native.
export function elapsed(run, now) {
  return Math.max(0, run.activeMs + (run.resumeAt === null ? 0 : Math.max(0, now - run.resumeAt)));
}
export function pause(run, now) {
  return {...run, activeMs: elapsed(run, now), resumeAt: null, lastPoint: null};
}
export function resume(run, now) {
  return run.resumeAt !== null ? run : {...run, resumeAt: now, lastPoint: null};
}
export function distance(a, b) {
  const rad = x => x * Math.PI / 180;
  const h = Math.sin(rad(b.latitude-a.latitude)/2)**2 +
    Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.longitude)/2)**2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0,h))));
}
export function addPoint(run, point) {
  if (run.resumeAt === null || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) ||
      !Number.isFinite(point.timestamp) || Math.abs(point.latitude)>90 || Math.abs(point.longitude)>180 ||
      point.timestamp < run.resumeAt || point.accuracy == null || !Number.isFinite(point.accuracy) ||
      point.accuracy < 0 || point.accuracy > 25) return run;
  const prev = run.lastPoint;
  if (!prev) return {...run, lastPoint: point};
  const dt = (point.timestamp-prev.timestamp)/1000;
  if (dt <= 0) return run;
  const d = distance(prev,point);
  if (dt > 30) return {...run,lastPoint:point};
  if (d < Math.max(3, (point.accuracy + prev.accuracy)*0.35)) return run;
  if (d/dt > 12) return {...run,lastPoint:null};
  return {...run, distanceM:run.distanceM+d,lastPoint:point};
}
export function formatTime(ms) {
  const s = Math.floor(Math.max(0,ms)/1000);
  return [Math.floor(s/3600), Math.floor(s/60)%60,s%60].map(v=>String(v).padStart(2,'0')).join(':');
}
export function formatPace(ms, meters) {
  if (meters < 50 || ms <= 0) return '—';
  const s = Math.round(ms/meters);
  return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
}
