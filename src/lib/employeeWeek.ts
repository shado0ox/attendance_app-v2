/** Riyadh calendar weeks always run Saturday through Friday, independent of device timezone. */
export function employeeWeekDates(now=Date.now(),offset=0) {
  const today=new Date(now).toLocaleDateString('en-CA',{timeZone:'Asia/Riyadh'});
  const anchor=new Date(today+'T12:00:00Z');
  anchor.setUTCDate(anchor.getUTCDate()-((anchor.getUTCDay()+1)%7)+offset*7);
  return Array.from({length:7},(_,i)=>new Date(anchor.getTime()+i*86400000).toISOString().slice(0,10));
}
