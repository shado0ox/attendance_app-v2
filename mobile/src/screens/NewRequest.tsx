import React, { useRef, useState } from "react";
import { Share } from "react-native";
import { Host, Picker, Switch } from "@expo/ui";
import { router } from "expo-router";
import {
  Action,
  Body,
  Card,
  ErrorNote,
  Field,
  Page,
  QueryState,
  Title,
  confirm,
  useTask,
} from "../components/ui";
import Signature, { type SignatureHandle } from "../components/Signature";
import { useApiQuery, useSession } from "../lib/session";
import { today, validDate } from "../lib/dates";
import { requestNames } from "./Requests";
const electronicTypes = [
  "temporary_exit",
  "early_exit",
  "late_arrival",
  "absence",
];
export default function NewRequest() {
  const { api, session, refresh } = useSession(),
    task = useTask(),
    signature = useRef<SignatureHandle>(null);
  const options = useApiQuery<{
    shifts: { id: string; name: string }[];
    colleagues: { id: string; name: string }[];
  }>("/api/mobile/request-options");
  const [type, setType] = useState("leave"),
    [date, setDate] = useState(today()),
    [notes, setNotes] = useState(""),
    [targetShift, setTargetShift] = useState(""),
    [colleague, setColleague] = useState(""),
    [checkIn, setCheckIn] = useState(""),
    [checkOut, setCheckOut] = useState(""),
    [period, setPeriod] = useState(1),
    [nextDay, setNextDay] = useState(false),
    [returnNextDay, setReturnNextDay] = useState(false),
    [absenceTo, setAbsenceTo] = useState(today()),
    [absenceType, setAbsenceType] = useState("annual"),
    [commitment, setCommitment] = useState(false),
    [saved, setSaved] = useState<{ url?: string } | null>(null);
  const electronic = electronicTypes.includes(type);
  const submit = async () => {
    if (saved) return;
    await task.run(async () => {
      if (!validDate(date))
        throw new Error("اكتب تاريخًا ميلاديًا صحيحًا بصيغة YYYY-MM-DD");
      if (!notes.trim()) throw new Error("اكتب سبب الطلب");
      if (electronic) {
        if (!commitment) throw new Error("يلزم الموافقة على إقرار الموظف");
        const employeeSignature = await signature.current?.capture();
        if (!employeeSignature) throw new Error("أضف التوقيع");
        if (
          !(await confirm(
            "توقيع وحفظ الإذن",
            "بعد الحفظ يصبح المستند موقّعًا ولا يمكن تعديله. يمكنك مشاركة رابط اعتماد المدير من طلباتك.",
          ))
        )
          return;
        const formData = {
          date,
          requestType: type,
          reason: notes,
          employeeCommitment: true,
          exitTime: checkIn,
          expectedReturnTime: checkOut,
          actualAttendanceTime: checkIn,
          absenceFrom: date,
          absenceTo,
          absenceType,
        };
        const result = await api<{ url: string }>(
          "/api/electronic-documents",
          "POST",
          { formData, employeeSignature },
        );
        setSaved(result);
      } else {
        if (type === "shift_change" && !targetShift)
          throw new Error("اختر الشيفت المطلوب");
        if (type === "swap" && !colleague) throw new Error("اختر موظف التبديل");
        if (type === "attendance_adjustment" && !checkIn && !checkOut)
          throw new Error("حدد وقت الحضور أو الانصراف");
        const validTime = (value: string) =>
          !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
        if (!validTime(checkIn) || !validTime(checkOut))
          throw new Error("اكتب الوقت بصيغة HH:mm");
        await api("/api/requests", "POST", {
          empId: session!.id,
          date,
          type,
          notes,
          ...(type === "shift_change" ? { targetShift } : {}),
          ...(type === "swap" ? { swapWithEmpId: colleague } : {}),
          ...(type === "attendance_adjustment"
            ? {
                checkInTime: checkIn || undefined,
                checkOutTime: checkOut || undefined,
                details: {
                  period,
                  checkInNextDay: nextDay,
                  checkOutNextDay: returnNextDay,
                },
              }
            : {}),
        });
        setSaved({});
      }
      await refresh();
    });
  };
  if (saved)
    return (
      <Page>
        <Card>
          <Title>تم حفظ طلبك</Title>
          <Body>يمكنك متابعة قرار المدير من قائمة الطلبات.</Body>
          {saved.url && (
            <Action
              label="مشاركة رابط اعتماد المدير"
              onPress={() => {
                void task.run(async () => {
                  await Share.share({ message: saved.url! });
                });
              }}
            />
          )}
          <ErrorNote error={task.error} />
          <Action
            secondary
            label="العودة للطلبات"
            onPress={() => router.back()}
          />
        </Card>
      </Page>
    );
  return (
    <Page>
      <Card>
        <Title>تفاصيل الطلب</Title>
        <Body>نوع الطلب</Body>
        <Host matchContents={{ vertical: true }} layoutDirection="rightToLeft">
          <Picker
            selectedValue={type}
            enabled={!task.busy}
            onValueChange={setType}
          >
            {Object.entries(requestNames).map(([value, label]) => (
              <Picker.Item key={value} value={value} label={label} />
            ))}
          </Picker>
        </Host>
        <Field
          label="التاريخ الميلادي (YYYY-MM-DD)"
          value={date}
          onChangeText={setDate}
          maxLength={10}
          keyboardType="numbers-and-punctuation"
          editable={!task.busy}
        />
        {["shift_change", "swap"].includes(type) && (
          <QueryState query={options}>
            <Host
              matchContents={{ vertical: true }}
              layoutDirection="rightToLeft"
            >
              <Picker
                selectedValue={type === "swap" ? colleague : targetShift}
                onValueChange={type === "swap" ? setColleague : setTargetShift}
                enabled={!task.busy}
              >
                <Picker.Item value="" label="اختر من القائمة" />
                {(type === "swap"
                  ? options.data?.colleagues
                  : options.data?.shifts
                )?.map((item) => (
                  <Picker.Item
                    key={item.id}
                    value={item.id}
                    label={item.name}
                  />
                ))}
              </Picker>
            </Host>
          </QueryState>
        )}
        {type === "attendance_adjustment" && (
          <>
            <Body>الفترة المراد تصحيحها</Body>
            <Host
              matchContents={{ vertical: true }}
              layoutDirection="rightToLeft"
            >
              <Picker
                enabled={!task.busy}
                selectedValue={period}
                onValueChange={setPeriod}
              >
                <Picker.Item value={1} label="الفترة الأولى" />
                <Picker.Item value={2} label="الفترة الثانية" />
              </Picker>
            </Host>
            <Field
              label="وقت الحضور المطلوب (HH:mm)"
              value={checkIn}
              onChangeText={setCheckIn}
              maxLength={5}
              keyboardType="numbers-and-punctuation"
              editable={!task.busy}
            />
            <Field
              label="وقت الانصراف المطلوب (HH:mm)"
              value={checkOut}
              onChangeText={setCheckOut}
              maxLength={5}
              keyboardType="numbers-and-punctuation"
              editable={!task.busy}
            />
            <Host
              matchContents={{ vertical: true }}
              layoutDirection="rightToLeft"
            >
              <Switch
                label="الحضور في اليوم التالي"
                value={nextDay}
                onValueChange={setNextDay}
                disabled={task.busy}
              />
              <Switch
                label="الانصراف في اليوم التالي"
                value={returnNextDay}
                onValueChange={setReturnNextDay}
                disabled={task.busy}
              />
            </Host>
          </>
        )}
        {["temporary_exit", "early_exit", "late_arrival"].includes(type) && (
          <Field
            label={
              type === "late_arrival"
                ? "وقت الحضور الفعلي (HH:mm)"
                : "وقت الخروج (HH:mm)"
            }
            value={checkIn}
            onChangeText={setCheckIn}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            editable={!task.busy}
          />
        )}
        {type === "temporary_exit" && (
          <Field
            label="وقت العودة المتوقع (HH:mm)"
            value={checkOut}
            onChangeText={setCheckOut}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            editable={!task.busy}
          />
        )}
        {type === "absence" && (
          <>
            <Field
              label="إلى تاريخ (YYYY-MM-DD)"
              value={absenceTo}
              onChangeText={setAbsenceTo}
              maxLength={10}
              editable={!task.busy}
            />
            <Host
              matchContents={{ vertical: true }}
              layoutDirection="rightToLeft"
            >
              <Picker
                selectedValue={absenceType}
                onValueChange={setAbsenceType}
              >
                <Picker.Item value="annual" label="إجازة سنوية" />
                <Picker.Item value="sick" label="إجازة مرضية" />
                <Picker.Item value="other" label="أخرى" />
              </Picker>
            </Host>
          </>
        )}
        <Field
          label="سبب الطلب"
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={1000}
          editable={!task.busy}
          style={{ minHeight: 110 }}
        />
        {electronic && (
          <>
            <Signature disabled={task.busy} ref={signature} />
            <Host
              matchContents={{ vertical: true }}
              layoutDirection="rightToLeft"
            >
              <Switch
                label="أقر بصحة البيانات وألتزم بالعودة في الموعد المحدد"
                value={commitment}
                onValueChange={setCommitment}
                disabled={task.busy}
              />
            </Host>
          </>
        )}
        <ErrorNote error={task.error} />
        <Action
          label={
            task.busy
              ? "جاري الحفظ…"
              : electronic
                ? "توقيع وحفظ الإذن"
                : "إرسال الطلب"
          }
          disabled={task.busy}
          onPress={() => {
            void submit();
          }}
        />
      </Card>
    </Page>
  );
}
