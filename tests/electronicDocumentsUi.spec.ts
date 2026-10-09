import {test,expect} from '@playwright/test';

test('employee confirms a locked form, shares directly; administration tracks, prints and deletes',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const confirmations:string[]=[];page.on('dialog',async dialog=>{if(dialog.type()==='confirm')confirmations.push(dialog.message());await dialog.accept();});
 await page.addInitScript(()=>Object.defineProperty(navigator,'share',{value:async(data:any)=>{(window as any).sharedDocument=data;}}));
 const docs:any[]=[{id:2,status:'pending_manager',employeeName:'الموظف',date:'2026-10-09',requestType:'temporary_exit'},{id:3,status:'approved',employeeName:'الموظف',date:'2026-10-09'}];
 await page.route('**/api/electronic-documents**',async route=>{
  const request=route.request(),url=request.url();let body:any,status=200;
  if(request.method()==='DELETE'){const id=Number(new URL(url).pathname.split('/').pop());const index=docs.findIndex(doc=>doc.id===id);docs.splice(index,1);body={success:true};}
  else if(url.includes('/audit'))body=[{id:1,action:'employee_signed',actorRole:'employee',actorId:'employee',createdAt:'2026-10-09T08:00:00Z'},{id:2,action:'approved',actorRole:'manager',actorId:'Manager',createdAt:'2026-10-09T09:00:00Z'}];
  else if(url.includes('/share'))body={url:'https://example.com/document-approval/test',expiresAt:'2026-10-12T10:00:00Z'};
  else if(url.includes('/print'))body={finalHtml:'<!doctype html><html lang="ar" dir="rtl"><head><style>body{font-family:Arial;background:white}.page{min-height:900px}h1{color:black}</style></head><body><div class="page"><h1>نموذج استئذان</h1><p>نسخة معتمدة للطباعة</p></div></body></html>'};
  else if(request.method()==='POST'){status=201;docs.push({id:4,status:'pending_manager',employeeName:'الموظف',date:'2026-10-09'});body={id:4,status:'pending_manager',url:'https://example.com/document-approval/new',expiresAt:'2026-10-12T10:00:00Z'};}
  else body=docs;
  await route.fulfill({json:body,status});
 });
 await page.goto('/tests/ui/documents.html');
 await page.getByRole('button',{name:'نموذج استئذان',exact:true}).click();
 await page.getByLabel('وقت الخروج',{exact:true}).fill('10:30');
 await page.getByLabel('وقت العودة المتوقع',{exact:true}).fill('12:00');
 await page.getByLabel('سبب الطلب',{exact:true}).fill('موعد رسمي');
 await page.getByRole('checkbox').check();
 const box=await page.locator('canvas').boundingBox();
 await page.mouse.move(box!.x+30,box!.y+30);await page.mouse.down();await page.mouse.move(box!.x+100,box!.y+50,{steps:8});await page.mouse.up();
 await page.getByRole('button',{name:'اعتماد الطلب',exact:true}).click();
 await expect(page.getByRole('button',{name:'مشاركة عبر تطبيقات الهاتف'})).toBeVisible();
 expect(confirmations[0]).toContain('لن تستطيع تعديل النموذج أو فتحه مرة أخرى');
 await expect(page.getByRole('button',{name:'طباعة',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'مشاركة عبر تطبيقات الهاتف'}).click();
 expect(await page.evaluate(()=>(window as any).sharedDocument.url)).toBe('https://example.com/document-approval/new');
 await expect(page.getByRole('link',{name:'إرسال عبر واتساب'})).toHaveAttribute('href',/wa.me/);
 await page.goto('/tests/ui/documents.html?admin');
 await expect(page.getByRole('button',{name:'موافقة الإدارة'})).toHaveCount(0);
 const row=page.getByRole('row').filter({hasText:'استئذان #3'});
 await row.getByRole('button',{name:'التفاصيل'}).click();
 await expect(page.getByText('اعتماد الموظف',{exact:true})).toBeVisible();
 await expect(page.getByText('اعتماد وتوقيع المدير',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'إغلاق',exact:true}).click();
 await row.getByRole('button',{name:'طباعة',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'معاينة وطباعة المستند'});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('button',{name:'طباعة',exact:true})).toBeEnabled();
 const downloading=page.waitForEvent('download');
 await dialog.getByRole('button',{name:'حفظ PDF',exact:true}).click();
 const download=await downloading;expect(download.suggestedFilename()).toBe('permission-document.pdf');expect(await download.failure()).toBeNull();
 await dialog.getByRole('button',{name:'رجوع / إغلاق'}).click();await expect(dialog).toHaveCount(0);
 await row.getByRole('button',{name:'طباعة',exact:true}).click();await expect(dialog).toBeVisible();await page.goBack();await expect(dialog).toHaveCount(0);
 await row.getByRole('button',{name:'حذف الطلب',exact:true}).click();await expect(row).toHaveCount(0);
 expect(errors).toEqual([]);
});


test('an open administration detail refreshes its status and audit timeline',async({page})=>{
 await page.clock.install();
 let approved=false;
 await page.route('**/api/electronic-documents**',async route=>{
  const doc={id:1,employeeName:'Employee',status:approved?'approved':'pending_manager',managerName:approved?'Manager':null,formData:{date:'2026-10-09'}};
  await route.fulfill({json:route.request().url().includes('/audit')?[{id:1,action:approved?'approved':'employee_signed',actorRole:approved?'manager':'employee',actorId:'test',createdAt:'2026-10-09T08:00:00Z'}]:[doc]});
 });
 await page.goto('/tests/ui/documents.html?admin');
 await page.getByRole('button',{name:'التفاصيل',exact:true}).click();
 await expect(page.getByText('اعتماد الموظف',{exact:true})).toBeVisible();
 approved=true;await page.clock.fastForward(60000);
 await expect(page.getByText('اعتماد وتوقيع المدير',{exact:true})).toBeVisible();
 await expect(page.getByText('Manager',{exact:true})).toBeVisible();
});

test('manager link requires login and uses the authenticated manager name',async({page})=>{
 let submitted:any=null;
 await page.route('**/api/auth/admin-login',async route=>route.fulfill({json:{token:'manager-session',name:'Verified Manager'}}));
 await page.route('**/api/document-approval/**',async route=>{
  if(route.request().headers().authorization!=='Bearer manager-session')return route.fulfill({status:401,json:{error:'سجّل الدخول بحساب المدير'}});
  if(route.request().method()==='POST'){submitted=route.request().postDataJSON();return route.fulfill({json:{success:true,status:'approved'}});}
  return route.fulfill({json:{employeeName:'Employee',companyName:'Company',managerName:'Verified Manager',formData:{date:'2026-10-09',requestType:'temporary_exit',reason:'موعد'},expiresAt:'2026-10-12T10:00:00Z'}});
 });
 await page.goto('/tests/ui/documents.html?manager');
 await expect(page.getByRole('heading',{name:'دخول المدير لاعتماد الاستئذان'})).toBeVisible();
 await expect(page.getByText('موعد',{exact:true})).toHaveCount(0);
 await page.getByLabel('اسم المستخدم أو البريد',{exact:true}).fill('manager');
 await page.getByLabel('كلمة المرور',{exact:true}).fill('test-password');
 await page.getByRole('button',{name:'دخول ومراجعة الطلب'}).click();
 await expect(page.getByLabel('اسم المدير',{exact:true})).toHaveValue('Verified Manager');
 await expect(page.getByLabel('اسم المدير',{exact:true})).toHaveAttribute('readonly','');
 const box=await page.locator('canvas').boundingBox();
 await page.mouse.move(box!.x+30,box!.y+30);await page.mouse.down();await page.mouse.move(box!.x+100,box!.y+50,{steps:8});await page.mouse.up();
 await page.getByRole('button',{name:'اعتماد المستند',exact:true}).click();
 await expect(page.getByRole('heading',{name:'تم اعتماد المستند'})).toBeVisible();
 expect(submitted.managerName).toBeUndefined();expect(submitted.managerSignature).toContain('data:image/png;base64,');
});
