import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image } from 'react-native';
import { useApiQuery, useSession } from '../lib/session';
import { Action, Body, Card, ErrorNote, Field, QueryState, Title, useTask } from './ui';
import Signature, { type SignatureHandle } from './Signature';
import { displayDate } from '../lib/dates';
import type { ApprovalInbox, ApprovalRequest, ApprovalDocument } from '../lib/types';
const names: Record<string, string> = { leave: 'إجازة', shift_change: 'تغيير شيفت', swap: 'تبديل دوام', attendance_adjustment: 'تصحيح بصمة', temporary_exit: 'خروج مؤقت', early_exit: 'انصراف مبكر', late_arrival: 'تأخر حضور', absence: 'إذن غياب' };
function Review({ item, document = false }: { item: ApprovalRequest | ApprovalDocument; document?: boolean }) {
  const [expanded, setExpanded] = useState(false), [reason, setReason] = useState(''), [documentReady, setDocumentReady] = useState(false);
  const signature = useRef<SignatureHandle>(null);
  const { api, refresh } = useSession();
  const task = useTask();
  const form = document ? (item as ApprovalDocument).formData : undefined;
  const request = item as ApprovalRequest;
  const path = `/api/mobile/approvals/${document ? 'documents' : 'requests'}/${item.id}`;
  const date = form?.date || request.date;
  const decide = (approved: boolean) => {
    if (!approved && !reason.trim()) { Alert.alert('سبب الرفض مطلوب', 'اكتب سبب الرفض قبل التأكيد.'); return; }
    Alert.alert(approved ? 'اعتماد الطلب؟' : 'رفض الطلب؟', 'سيُحفظ القرار باسم حسابك ولا يمكن تغييره من التطبيق.', [
      { text: 'رجوع', style: 'cancel' },
      { text: approved ? 'اعتماد' : 'رفض', onPress: () => { void task.run(async () => {
        const status = approved ? 'approved' : 'rejected';
        if (document) {
          const managerSignature = await signature.current?.capture();
          if (!managerSignature) throw new Error('وقّع قبل إرسال القرار');
          await api(path, 'POST', { decision: status, reason: reason.trim(), managerSignature });
        } else await api(path, 'PUT', { status, reviewReason: reason.trim() });
        setExpanded(false);
        await refresh();
      }); } },
    ]);
  };
  return <Card>
    <Title>{document ? (item as ApprovalDocument).employeeName : request.empName}</Title>
    <Body>{names[form?.requestType || request.type] || 'طلب موظف'} · {displayDate(date)}</Body>
    <Body>{form?.reason || request.notes}</Body>
    <Action secondary label={expanded ? 'إغلاق التفاصيل' : 'مراجعة الطلب'} disabled={task.busy} onPress={() => setExpanded(!expanded)} />
    {expanded && <>
      {document ? <DocumentDetails path={path} onReady={setDocumentReady} /> : <>
        {request.targetShift && <Body>الشيفت المطلوب: {request.targetShift}</Body>}
        {request.swapWithEmpName && <Body>التبديل مع: {request.swapWithEmpName}</Body>}
        {request.type === 'attendance_adjustment' && <>
          <Body>الفترة: {request.period}</Body>
          <Body>الحضور المطلوب: {request.checkInTime || 'بدون تغيير'}{request.checkInNextDay ? ' (اليوم التالي)' : ''}</Body>
          <Body>الانصراف المطلوب: {request.checkOutTime || 'بدون تغيير'}{request.checkOutNextDay ? ' (اليوم التالي)' : ''}</Body>
        </>}
      </>}
      <Field label="سبب القرار (إلزامي عند الرفض)" value={reason} onChangeText={setReason} maxLength={document ? 2000 : 1000} multiline editable={!task.busy} />
      {document && <Signature ref={signature} disabled={task.busy} />}
      <ErrorNote error={task.error} />
      <Action label="اعتماد الطلب" disabled={task.busy || (document && !documentReady)} onPress={() => decide(true)} />
      <Action secondary label="رفض الطلب" disabled={task.busy || (document && !documentReady)} onPress={() => decide(false)} />
    </>}
  </Card>;
}
function DocumentDetails({ path, onReady }: { path: string; onReady: (ready: boolean) => void }) {
  const query = useApiQuery<{ formData: Record<string, string>; employeeSignature: string }>(path);
  useEffect(() => { onReady(!!query.data && !query.error); return () => onReady(false); }, [query.data, query.error, onReady]);
  const labels: Record<string, string> = { date: 'التاريخ', exitTime: 'وقت الخروج', expectedReturnTime: 'العودة المتوقعة', actualAttendanceTime: 'الحضور الفعلي', absenceFrom: 'الغياب من', absenceTo: 'الغياب إلى', absenceType: 'نوع الغياب' };
  return <QueryState query={query}>
    {Object.entries(query.data?.formData || {}).filter(([key, value]) => labels[key] && value).map(([key, value]) => <Body key={key}>{labels[key]}: {({ annual: 'سنوية', sick: 'مرضية', other: 'أخرى' } as Record<string,string>)[value] || value}</Body>)}
    {query.data?.employeeSignature && <><Body>توقيع الموظف</Body><Image source={{ uri: query.data.employeeSignature }} style={{ width: '100%', height: 100 }} resizeMode="contain" /></>}
  </QueryState>;
}
export default function Approvals() {
  const query = useApiQuery<ApprovalInbox>('/api/mobile/approvals');
  if (query.error || !query.data?.canApproveRequests) {
    if (query.error) return <Card><ErrorNote error={query.error} /><Action secondary label="إعادة تحميل صلاحية الموافقات" onPress={() => { void query.refetch(); }} /></Card>;
    return null;
  }
  const { requests, documents, total = 0 } = query.data;
  return <>
    <Title>طلبات بانتظار موافقتك ({total})</Title>
    <Body muted>حسب صلاحياتك وأقسامك المحددة من الويب. لا يمكنك اعتماد طلبك الشخصي.</Body>
    {!requests.length && !documents.length && <Card><Body>لا توجد طلبات تنتظر موافقتك.</Body></Card>}
    {requests.map(item => <Review key={`request:${item.id}`} item={item} />)}
    {documents.map(item => <Review key={`document:${item.id}`} item={item} document />)}
    {total > requests.length + documents.length && <Body muted>تظهر أول 100 من كل نوع؛ حدّث القائمة بعد المراجعة لعرض البقية.</Body>}
  </>;
}
