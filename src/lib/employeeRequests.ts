import {validAttendanceDate} from './attendanceMonths';
import {employeeAtDate,isActiveEmployee} from './employeeLifecycle';

/** Request ownership and names come from the server's employee directory. */
export function employeeRequestValues(body:any,data:any){
  const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
  if(!validAttendanceDate(body.date)||!['leave','shift_change','swap'].includes(body.type))fail(400,'تاريخ أو نوع الطلب غير صالح');
  if(!['string','number'].includes(typeof body.empId)||!String(body.empId))fail(400,'حدد الموظف');
  const employee=data?.employees?.find((e:any)=>String(e.id)===String(body.empId));
  if(!employee)fail(404,'الموظف غير موجود');
  const reason=body.notes??body.note??'';
  if(typeof reason!=='string'||reason.length>1000)fail(400,'ملاحظات الطلب يجب ألا تتجاوز 1000 حرف');
  if(body.status!==undefined&&!['pending','approved','rejected'].includes(body.status))fail(400,'حالة الطلب غير صالحة');
  const historical=employeeAtDate(employee,body.date);
  const values:any={empId:String(employee.id),empName:employee.name,dept:historical.dept||'',date:body.date,type:body.type,notes:reason.trim()};
  if(body.type==='shift_change'){
    if(!data?.shiftTypes?.some((shift:any)=>shift.id===body.targetShift))fail(400,'الشيفت المطلوب غير متاح');
    values.targetShift=body.targetShift;
  }
  if(body.type==='swap'){
    const other=data?.employees?.find((e:any)=>String(e.id)===String(body.swapWithEmpId));
    if(!other||String(other.id)===String(employee.id)||!isActiveEmployee(employeeAtDate(other,body.date)))fail(400,'اختر موظف تبديل صالحًا');
    values.swapWithEmpId=String(other.id);values.swapWithEmpName=other.name;
  }
  return values;
}
