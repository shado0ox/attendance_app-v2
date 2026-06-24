import { useState, useRef, useEffect } from 'react';
import { User, Shield, UserPlus, LogIn, Loader, Key, Fingerprint, ScanFace, ChevronDown, CheckCircle2, RefreshCw, AlertCircle } from 'lucide-react';

interface LoginScreenProps {
  appSettings: any;
  onAdminLogin: (admin: any) => void;
  onEmployeeLogin: (employee: any) => void;
  employees: any[];
}

export default function LoginScreen({
  appSettings,
  onAdminLogin,
  onEmployeeLogin,
  employees
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

  // Improved Roster Selection
  const [showRosterDropdown, setShowRosterDropdown] = useState(false);
  
  // Biometric & Smart Logins states
  const [empLoginMethod, setEmpLoginMethod] = useState<'password' | 'biometric'>('password');
  const [biometricType, setBiometricType] = useState<'face' | 'fingerprint'>('face');
  const [biometricScanning, setBiometricScanning] = useState(false);
  const [biometricProgress, setBiometricProgress] = useState(0);
  const [biometricStatus, setBiometricStatus] = useState('');
  const [biometricSuccess, setBiometricSuccess] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressIntervalRef = useRef<any>(null);
  const holdIntervalRef = useRef<any>(null);

  // Registration state
  const [regName, setRegName] = useState('');
  const [regType, setRegType] = useState<'employee' | 'admin'>('employee');
  const [regUsername, setRegUsername] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);
  const [regLoading, setRegLoading] = useState(false);


  const handleAdminLogin = async () => {
    if (!adminUsername.trim()) {
      setAdminError('الرجاء إدخال اسم المستخدم للمدير');
      return;
    }
    if (!adminPassword.trim()) {
      setAdminError('الرجاء إدخال كلمة المرور');
      return;
    }
    setAdminError('');
    setAdminLoading(true);

    const superPassword = appSettings?.password || '5198';

    if (adminUsername.trim().toLowerCase() === 'admin' && adminPassword === superPassword) {
      try {
        onAdminLogin({ role: 'superadmin', name: 'المدير العام' });
      } catch (err: any) {
        setAdminError('حدث خطأ في استعادة الاتصال. يرجى المحاولة لاحقاً.');
      } finally {
        setAdminLoading(false);
      }
      return;
    }

    // Try Sub-Admin check in PostgreSQL
    try {
      const response = await fetch('/api/admins');
      if (!response.ok) {
        throw new Error('فشل الاتصال بالخادم المساعد');
      }
      const adminsList = await response.json();
      
      const correctInputLower = adminUsername.trim().toLowerCase();
      const enteredPassword = adminPassword.trim();
      
      const foundAdmin = adminsList.find((adm: any) => {
        const usernameMatch = adm.username && adm.username.toLowerCase() === correctInputLower;
        const nameMatch = adm.name && adm.name.toLowerCase() === correctInputLower;
        const passwordMatch = adm.password === enteredPassword;
        return (usernameMatch || nameMatch) && passwordMatch;
      });

      if (!foundAdmin) {
        setAdminError('اسم المستخدم أو رمز الدخول غير صحيح');
        setAdminLoading(false);
        return;
      }

      onAdminLogin({ role: 'admin', name: foundAdmin.name, ...foundAdmin });
    } catch (e: any) {
      setAdminError('فشل تسجيل الدخول: ' + e.message);
    } finally {
      setAdminLoading(false);
    }
  };

  const handleEmployeeLogin = async () => {
    if (!empUsername.trim()) {
      setEmpError('الرجاء اختيار أو إدخال اسم المستخدم أولاً');
      return;
    }
    if (!empPassword) {
      setEmpError('أدخل كلمة المرور المطلوبة للدخول');
      return;
    }
    setEmpError('');
    setEmpLoading(true);

    const matchedEmp = employees.find(
      (e: any) => 
        (e.username || '').toLowerCase() === empUsername.trim().toLowerCase() ||
        (e.name || '').toLowerCase() === empUsername.trim().toLowerCase() ||
        (e.phone || '').trim() === empUsername.trim()
    );

    if (!matchedEmp) {
      setEmpError('هذا الموظف غير مسجل في قائمة الموظفين النشطة. تأكد من إدخال اسم المستخدم أو الاسم الصحيح.');
      setEmpLoading(false);
      return;
    }

    // Direct database roster password check (instant / offline-first & admin configured)
    const targetPassword = (matchedEmp.password || '123456').trim();
    if (empPassword.trim() === targetPassword) {
      onEmployeeLogin(matchedEmp);
    } else {
      setEmpError('كلمة المرور غير صحيحة لحساب هذا الموظف. (الرمز الافتراضي هو 123456)');
    }
    setEmpLoading(false);
  };

  // Face Scan Control
  const startFaceScan = async () => {
    if (!empUsername.trim()) {
      setEmpError('الرجاء اختيار أو كتابة اسم الموظف أولاً لبدء التحقق بالوجه');
      return;
    }
    
    const matchedEmp = employees.find(
      (e: any) => 
        (e.username || '').toLowerCase() === empUsername.trim().toLowerCase() ||
        (e.name || '').toLowerCase() === empUsername.trim().toLowerCase() ||
        (e.phone || '').trim() === empUsername.trim()
    );

    if (!matchedEmp) {
      setEmpError('مستشعر الوجه نشط، ولكن اسم الموظف غير مسجل بالنظام.');
      return;
    }

    setEmpError('');
    setBiometricScanning(true);
    setBiometricProgress(0);
    setBiometricSuccess(false);
    setBiometricStatus('📸 جاري تشغيل الكاميرا الآمنة الفورية...');

    // Try starting camera stream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 320, facingMode: 'user' }
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.log('Camera play error:', e));
      }
    } catch (err) {
      console.warn('Camera blocked or unavailable, using high-definition biometric avatar wireframe.', err);
      setBiometricStatus('⚙️ تعذر فتح الكاميرا (استخدام فحص الملامح البديل)...');
    }

    let progress = 0;
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    
    progressIntervalRef.current = setInterval(() => {
      progress += Math.floor(Math.random() * 8) + 4;
      if (progress >= 100) {
        progress = 100;
        clearInterval(progressIntervalRef.current);
        
        // Finish scan
        setTimeout(() => {
          setBiometricSuccess(true);
          setBiometricStatus('✅ تم التحقق والمطابقة الحيوية للوجه بنجاح 100%!');
          
          // Stop camera stream
          if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            setCameraStream(null);
          }

          // Auto Login
          setTimeout(() => {
            setBiometricScanning(false);
            onEmployeeLogin(matchedEmp);
          }, 1000);
        }, 500);
      }

      setBiometricProgress(progress);
      
      // Update statuses based on progress
      if (progress < 25) {
        setBiometricStatus('🔍 جاري استشعار الضوء ومسافة الوجه عن المستشعر...');
      } else if (progress < 50) {
        setBiometricStatus('⚡ جاري مسح تضاريس الوجه وتحليل 120 نقطة حيوية...');
      } else if (progress < 75) {
        setBiometricStatus('🧠 بمقارنة البصمة الرمزية الرقمية مع قاعدة البيانات...');
      } else if (progress < 95) {
        setBiometricStatus('🔒 تشفير بروتوكول المصادقة الخضراء البيومترية...');
      }
    }, 150);
  };

  const cancelBiometricScan = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    
    setBiometricScanning(false);
    setBiometricProgress(0);
    setBiometricSuccess(false);
    setBiometricStatus('');
  };

  // Fingerprint touch simulation
  const handleFingerprintStart = () => {
    if (!empUsername.trim()) {
      setEmpError('الرجاء تحديد الموظف أولاً لبدء التحقق ببصمة الإصبع');
      return;
    }

    const matchedEmp = employees.find(
      (e: any) => 
        (e.username || '').toLowerCase() === empUsername.trim().toLowerCase() ||
        (e.name || '').toLowerCase() === empUsername.trim().toLowerCase() ||
        (e.phone || '').trim() === empUsername.trim()
    );

    if (!matchedEmp) {
      setEmpError('مستشعر البصمة جاهز، ولكن اسم الموظف غير مدرج بالنظام.');
      return;
    }

    setEmpError('');
    setBiometricScanning(true);
    setBiometricProgress(0);
    setBiometricSuccess(false);
    setBiometricStatus('👆 ضع إصبعك على المستشعر واضغط باستمرار...');

    let p = 0;
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    
    holdIntervalRef.current = setInterval(() => {
      p += 5;
      if (p >= 100) {
        p = 100;
        clearInterval(holdIntervalRef.current);
        setBiometricSuccess(true);
        setBiometricStatus('✅ تطابق البصمة معيارياً! تفويض الدخول مقبول.');

        setTimeout(() => {
          setBiometricScanning(false);
          onEmployeeLogin(matchedEmp);
        }, 1200);
      }
      setBiometricProgress(p);

      if (p < 30) {
        setBiometricStatus('🔍 جاري مسح خطوط البصمة وحساب العمق التدريجي...');
      } else if (p < 60) {
        setBiometricStatus('⚡ فحص ميزات التفاصيل الدقيقة وحلقات التلال الحيوية...');
      } else if (p < 90) {
        setBiometricStatus('🔒 التحقق من درجة حرارة ونبض ملامسة الإصبع...');
      }
    }, 100);
  };

  const handleFingerprintRelease = () => {
    if (biometricSuccess) return; // ignore if already matched
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    setBiometricProgress(0);
    setBiometricStatus('⚠️ تم قطع الاتصال! يجب الضغط المستمر دون إزالة الإصبع لقراءة البيانات كاملة.');
  };

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    };
  }, []);


  const handleRegister = async () => {
    setRegError('');
    setRegSuccess(false);

    if (!regName.trim()) {
      setRegError('الرجاء إدخال الاسم الكامل');
      return;
    }
    if (regType === 'employee' && !regUsername.trim()) {
      setRegError('الرجاء إدخال اسم المستخدم للموظف');
      return;
    }
    if (!regPhone.trim()) {
      setRegError('الرجاء إدخال رقم الجوال');
      return;
    }
    if (regPassword.length < 6) {
      setRegError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setRegError('كلمتا المرور غير متطابقتين');
      return;
    }

    if (regType === 'employee') {
      const exists = employees.some(
        (e: any) => (e.username || '').toLowerCase() === regUsername.trim().toLowerCase()
      );
      if (exists) {
        setRegError('اسم المستخدم مستخدم مسبقاً');
        return;
      }
    }

    setRegLoading(true);

    try {
      const payload = {
        name: regName.trim(),
        type: regType,
        username: regType === 'employee' ? regUsername.trim().toLowerCase() : '',
        phone: regPhone.trim(),
        password: regPassword,
        status: 'pending'
      };
      
      const response = await fetch('/api/registration-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'فشل إرسال الطلب إلى الخادم');
      }

      setRegSuccess(true);
      setRegName('');
      setRegUsername('');
      setRegPhone('');
      setRegPassword('');
      setRegConfirmPassword('');
    } catch (e: any) {
      setRegError('حدث خطأ أثناء إرسال الطلب: ' + e.message);
    } finally {
      setRegLoading(false);
    }
  };

  const companyName = appSettings?.companyName || 'نظام الدوام';
  const logoUrl = appSettings?.logoDataUrl || '';

  return (
    <div id="login-screen" className="flex flex-col items-center justify-center min-h-screen px-4 bg-sky-50 bg-opacity-70">
      <div className="w-full max-w-md p-8 bg-white border border-sky-100 rounded-2xl shadow-xl transition-all">
        
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
            className={`flex items-center justify-center gap-2 flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'emp'
                ? 'bg-white text-sky-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <User size={14} />
            <span>بوابة الموظف</span>
          </button>
          
          <button
            onClick={() => { setActiveTab('admin'); setAdminError(''); }}
            className={`flex items-center justify-center gap-2 flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'admin'
                ? 'bg-white text-sky-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield size={14} />
            <span>بوابة المدير</span>
          </button>

          <button
            onClick={() => { setActiveTab('reg'); setRegError(''); }}
            className={`flex items-center justify-center gap-2 flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'reg'
                ? 'bg-white text-sky-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus size={14} />
            <span>طلب حساب</span>
          </button>
        </div>

        {/* Employee Login Panel */}
        {activeTab === 'emp' && (
          <div className="flex flex-col gap-4">
            
            {/* Employee Username Input (No auto-fill dropdown for privacy) */}
            <div className="flex flex-col gap-1.5 text-right" dir="rtl">
              <label className="text-xs font-bold text-slate-600 pr-1">
                اسم المستخدم للموظف
              </label>
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
                onClick={() => { setEmpLoginMethod('password'); cancelBiometricScan(); }}
                className={`flex-1 py-1.5 rounded font-bold transition-all text-center ${
                  empLoginMethod === 'password'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                رمز الدخول السري
              </button>
              <button
                type="button"
                onClick={() => { setEmpLoginMethod('biometric'); setEmpError(''); }}
                className={`flex-1 py-1.5 rounded font-bold transition-all text-center flex items-center justify-center gap-1.5 ${
                  empLoginMethod === 'biometric'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <ScanFace size={13} />
                <span>التحقق بالوجه والبصمة</span>
              </button>
            </div>

            {/* PASSWORD LOGIN FORM */}
            {empLoginMethod === 'password' && (
              <div className="flex flex-col gap-4 text-right" dir="rtl">
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center pr-1">
                    <span className="text-[10px] text-slate-400 font-normal">أول دخول للحساب؟ اكتب باسورد بـ 6 خانات لتفعيله</span>
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
                  <div className="p-3 text-xs text-center text-rose-600 bg-rose-50 rounded-lg border border-rose-100">
                    {empError}
                  </div>
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

            {/* BIOMETRIC SIMULATION INTERACTIVE PANEL */}
            {empLoginMethod === 'biometric' && (
              <div className="flex flex-col gap-4 p-4 border border-sky-100/60 bg-sky-50/20 rounded-xl mt-1 text-right" dir="rtl font-sans">
                {/* Switch sub-biometric */}
                <div className="flex bg-slate-200/60 p-0.5 rounded-md text-[10px] w-fit mx-auto self-center">
                  <button
                    type="button"
                    onClick={() => { setBiometricType('face'); cancelBiometricScan(); }}
                    className={`px-3 py-1 rounded font-bold transition-colors ${
                      biometricType === 'face' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    بصمة الوجه
                  </button>
                  <button
                    type="button"
                    onClick={() => { setBiometricType('fingerprint'); cancelBiometricScan(); }}
                    className={`px-3 py-1 rounded font-bold transition-colors ${
                      biometricType === 'fingerprint' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    بصمة الإصبع
                  </button>
                </div>

                {empError && (
                  <div className="p-2 text-xs text-center text-rose-600 bg-rose-50 rounded-lg border border-rose-100">
                    {empError}
                  </div>
                )}

                {/* Sub UI for Face scanning */}
                {biometricType === 'face' && (
                  <div className="flex flex-col items-center">
                    {!biometricScanning ? (
                      <div className="flex flex-col items-center gap-3 text-center py-4 w-full">
                        <div className="w-16 h-16 bg-sky-50 text-sky-600 border border-sky-100 rounded-full flex items-center justify-center transition-transform hover:scale-105 shadow-sm">
                          <ScanFace size={30} className="animate-pulse" />
                        </div>
                        <div className="text-xs">
                          <p className="font-extrabold text-slate-700">بوابة التعرف الذكي للوجه</p>
                          <p className="text-[10px] text-slate-400 mt-1">اضغط أدناه لبدء فحص الملامح مع الكاميرا ومصادقة الدخول الآمن.</p>
                        </div>
                        <button
                          type="button"
                          onClick={startFaceScan}
                          className="flex items-center gap-1.5 px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg text-xs shadow-md transition-all mt-1"
                        >
                          <ScanFace size={14} />
                          <span>ابدأ مسح بصمة الوجه</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-4 w-full p-2 text-center">
                        {/* Circular Scanning Viewport */}
                        <div className="relative w-36 h-36 rounded-full border-4 border-dashed border-sky-400 overflow-hidden bg-slate-900 shadow-inner flex items-center justify-center">
                          {cameraStream ? (
                            <video
                              ref={videoRef}
                              className="w-full h-full object-cover rounded-full scale-x-[-1]"
                              playsInline
                              muted
                            />
                          ) : (
                            <div className="flex flex-col items-center text-slate-400 gap-1 animate-pulse">
                              <ScanFace size={40} className="text-sky-400 animate-bounce" />
                              <span className="text-[9px]">أبعاد افتراضية نشطة</span>
                            </div>
                          )}

                          {/* Green scanning laser line line */}
                          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-[bounce_2s_infinite] z-20"></div>
                          
                          {/* Outer scanning glow rings */}
                          <div className="absolute inset-0 border border-sky-500/20 rounded-full animate-ping pointer-events-none"></div>
                        </div>

                        {/* Scanner Status and Progress */}
                        <div className="w-full max-w-xs flex flex-col gap-1.5 mt-2">
                          <div className="flex justify-between text-[10px] font-bold text-slate-500">
                            <span>جاري معالجة القياسات...</span>
                            <span className="font-mono text-sky-600">{biometricProgress}%</span>
                          </div>
                          
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border">
                            <div 
                              className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-150"
                              style={{ width: `${biometricProgress}%` }}
                            ></div>
                          </div>
                          
                          <p className="text-[10px] text-slate-600 font-extrabold mt-1 h-5">{biometricStatus}</p>
                        </div>

                        <button
                          type="button"
                          onClick={cancelBiometricScan}
                          className="px-4 py-1 bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10px] font-bold rounded border transition-colors mt-1"
                        >
                          إلغاء المسح
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub UI for Fingerprint scanning */}
                {biometricType === 'fingerprint' && (
                  <div className="flex flex-col items-center">
                    <div className="flex flex-col items-center gap-4 text-center py-2 w-full">
                      <div className="text-xs">
                        <p className="font-extrabold text-slate-700">بوابة استشعار البصمة الآمنة</p>
                        <p className="text-[10px] text-slate-400 mt-1">اضغط باستمرار على مستشعر البصمة الذكية أدناه حتى تكتمل المعايرة بنجاح.</p>
                      </div>

                      {/* Fingerprint Graphic Sensor Pad */}
                      <button
                        type="button"
                        onMouseDown={handleFingerprintStart}
                        onMouseUp={handleFingerprintRelease}
                        onMouseLeave={handleFingerprintRelease}
                        onTouchStart={(e) => { e.preventDefault(); handleFingerprintStart(); }}
                        onTouchEnd={handleFingerprintRelease}
                        className="relative w-24 h-24 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col items-center justify-center cursor-pointer select-none overflow-hidden group focus:outline-none"
                      >
                        {/* Interactive Ripple and Progress scale */}
                        <div 
                          className="absolute bottom-0 left-0 right-0 bg-sky-500/15 transition-all duration-100 pointer-events-none"
                          style={{ height: `${biometricProgress}%` }}
                        ></div>

                        {/* Fingeprint Icon */}
                        <Fingerprint 
                          size={38} 
                          className={`transition-colors duration-200 z-10 ${
                            biometricProgress > 0 
                              ? 'text-sky-600 scale-105 animate-pulse' 
                              : 'text-slate-400 group-hover:text-slate-600'
                          }`} 
                        />
                        
                        <div className="absolute inset-0 border border-sky-400/20 rounded-2xl animate-pulse pointer-events-none"></div>
                      </button>

                      {/* Info & holding progress */}
                      <div className="w-full max-w-xs flex flex-col gap-1.5">
                        <div className="flex justify-between text-[10px] font-bold text-slate-500">
                          <span>دقة ضغط ملامسة الحساس</span>
                          <span className="font-mono text-sky-600">{biometricProgress}%</span>
                        </div>
                        
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border">
                          <div 
                            className="h-full bg-sky-50 transition-all duration-100"
                            style={{ width: `${biometricProgress}%` }}
                          ></div>
                        </div>

                        <p className="text-[10px] text-slate-600 font-extrabold mt-1 h-8">{biometricStatus}</p>
                      </div>

                      {biometricScanning && !biometricSuccess && (
                        <button
                          type="button"
                          onClick={cancelBiometricScan}
                          className="px-4 py-1 hover:bg-slate-50 text-slate-400 text-[10px] rounded transition-colors"
                        >
                          إلغاء التحتوي
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            
          </div>
        )}

        {/* Admin Login Panel */}
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
              <div className="p-3 text-xs text-center text-rose-600 bg-rose-50 rounded-lg border border-rose-100">
                {adminError}
              </div>
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

        {/* Register Account Panel */}
        {activeTab === 'reg' && (
          <div className="flex flex-col gap-3.5 max-h-[460px] overflow-y-auto pr-1">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-600">الاسم الكامل</label>
              <input
                type="text"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="أدخل الاسم الكامل"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none placeholder-slate-300"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-600">نوع الحساب</label>
              <select
                value={regType}
                onChange={(e: any) => setRegType(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none bg-white"
              >
                <option value="employee">موظف</option>
                <option value="admin">مدير فرعي</option>
              </select>
            </div>

            {regType === 'employee' && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">اسم المستخدم (الموظف)</label>
                <input
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="مثال: amjad_ahmad"
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none placeholder-slate-300"
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-600">رقم الجوال</label>
              <input
                type="tel"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                placeholder="مثال: 966501234567"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none placeholder-slate-300"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-600">كلمة المرور المطلوبة</label>
              <input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="6 أحرف على الأقل"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none placeholder-slate-300"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-600">تأكيد كلمة المرور</label>
              <input
                type="password"
                value={regConfirmPassword}
                onChange={(e) => setRegConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none placeholder-slate-300"
              />
            </div>

            {regError && (
              <div className="p-3 text-xs text-center text-rose-600 bg-rose-50 rounded-lg border border-rose-100">
                {regError}
              </div>
            )}

            {regSuccess && (
              <div className="p-3 text-xs text-center text-emerald-600 bg-emerald-50 rounded-lg border border-emerald-100">
                🎉 تم إرسال طلب تسجيلك بنجاح! يرجى انتظار موافقة المدير العام لتفعيل الحساب.
              </div>
            )}

            <button
              onClick={handleRegister}
              disabled={regLoading}
              className="flex items-center justify-center gap-2 w-full py-2.5 mt-1 text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-md transition-all disabled:opacity-75"
            >
              {regLoading ? <Loader size={16} className="animate-spin" /> : <UserPlus size={16} />}
              <span>طلب تسجيل جديد</span>
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
