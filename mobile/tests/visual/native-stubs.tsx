/** Dev-only layout fixtures. No auth, network, location or signing credentials. Never imported by native routes. */
import React from 'react';
import { View } from 'react-native';
import type { Bootstrap, Attendance, BreakStatus } from '../../src/lib/types';
const params = new URLSearchParams(window.location.search);
export const scenario = params.get('scenario') || 'working';
const at = Date.now();
const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh'}).format(at);
const start = at-3*3600000;
const row: Attendance = {id:1,date,checkIn:'08:00',checkOut:null,checkIn2:null,checkOut2:null,checkInTs:String(start),breaks:[]};
const paused = scenario === 'break' || scenario === 'late';
const entry = {id:'break1',recordId:1,date,period:1,name:'استراحة منتصف الدوام',startedAt:at-20*60000,plannedEnd:at+(scenario==='late'?-5:10)*60000,endedAt:null,lateReturnMinutes:0};
export const data: Bootstrap = {employee:{id:'1',name:'أحمد محمد',displayName:params.has('long')?'أحمد محمد عبد الرحمن الموظف المسؤول عن العمليات':'أحمد محمد',departmentName:'العمليات'},companyName:params.has('long')?'شركة وفر دوام لإدارة وتشغيل الموارد البشرية والخدمات':'شركة وفر دوام',today:date,serverNow:at,schedule:[{date,shiftType:'S',note:'',shift:{id:'S',name:'الفترة الصباحية',start:'08:00',end:'16:00'}}],records:scenario==='before'?[]:[row],workState:{workStatus:paused?'break':scenario==='before'?'outside':'working',workStatusText:paused?'في الاستراحة':scenario==='before'?'خارج العمل':'في العمل',activeBreakLateMinutes:0},punchPlans:[{date,period:1,start,end:start+8*3600000}],attendanceLocations:[{id:'site',name:'المكتب الرئيسي',lat:26,lng:50,radius:150}]};
const status: BreakStatus = {serverNow:at,entries:paused?[entry]:[],plans:[{date,period:1,recordId:1,canStart:scenario!=='before',eligible:true,issue:'',rule:{name:'استراحة مرنة',durationMinutes:30,mode:'flexible'},window:null}]};
const refetch = async () => ({});
export function useApiQuery(path:string) { return {data:path.includes('breaks/status')?status:path.includes('employee-profile')?{...data.employee,photoDataUrl:''}:data,isPending:false,error:scenario==='break-error'&&path.includes('breaks/status')?new Error('تعذر تحميل الاستراحة'):null,isFetching:false,isRefetching:false,dataUpdatedAt:at,refetch}; }
const api = async(path:string) => {
  if(path.includes('employee-attendance')) { if(scenario==='report-error') throw new Error('Report unavailable'); return {items:[{date,minutes:180}]}; }
  if(path==='/api/attendance') return {...row,checkOut:'11:00',checkOutTs:String(at),checkOutLocation:'المكتب الرئيسي'};
  throw new Error('Fixture does not send network requests');
};
export const useSession = () => ({api,refresh:refetch,session:{id:'1',companyId:'fixture'}});
export const API_ORIGIN = 'https://fixture.invalid';
export const openURL = async () => undefined;
export const router = {push:(path:unknown) => { (window as unknown as {lastRoute:unknown}).lastRoute=path; }};
export const useIsFocused = () => true;
export const useSafeAreaInsets = () => ({top:24,right:0,bottom:20,left:0});
export const syncArrivalReminders = async () => undefined;
export const requestForegroundPermissionsAsync = async () => ({status:'granted'});
export const punchPosition = async () => ({timestamp:Date.now(),coords:{latitude:26,longitude:50,accuracy:10},mocked:false});
export const punchProof = async () => undefined;
export const cancelAnimation = () => undefined;
export const useSharedValue = (value:number) => React.useRef({value}).current;
export const useAnimatedStyle = (fn:() => object) => fn();
export const withTiming = (value:number) => value;
export const withRepeat = (value:number) => value;
export default {View};
