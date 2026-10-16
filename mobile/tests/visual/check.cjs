// Run from repository root after npm ci and npm ci --prefix mobile.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const output = path.resolve(process.env.WAFR_VISUAL_OUTPUT || '/tmp/wafr-native-layout');
fs.mkdirSync(output,{recursive:true});
const server = spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--config',path.join(__dirname,'vite.config.ts')],{cwd:root,stdio:['ignore','pipe','pipe']});
let logs=''; server.stdout.on('data',chunk=>logs+=chunk); server.stderr.on('data',chunk=>logs+=chunk);
(async()=>{
  let browser;
  try {
    for(let i=0;i<100&&!logs.includes('Local:');i++) { if(server.exitCode!==null) throw new Error(logs); await new Promise(resolve=>setTimeout(resolve,100)); }
    if(!logs.includes('Local:')) throw new Error('Layout server failed to start: '+logs);
    browser = await chromium.launch({headless:true,timeout:20000,...(process.env.WAFR_BROWSER_EXECUTABLE?{executablePath:process.env.WAFR_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox',...(process.env.WAFR_BROWSER_SINGLE_PROCESS?['--no-zygote','--single-process']:[])]});
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    const open=async(query='')=>{await page.goto('http://127.0.0.1:5178/?'+query);await page.getByText('أهلًا بك',{exact:true}).waitFor();};
    await open('scenario=working');
    await page.getByRole('button',{name:'تسجيل الانصراف',exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'home-working.png'),fullPage:true});
    for(const [width,height] of [[320,740],[375,812],[844,390]]) {
      await page.setViewportSize({width,height});await open('scenario=working&long=1');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`overflow at ${width}`);
      for(const name of ['الإعدادات','الملف الشخصي']) {const bounds=await page.getByRole('button',{name,exact:true}).boundingBox();assert.ok(bounds.width>=48&&bounds.height>=48);}
    }
    await page.setViewportSize({width:320,height:740});await open('scenario=working&large=1');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'large font overflow');
    await page.screenshot({path:path.join(output,'large-text.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await open('scenario=before');await page.getByRole('button',{name:'تسجيل الحضور',exact:true}).waitFor();
    await open('scenario=late');assert.equal(await page.getByRole('button',{name:'في الاستراحة',exact:true}).isDisabled(),true);
    await page.getByText('تأخير العودة:',{exact:false}).waitFor();await page.getByRole('button',{name:'رجعت من الاستراحة',exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'home-break.png'),fullPage:true});
    await open('scenario=break-error');assert.equal(await page.getByRole('button',{name:'تسجيل الانصراف',exact:true}).isDisabled(),true);
    await open('scenario=working');await page.getByRole('button',{name:'تسجيل الانصراف',exact:true}).click();
    await page.getByText('تم تسجيل الانصراف',{exact:true}).waitFor();await page.getByText('03:00',{exact:true}).first().waitFor();
    await page.screenshot({path:path.join(output,'checkout-receipt.png'),fullPage:true});
    await page.getByRole('button',{name:'عرض سجل اليوم',exact:true}).click();
    assert.equal((await page.evaluate(()=>window.lastRoute)).params.date.length,10);
    await open('scenario=report-error');await page.getByRole('button',{name:'تسجيل الانصراف',exact:true}).click();
    await page.getByText('تم تسجيل الانصراف',{exact:true}).waitFor();await page.getByText('تعذر تحميل إجمالي اليوم',{exact:false}).waitFor();
    await page.goto('http://127.0.0.1:5178/?screen=settings');await page.getByRole('button',{name:'أمان الدخول والباس كي',exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'settings.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('Native component layout checks passed: narrow/landscape, identity controls, breaks, saved receipt, report failure, settings. Screenshots: '+output);
  } catch(error){ console.error(error); console.error(logs);process.exitCode=1; }
  finally { if(browser)await browser.close();server.kill(); }
})();
