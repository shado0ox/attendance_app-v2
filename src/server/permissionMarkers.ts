import {and,eq} from 'drizzle-orm';
import {db,schema} from '../db/index';
import {permissionMarkers} from '../lib/permissionMarkers';
export async function approvedPermissionMarkers(companyId:string,from?:string,to?:string){
  const rows=await db.select({id:schema.electronicDocuments.id,employeeId:schema.electronicDocuments.employeeId,status:schema.electronicDocuments.status,formData:schema.electronicDocuments.formData}).from(schema.electronicDocuments).where(and(eq(schema.electronicDocuments.companyId,companyId),eq(schema.electronicDocuments.status,'approved')));
  return permissionMarkers(rows,from,to);
}
