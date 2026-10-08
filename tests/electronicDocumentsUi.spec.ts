import {test,expect} from '@playwright/test';

test('mobile employee sharing, PDF, print controls, close/back and admin review',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const docs=[
    {id:1,status:'employee_signed',employeeName:'الموظف',formData:{date:'2026-10-09',requestType:'temporary_exit',reason:'موعد'}},
    {id:2,status:'manager_ready',employeeName:'الموظف',formData:{date:'2026-10-09'}},
    {id:3,status:'approved',employeeName:'الموظف',formData:{date:'2026-10-09'}},
  ];
  let shares=0;
  await page.route('**/api/electronic-documents**',async route=>{
    const url=route.request().url();let body:any;
    if(url.includes('/share')){shares++;body={url:'https://example.com/document-approval/test',expiresAt:'2026-10-12T10:00:00Z'};}
    else if(url.includes('/print'))body={finalHtml:'<!doctype html><html lang="ar" dir="rtl"><head><style>body{font-family:Arial;background:white}.page{min-height:900px}h1{color:black}</style></head><body><div class="page"><h1>نموذج استئذان</h1><p>نسخة معتمدة للطباعة</p></div></body></html>'};
    else if(url.includes('/review')){docs[0].status='manager_ready';body={success:true,status:'manager_ready'};}
    else body=docs;
    await route.fulfill({json:body});
  });
  await page.goto('/tests/ui/documents.html');
  await page.getByRole('button',{name:'رابط المدير / مشاركة'}).click();
  expect(shares).toBe(1);
  await expect(page.getByRole('link',{name:'إرسال عبر واتساب'})).toHaveAttribute('href',/wa.me/);
  await page.getByRole('button',{name:'طباعة',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'معاينة وطباعة المستند'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'طباعة',exact:true})).toBeEnabled();
  const downloading=page.waitForEvent('download');
  await dialog.getByRole('button',{name:'حفظ PDF',exact:true}).click();
  const download=await downloading;
  expect(download.suggestedFilename()).toBe('permission-document.pdf');
  expect(await download.failure()).toBeNull();
  await dialog.getByRole('button',{name:'رجوع / إغلاق'}).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:'طباعة',exact:true}).click();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await page.goto('/tests/ui/documents.html?admin');
  await page.getByRole('button',{name:'موافقة الإدارة',exact:true}).click();
  await expect(page.getByRole('button',{name:'موافقة الإدارة',exact:true})).toHaveCount(0);
  expect(errors).toEqual([]);
});
