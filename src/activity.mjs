// Local calendar weeks start Monday. Aggregate by start date, never mix in unfinished runs.
export function weekSummary(history, now=Date.now()) {
  const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-(start.getDay()+6)%7);
  const days=['L','M','X','J','V','S','D'].map((label,i)=>{
    const date=new Date(start);date.setDate(start.getDate()+i);
    const end=new Date(date);end.setDate(date.getDate()+1);
    const list=history.filter(r=>r.startedAt>=date.getTime()&&r.startedAt<end.getTime()&&r.startedAt<=now);
    return {label,distanceM:list.reduce((sum,r)=>sum+r.distanceM,0),activeMs:list.reduce((sum,r)=>sum+r.activeMs,0),count:list.length};
  });
  return {days,distanceM:days.reduce((s,d)=>s+d.distanceM,0),activeMs:days.reduce((s,d)=>s+d.activeMs,0),count:days.reduce((s,d)=>s+d.count,0)};
}
