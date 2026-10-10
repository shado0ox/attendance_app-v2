import {validAttendanceDate} from './attendanceMonths';
import {employeeAtDate} from './employeeLifecycle';
export type PermissionMarker={id:number;employeeId:string;date:string;label:string;exitTime:string;returnTime:string};
export function permissionMarkers(documents:any[],from='2000-01-01',to='2100-12-31'):PermissionMarker[]{
  const markers:PermissionMarker[]=[];
  for(const doc of documents){
    if(doc.status!=='approved')continue;
    const form=doc.formData||{},start=form.requestType==='absence'?form.absenceFrom:form.date,end=form.requestType==='absence'?form.absenceTo:start;
    if(!validAttendanceDate(start)||!validAttendanceDate(end)||start>end)continue;
    const first=start<from?from:start,last=end>to?to:end;
    if(first>last)continue;
    const limit=Date.parse(last);
    for(let time=Date.parse(first);time<=limit;time+=86400000){
      markers.push({id:doc.id,employeeId:String(doc.employeeId),date:new Date(time).toISOString().slice(0,10),label:'استئذان معتمد',exitTime:form.exitTime||'',returnTime:form.expectedReturnTime||''});
    }
  }
  return markers;
}
export function attachPermissionMarkers(days:any[],markers:PermissionMarker[]){
  const byDay=new Map<string,PermissionMarker[]>();
  for(const marker of markers){const key=JSON.stringify([marker.employeeId,marker.date]);byDay.set(key,[...(byDay.get(key)||[]),marker]);}
  return days.map(day=>({...day,permissions:byDay.get(JSON.stringify([String(day.empId),day.date]))||[]}));
}
/** Make approved requests visible without creating attendance records or worked minutes. */
export function ensurePermissionDays(days:any[],markers:PermissionMarker[],employees:any[]){
  const result=[...days],keys=new Set(days.map(day=>JSON.stringify([String(day.empId),day.date])));
  const people=new Map(employees.map(employee=>[String(employee.id),employee]));
  for(const marker of markers){
    const key=JSON.stringify([marker.employeeId,marker.date]);
    if(keys.has(key)||!people.has(marker.employeeId))continue;
    const employee=employeeAtDate(people.get(marker.employeeId),marker.date);
    result.push({id:'permission:'+key,ids:[],empId:marker.employeeId,empName:employee.name,dept:employee.dept||'',date:marker.date,minutes:null,ignored:0,note:'',reportStatus:'استئذان معتمد — بدون بصمة'});
    keys.add(key);
  }
  return result;
}
