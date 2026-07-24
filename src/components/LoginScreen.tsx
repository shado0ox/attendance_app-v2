import { useState, useEffect } from 'react';
import { User, Shield, UserPlus, LogIn, Loader, Fingerprint, ScanFace, ChevronDown, AlertCircle, ShieldCheck } from 'lucide-react';

interface LoginScreenProps {
  appSettings: any;
  onAdminLogin: (admin: any) => void;
  onEmployeeLogin: (employee: any) => void;
  employees: any[];
  companyId: string;
  setCompanyId: (id: string) => void;
  companiesList: any[];
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
  employees,
  companyId,
  setCompanyId,
  companiesList
}: LoginScreenProps) {
  const [activeTab, setActiveTab] = useState<'emp' | 'admin' | 'reg'>('emp');

  // Admin login state
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminCompanyCode, setAdminCompanyCode] = useState('');
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
          companyId,
          companyCode: adminCompanyCode.trim(),
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
        body: JSON.stringify({ username: empUsername.trim(), password: empPassword.trim(), companyId }),
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

    const matchedEmp = employees.find(
      (e: any) =>
        (e.username || '').toLowerCase() === empUsername.trim().toLowerCase() ||
        (e.phone || '').trim() === empUsername.trim()
    );

    if (!matchedEmp) {
      setEmpError('اسم الموظف غير مسجل في النظام');
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
        body: JSON.stringify({ empId: matchedEmp.id, companyId }),
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

      const { challenge, credentialIds } = await challengeRes.json();

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
          empId: matchedEmp.id,
          companyId,
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

    const exists = employees.some(
      (e: any) => (e.username || '').toLowerCase() === regUsername.trim().toLowerCase()
    );
    if (exists) { setRegError('اسم المستخدم مستخدم مسبقاً'); return; }

    setRegLoading(true);
    try {
      const payload = {
        name: regName.trim(),
        type: 'employee', // التسجيل العام للموظفين فقط — المديرون يُضافون من لوحة الإدارة
        username: regUsername.trim().toLowerCase(),
        phone: regPhone.trim(),
        password: regPassword,
        status: 'pending',
        companyId: companyId || 'default',
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

  const selectedCompanyObj = companiesList.find(c => c.id === companyId);
  const companyName = selectedCompanyObj ? selectedCompanyObj.name : (appSettings?.companyName || 'نظام الدوام');
  const logoUrl = selectedCompanyObj ? (selectedCompanyObj.logoUrl || '') : (appSettings?.logoDataUrl || '');

  return (
    <div id="login-screen" className="flex flex-col items-center justify-center min-h-screen px-4 bg-sky-50 bg-opacity-70">
      <div className="w-full max-w-md p-8 bg-white border border-sky-100 rounded-2xl shadow-xl transition-all">

        {/* Workspace selector */}
        {companiesList.length > 0 && (
          <div className="mb-6 p-3.5 bg-slate-50 border border-slate-100 rounded-xl" dir="rtl">
            <label className="block text-[11px] font-extrabold text-slate-500 mb-1.5 text-right flex items-center gap-1.5">
              <span>🏢 مساحة عمل الشركة / الفرع</span>
            </label>
            <div className="relative">
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs font-bold bg-white border border-sky-100 rounded-lg text-slate-700 outline-none appearance-none cursor-pointer focus:border-sky-500 shadow-sm"
              >
                <option value="default">المساحة الرئيسية (الافتراضية)</option>
                {companiesList.map((comp: any) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name} {comp.subscriptionStatus !== 'active' ? '⚠️ (الاشتراك منتهي)' : '✓'}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-slate-400">
                <ChevronDown size={14} />
              </div>
            </div>
            {selectedCompanyObj && (
              <div className="mt-2 text-[10px] text-slate-400 text-right flex flex-col gap-0.5 border-t pt-1.5 border-dashed border-slate-200">
                <span>الاشتراك الشهري: <span className="font-bold text-slate-600">{selectedCompanyObj.monthlyFee || '100'} ريال / شهر</span></span>
                {selectedCompanyObj.subscriptionExpiresAt && (
                  <span>تاريخ انتهاء الصلاحية: <span className="font-bold text-slate-600">{new Date(selectedCompanyObj.subscriptionExpiresAt).toLocaleDateString('ar-EG')}</span></span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Logo and Brand */}
        <div className="flex flex-col items-center mb-8 text-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo"
              className="w-16 h-16 p-1 mb-3 rounded-xl border border-sky-100 object-contain bg-sky-50 shadow-sm"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex items-center justify-center w-14 h-14 mb-3 text-xl font-extrabold text-white bg-sky-600 rounded-xl shadow-md">
              {companyName.charAt(0)}
            </div>
          )}
          <h2 className="text-xl font-extrabold text-slate-800">{companyName}</h2>
          <p className="text-xs text-slate-400 mt-1">نظام إدارة الجداول الزمنية والحضور والانصراف</p>
        </div>

        {/* Tab Selection */}
        <div className="flex p-1 mb-6 bg-slate-100 rounded-xl">
          <button
            onClick={() => { setActiveTab('emp'); setEmpError(''); }}
            className={`flex items-center justify-center gap-2 flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'emp' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <User size={14} />
            <span>بوابة الموظف</span>
          </button>

          <button
            onClick={() => { setActiveTab('admin'); setAdminError(''); }}
            className={`flex items-center justify-center gap-2 flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'admin' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Shield size={14} />
            <span>بوابة المدير</span>
          </button>

          <button
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
              <label className="text-xs font-bold text-slate-600 pr-1">اسم المستخدم للموظف</label>
              <input
                type="text"
                value={empUsername}
                onChange={(e) => setEmpUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم بالكامل"
                className="w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none placeholder-slate-300 text-right font-medium"
              />
            </div>

            {/* Toggle Login Method */}
            <div className="flex gap-2 p-1 bg-slate-50 border border-slate-200/65 rounded-lg mt-1 text-xs" dir="rtl">
              <button
                type="button"
                onClick={() => { setEmpLoginMethod('password'); setBiometricScanning(false); setBiometricStatus(''); setEmpError(''); }}
                className={`flex-1 py-1.5 rounded font-bold transition-all text-center ${empLoginMethod === 'password' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                رمز الدخول السري
              </button>
              <button
                type="button"
                onClick={() => { setEmpLoginMethod('biometric'); setEmpError(''); setBiometricStatus(''); }}
                className={`flex-1 py-1.5 rounded font-bold transition-all text-center flex items-center justify-center gap-1.5 ${empLoginMethod === 'biometric' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <ScanFace size={13} />
                <span>التحقق البيومتري</span>
              </button>
            </div>

            {/* PASSWORD LOGIN */}
            {empLoginMethod === 'password' && (
              <div className="flex flex-col gap-4 text-right" dir="rtl">
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center pr-1">
                    <span className="text-[10px] text-slate-400 font-normal">أول دخول؟ اكتب كلمة مرور من 6 خانات لتفعيل الحساب</span>
                    <label className="text-xs font-bold text-slate-600">كلمة المرور</label>
                  </div>
                  <input
                    type="password"
                    value={empPassword}
                    onChange={(e) => setEmpPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none placeholder-slate-300 text-right"
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
                  <span>دخول آمن بالرقم السري</span>
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
                className="w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none placeholder-slate-300 text-right"
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
                className="w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none placeholder-slate-300 text-right"
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

        <div className="mt-8 text-[11px] text-center text-slate-400 border-t border-slate-100/10 pt-4 font-sans tracking-wide">
          التصميم والتطوير عن طريق <strong className="text-slate-300 font-extrabold hover:text-sky-400 transition-colors">SHADY NASSEF</strong> &nbsp;•&nbsp; جميع الحقوق محفوظة © 2026
        </div>
      </div>
    </div>
  );
}
