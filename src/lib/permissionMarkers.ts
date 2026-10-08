import {validAttendanceDate} from './attendanceMonths';
export type PermissionMarker={id:number;employeeId:string;date:string;label:string;exitTime:string;returnTime:string};
export function permissionMarkers(documents:any[],from='2000-01-01',to='2100-12-31'):PermissionMarker[]{
  const markers:PermissionMarker[]=[];
  for(const doc of documents){
    if(doc.status!=='approved')continue;
    const form=doc.formData||{},start=form.requestType==='absence'?form.absenceFrom:form.date,end=form.requestType==='absence'?form.absenceTo:start;
    if(!validAttendanceDate(start)||!validAttendanceDate(end)||start>end)continue;
    const first=start<from?from:start,last=end>to?to:end;
    if(first>last)continue;
    const limit=Math.min(Date.parse(last),Date.parse(first)+365*86400000);
    for(let time=Date.parse(first);time<=limit;time+=86400000){
      markers.push({id:doc.id,employeeId:String(doc.employeeId),date:new Date(time).toISOString().slice(0,10),label:'استئذان معتمد',exitTime:form.exitTime||'',returnTime:form.expectedReturnTime||''});
    }
  }
  return markers;
}
export function attachPermissionMarkers(days:any[],markers:PermissionMarker[]){
  return days.map(day=>({...day,permissions:markers.filter(marker=>marker.employeeId===String(day.empId)&&marker.date===day.date)}));
}
