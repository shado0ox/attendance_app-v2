import CompanyRegistration from './CompanyRegistration';
import { useState, useEffect } from 'react';
import { User, Shield, UserPlus, LogIn, Loader, Fingerprint, ScanFace, AlertCircle, ShieldCheck } from 'lucide-react';

interface LoginScreenProps {
  appSettings: any;
  onAdminLogin: (admin: any) => void;
  onEmployeeLogin: (employee: any) => void;
  sessionExpiredMessage?: string;
  onDismissSessionExpiredMessage?: () => void;
}

// ─── WebAuthn helpers ───────────────────────────────────────────────────────

function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ────────────────────────────────────────────────────────────────────────────

export default function LoginScreen({
  appSettings,
  onAdminLogin,
  onEmployeeLogin,
  sessionExpiredMessage,
  onDismissSessionExpiredMessage
}: LoginScreenProps) {
  const [activeTab, setActiveTab] = useState<'emp' | 'admin' | 'reg'>('emp');

  // Admin login state
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);

  // Employee login state
  const [empUsername, setEmpUsername] = useState('');
  const [empPassword, setEmpPassword] = useState('');
  const [empError, setEmpError] = useState('');
  const [empLoading, setEmpLoading] = useState(false);

  // Biometric state
  const [empLoginMethod, setEmpLoginMethod] = useState<'password' | 'biometric'>('password');
  const [biometricType, setBiometricType] = useState<'face' | 'fingerprint'>('face');
  const [biometricScanning, setBiometricScanning] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState('');
  const [webAuthnSupported, setWebAuthnSupported] = useState(false);

  // Registration state — employees only (admins added via Admin portal)
  const [regCompanyCode, setRegCompanyCode] = useState('101');
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);
  const [regLoading, setRegLoading] = useState(false);

  useEffect(() => {
    setWebAuthnSupported(
      typeof window !== 'undefined' &&
      !!window.PublicKeyCredential &&
      typeof navigator.credentials?.get === 'function'
    );
  }, []);

  // ── Admin Login ────────────────────────────────────────────────────────────
  const handleAdminLogin = async () => {
    if (!adminUsername.trim()) { setAdminError('الرجاء إدخال اسم المستخدم للمدير'); return; }
    if (!adminPassword.trim()) { setAdminError('الرجاء إدخال كلمة المرور'); return; }
    setAdminError('');
    setAdminLoading(true);
    try {
      const response = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: adminUsername.trim(),
          password: adminPassword.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) { setAdminError(data?.error || 'فشل تسجيل الدخول'); return; }
      onAdminLogin(data);
    } catch (e: any) {
      setAdminError('فشل الاتصال بالخادم: ' + e.message);
    } finally {
      setAdminLoading(false);
    }
  };

  // ── Employee Password Login ────────────────────────────────────────────────
  const handleEmployeeLogin = async () => {
    if (!empUsername.trim()) { setEmpError('الرجاء اختيار أو إدخال اسم المستخدم أولاً'); return; }
    if (!empPassword) { setEmpError('أدخل كلمة المرور المطلوبة للدخول'); return; }
    setEmpError('');
    setEmpLoading(true);
    try {
      const response = await fetch('/api/auth/employee-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: empUsername.trim(), password: empPassword.trim() }),
      });
      const data = await response.json();
      if (!response.ok) { setEmpError(data?.error || 'فشل تسجيل الدخول'); return; }
      onEmployeeLogin(data);
    } catch (e: any) {
      setEmpError('فشل الاتصال بالخادم: ' + e.message);
    } finally {
      setEmpLoading(false);
    }
  };

  // ── WebAuthn Biometric Login (Real) ───────────────────────────────────────
  const handleBiometricLogin = async () => {
    if (!empUsername.trim()) {
      setEmpError('الرجاء إدخال اسم المستخدم أولاً للتحقق البيومتري');
      return;
    }

    if (!webAuthnSupported) {
      setEmpError('جهازك أو متصفحك لا يدعم التحقق البيومتري (WebAuthn). استخدم كلمة المرور بدلاً من ذلك.');
      return;
    }

    setEmpError('');
    setBiometricScanning(true);
    setBiometricStatus('🔐 جاري التواصل مع خادم التحقق...');

    try {
      // 1. طلب challenge من السيرفر
      const challengeRes = await fetch('/api/auth/webauthn-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: empUsername.trim() }),
      });

      if (!challengeRes.ok) {
        const err = await challengeRes.json().catch(() => ({}));
        // إذا الموظف لم يسجل بصمته بعد، عرّض رسالة واضحة
        if (challengeRes.status === 404) {
          setEmpError('لم يتم تسجيل بصمتك البيومترية بعد. يرجى التواصل مع المدير لتفعيل البصمة على حسابك.');
          setBiometricScanning(false);
          return;
        }
        throw new Error(err.error || 'فشل الحصول على رمز التحقق من الخادم');
      }

      const { challenge, credentialIds, empId: resolvedEmpId, companyId: resolvedCompanyId } = await challengeRes.json();

      setBiometricStatus(
        biometricType === 'face'
          ? '📸 جاري تشغيل مستشعر الوجه... انظر للكاميرا'
          : '👆 ضع إصبعك على مستشعر البصمة'
      );

      // 2. طلب التحقق من الجهاز (يفتح مستشعر الوجه أو الإصبع الحقيقي)
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: base64urlToUint8Array(challenge),
          allowCredentials: credentialIds.map((id: string) => ({
            id: base64urlToUint8Array(id),
            type: 'public-key' as const,
            transports: ['internal'] as AuthenticatorTransport[],
          })),
          userVerification: 'required', // يشترط التحقق البيومتري الفعلي من الجهاز
          timeout: 60000,
        },
      }) as PublicKeyCredential | null;

      if (!assertion) throw new Error('تم إلغاء عملية التحقق');

      setBiometricStatus('✅ تم قراءة البصمة، جاري التحقق مع الخادم...');

      // 3. إرسال نتيجة التحقق للخادم للتأكيد النهائي
      const response = assertion.response as AuthenticatorAssertionResponse;
      const verifyRes = await fetch('/api/auth/webauthn-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empId: resolvedEmpId,
          companyId: resolvedCompanyId,
          credentialId: arrayBufferToBase64url(assertion.rawId),
          clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
          authenticatorData: arrayBufferToBase64url(response.authenticatorData),
          signature: arrayBufferToBase64url(response.signature),
          userHandle: response.userHandle ? arrayBufferToBase64url(response.userHandle) : null,
        }),
      });

      if (!verifyRes.ok) {
        const errData = await verifyRes.json().catch(() => ({}));
        throw new Error(errData.error || 'فشل التحقق النهائي من الخادم');
      }

      const data = await verifyRes.json();
      setBiometricStatus('🎉 تم التحقق بنجاح! جاري الدخول...');
      setTimeout(() => {
        setBiometricScanning(false);
        onEmployeeLogin(data);
      }, 800);

    } catch (e: any) {
      setBiometricScanning(false);
      setBiometricStatus('');
      if (e.name === 'NotAllowedError') {
        setEmpError('❌ تم رفض أو إلغاء عملية التحقق البيومتري. حاول مرة أخرى.');
      } else if (e.name === 'SecurityError') {
        setEmpError('❌ خطأ أمني: تأكد من أن التطبيق يعمل على HTTPS.');
      } else {
        setEmpError('❌ فشل التحقق البيومتري: ' + e.message);
      }
    }
  };

  // ── Registration (Employees Only) ─────────────────────────────────────────
  const handleRegister = async () => {
    setRegError('');
    setRegSuccess(false);

    if (!regName.trim()) { setRegError('الرجاء إدخال الاسم الكامل'); return; }
    if (!regUsername.trim()) { setRegError('الرجاء إدخال اسم المستخدم'); return; }
    if (!regPhone.trim()) { setRegError('الرجاء إدخال رقم الجوال'); return; }
    if (regPassword.length < 6) { setRegError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    if (regPassword !== regConfirmPassword) { setRegError('كلمتا المرور غير متطابقتين'); return; }

    setRegLoading(true);
    try {
      const payload = {
        name: regName.trim(),
        type: 'employee', // التسجيل العام للموظفين فقط — المديرون يُضافون من لوحة الإدارة
        username: regUsername.trim().toLowerCase(),
        phone: regPhone.trim(),
        password: regPassword,
        status: 'pending',
        companyCode: regCompanyCode.trim(),
      };

      const response = await fetch('/api/registration-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'فشل إرسال الطلب إلى الخادم');
      }

      setRegSuccess(true);
      setRegName(''); setRegUsername(''); setRegPhone('');
      setRegPassword(''); setRegConfirmPassword('');
    } catch (e: any) {
      setRegError('حدث خطأ أثناء إرسال الطلب: ' + e.message);
    } finally {
      setRegLoading(false);
    }
  };


  return (
    <div id="login-screen" className="wafr-login" dir="rtl">
      <aside className="wafr-login-story" aria-label="وفر دوام">
        <img src="/brand/logo-dark.svg" alt="وفر دوام | WAFR Dawam" width="1024" height="224" />
        <div>
          <h1>يوم عمل واضح.<br />من الحضور إلى الانصراف.</h1>
          <p>سجّل حضورك، راجع دوام الأسبوع، وتابع طلباتك من مكان واحد.</p>
          <div className="wafr-story-week" aria-hidden="true">
            {['سبت','أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة'].map(day => <span key={day}>{day}<i /></span>)}
          </div>
        </div>
        <p className="wafr-story-foot">حضور منظّم، ووقت محسوب</p>
      </aside>
      <div className="wafr-login-form">

        {sessionExpiredMessage && (
          <div
            className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-right"
            dir="rtl"
          >
            <AlertCircle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] font-bold text-amber-800 leading-relaxed flex-1">{sessionExpiredMessage}</p>
            {onDismissSessionExpiredMessage && (
              <button
                onClick={onDismissSessionExpiredMessage}
                className="text-amber-400 hover:text-amber-700 text-xs font-black leading-none px-1"
                aria-label="إغلاق"
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* Logo and Brand */}
        <div className="wafr-login-brand flex flex-col items-center mb-8 text-center">
<img src="/brand/logo-light.svg" alt="وفر دوام | WAFR Dawam" className="w-full max-w-[280px] h-auto" width="1024" height="224" />
                    <p className="text-xs text-slate-400 mt-1">حضور منظّم، ووقت محسوب</p>
        </div>

        {/* Tab Selection */}
        <div className="wafr-login-tabs flex p-1 mb-6 bg-slate-100 rounded-xl">
          <button
            aria-pressed={activeTab === 'emp'}
            onClick={() => { setActiveTab('emp'); setEmpError(''); }}
            className={`flex items-center justify-center gap-2 flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'emp' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <User size={14} />
            <span>بوابة الموظف</span>
          </button>

          <button
            aria-pressed={activeTab === 'admin'}
            onClick={() => { setActiveTab('admin'); setAdminError(''); }}
            className={`flex items-center justify-center gap-2 flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'admin' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Shield size={14} />
            <span>بوابة المدير</span>
          </button>

          <button
            aria-pressed={activeTab === 'reg'}
            onClick={() => { setActiveTab('reg'); setRegError(''); }}
            className={`flex items-center justify-center gap-2 flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'reg' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <UserPlus size={14} />
            <span>طلب حساب</span>
          </button>
        </div>

        {/* ── Employee Login Panel ── */}
        {activeTab === 'emp' && (
          <div className="flex flex-col gap-4">

            <div className="flex flex-col gap-1.5 text-right" dir="rtl">
              <label className="text-xs font-bold text-slate-600 pr-1">اسم المستخدم أو البريد الإلكتروني</label>
              <input
                type="text"
                value={empUsername}
                onChange={(e) => setEmpUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم أو بريدك المسجل"
                className="w-full px-4 py-2.5 text-sm border rounded-lg placeholder-slate-300 text-right font-medium"
              />
            </div>

            {/* Toggle Login Method */}
            <div className="flex gap-2 p-1 bg-slate-50 border border-slate-200/65 rounded-lg mt-1 text-xs" dir="rtl">
              <button
                type="button"
                onClick={() => { setEmpLoginMethod('password'); setBiometricScanning(false); setBiometricStatus(''); setEmpError(''); }}
                className={`flex-1 py-1.5 rounded font-bold transition-all text-center ${empLoginMethod === 'password' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                كلمة المرور
              </button>
              <button
                type="button"
                onClick={() => { setEmpLoginMethod('biometric'); setEmpError(''); setBiometricStatus(''); }}
                className={`flex-1 py-1.5 rounded font-bold transition-all text-center flex items-center justify-center gap-1.5 ${empLoginMethod === 'biometric' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <ScanFace size={13} />
                <span>بصمة الجهاز</span>
              </button>
            </div>

            {/* PASSWORD LOGIN */}
            {empLoginMethod === 'password' && (
              <div className="flex flex-col gap-4 text-right" dir="rtl">
                <div className="flex flex-col gap-1.5">
                  <div className="wafr-password-heading flex justify-between items-start gap-3 pr-1">
                    <label className="text-xs font-bold text-slate-600 shrink-0">كلمة المرور</label>
                    <span className="text-[10px] text-slate-500 font-normal">أول دخول؟ اكتب كلمة مرور من 6 خانات لتفعيل الحساب</span>
                  </div>
                  <input
                    type="password"
                    value={empPassword}
                    onChange={(e) => setEmpPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 text-sm border rounded-lg placeholder-slate-300 text-right"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleEmployeeLogin(); }}
                  />
                </div>

                {empError && (
                  <div className="p-3 text-xs text-center text-rose-600 bg-rose-50 rounded-lg border border-rose-100">{empError}</div>
                )}

                <button
                  type="button"
                  onClick={handleEmployeeLogin}
                  disabled={empLoading}
                  className="flex items-center justify-center gap-2 w-full py-3 mt-1 text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-lg shadow-md transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {empLoading ? <Loader size={16} className="animate-spin" /> : <LogIn size={16} />}
                  <span>تسجيل الدخول</span>
                </button>
              </div>
            )}

            {/* REAL WEBAUTHN BIOMETRIC LOGIN */}
            {empLoginMethod === 'biometric' && (
              <div className="flex flex-col gap-4 p-4 border border-sky-100/60 bg-sky-50/20 rounded-xl mt-1 text-right" dir="rtl">

                {/* Biometric type selector */}
                <div className="flex bg-slate-200/60 p-0.5 rounded-md text-[10px] w-fit mx-auto">
                  <button
                    type="button"
                    onClick={() => { setBiometricType('face'); setBiometricStatus(''); setEmpError(''); }}
                    className={`px-3 py-1 rounded font-bold transition-colors ${biometricType === 'face' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}
                  >
                    بصمة الوجه
                  </button>
                  <button
                    type="button"
                    onClick={() => { setBiometricType('fingerprint'); setBiometricStatus(''); setEmpError(''); }}
                    className={`px-3 py-1 rounded font-bold transition-colors ${biometricType === 'fingerprint' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}
                  >
                    بصمة الإصبع
                  </button>
                </div>

                {/* WebAuthn not supported warning */}
                {!webAuthnSupported && (
                  <div className="p-3 text-xs text-center text-amber-700 bg-amber-50 rounded-lg border border-amber-100 flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>جهازك أو متصفحك لا يدعم التحقق البيومتري. استخدم كلمة المرور بدلاً من ذلك.</span>
                  </div>
                )}

                {empError && (
                  <div className="p-2 text-xs text-center text-rose-600 bg-rose-50 rounded-lg border border-rose-100">{empError}</div>
                )}

                {biometricStatus && !empError && (
                  <div className="p-2 text-xs text-center text-sky-700 bg-sky-50 rounded-lg border border-sky-100 font-bold">
                    {biometricStatus}
                  </div>
                )}

                {/* Icon */}
                <div className="flex flex-col items-center gap-3 text-center py-2">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all ${biometricScanning ? 'border-sky-400 bg-sky-50 animate-pulse' : 'border-sky-100 bg-sky-50'}`}>
                    {biometricType === 'face'
                      ? <ScanFace size={30} className={biometricScanning ? 'text-sky-500' : 'text-sky-400'} />
                      : <Fingerprint size={30} className={biometricScanning ? 'text-sky-500' : 'text-sky-400'} />
                    }
                  </div>

                  <div className="text-xs">
                    <p className="font-extrabold text-slate-700">
                      {biometricType === 'face' ? 'التحقق ببصمة الوجه (Face ID)' : 'التحقق ببصمة الإصبع (Touch ID)'}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      يستخدم مستشعر الجهاز الحقيقي — لا يمكن تجاوزه بدون بصمة مسجلة مسبقاً
                    </p>
                  </div>

                  {/* Security badge */}
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1 font-bold">
                    <ShieldCheck size={11} />
                    <span>WebAuthn — معيار W3C للأمان البيومتري</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleBiometricLogin}
                  disabled={biometricScanning || !webAuthnSupported}
                  className="flex items-center justify-center gap-2 w-full py-3 text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {biometricScanning ? (
                    <><Loader size={15} className="animate-spin" /><span>جاري التحقق...</span></>
                  ) : (
                    <>{biometricType === 'face' ? <ScanFace size={15} /> : <Fingerprint size={15} />}<span>تسجيل الدخول ببصمة {biometricType === 'face' ? 'الوجه' : 'الإصبع'}</span></>
                  )}
                </button>

                <p className="text-[9px] text-slate-400 text-center leading-relaxed">
                  ⚠️ يجب تسجيل البصمة أولاً من إعدادات الحساب داخل النظام. تواصل مع المدير إذا لم يتم التفعيل بعد.
                </p>
              </div>
            )}

          </div>
        )}

        {/* ── Admin Login Panel ── */}
        {activeTab === 'admin' && (
          <div className="flex flex-col gap-4 text-right" dir="rtl">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-600">اسم مستخدم المدير</label>
              <input
                type="text"
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                placeholder="اسم حساب المدير (مثل: admin)"
                className="w-full px-4 py-2.5 text-sm border rounded-lg placeholder-slate-300 text-right"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdminLogin(); }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-600">رمز المرور للمدير</label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 text-sm border rounded-lg placeholder-slate-300 text-right"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdminLogin(); }}
              />
            </div>

            {adminError && (
              <div className="p-3 text-xs text-center text-rose-600 bg-rose-50 rounded-lg border border-rose-100">{adminError}</div>
            )}

            <button
              onClick={handleAdminLogin}
              disabled={adminLoading}
              className="flex items-center justify-center gap-2 w-full py-3 mt-2 text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-lg shadow-md transition-all disabled:opacity-70"
            >
              {adminLoading ? <Loader size={16} className="animate-spin" /> : <LogIn size={16} />}
              <span>دخول آمن لمدير النظام</span>
            </button>
          </div>
        )}

        {/* ── Register Account Panel (Employees Only) ── */}
        {activeTab === 'reg' && (
          <div className="flex flex-col gap-3.5 max-h-[480px] overflow-y-auto pr-1">

            <div className="flex flex-col gap-1"><label className="text-xs font-bold text-slate-600">رمز الشركة لطلب حساب جديد فقط</label><input inputMode="numeric" value={regCompanyCode} onChange={e=>setRegCompanyCode(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg" /><p className="text-[10px] text-slate-500">احصل عليه من الإدارة؛ الدخول لحساب قائم لا يحتاج رمز الشركة.</p></div>
            {/* Info banner: employees only */}
            <div className="p-3 bg-sky-50 border border-sky-100 rounded-xl text-[11px] text-sky-700 font-bold flex items-start gap-2" dir="rtl">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>التسجيل متاح للموظفين فقط. إضافة المديرين يتم حصرياً من داخل لوحة الإدارة.</span>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-600">الاسم الكامل</label>
              <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)}
                placeholder="أدخل الاسم الكامل"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none placeholder-slate-300" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-600">اسم المستخدم</label>
              <input type="text" value={regUsername} onChange={(e) => setRegUsername(e.target.value)}
                placeholder="مثال: amjad_ahmad"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none placeholder-slate-300" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-600">رقم الجوال</label>
              <input type="tel" value={regPhone} onChange={(e) => setRegPhone(e.target.value)}
                placeholder="مثال: 966501234567"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none placeholder-slate-300" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-600">كلمة المرور</label>
              <input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)}
                placeholder="6 أحرف على الأقل"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none placeholder-slate-300" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-600">تأكيد كلمة المرور</label>
              <input type="password" value={regConfirmPassword} onChange={(e) => setRegConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none placeholder-slate-300" />
            </div>

            {regError && (
              <div className="p-3 text-xs text-center text-rose-600 bg-rose-50 rounded-lg border border-rose-100">{regError}</div>
            )}

            {regSuccess && (
              <div className="p-3 text-xs text-center text-emerald-600 bg-emerald-50 rounded-lg border border-emerald-100">
                🎉 تم إرسال طلب تسجيلك بنجاح! يرجى انتظار موافقة المدير لتفعيل الحساب.
              </div>
            )}

            <button
              onClick={handleRegister}
              disabled={regLoading}
              className="flex items-center justify-center gap-2 w-full py-2.5 mt-1 text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-md transition-all disabled:opacity-75"
            >
              {regLoading ? <Loader size={16} className="animate-spin" /> : <UserPlus size={16} />}
              <span>إرسال طلب تسجيل</span>
            </button>
          </div>
        )}

        <CompanyRegistration />
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="block mt-4 text-center text-xs underline text-sky-700">سياسة الخصوصية واستخدام الموقع</a>

        <div className="mt-8 text-[11px] text-center text-slate-400 border-t border-slate-100/10 pt-4 font-sans tracking-wide">
          التصميم والتطوير عن طريق <strong className="text-slate-300 font-extrabold hover:text-sky-400 transition-colors">SHADY NASSEF</strong> &nbsp;•&nbsp; جميع الحقوق محفوظة © 2026
        </div>
      </div>
    </div>
  );
}
