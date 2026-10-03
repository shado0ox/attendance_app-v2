import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../public/pwa-upgrade-bridge.js', import.meta.url), 'utf8');
async function install(clients: {path:string;modern:boolean}[], active = true) {
  let handler: any, activated = 0;
  const context = {
    URL, Promise,
    setTimeout: (fn:any) => setTimeout(fn,10), clearTimeout,
    MessageChannel: class {
      port1: any = {onmessage:null,close(){}};
      port2: any;
      constructor() { this.port2={reply:(data:any)=>this.port1.onmessage?.({data}),close(){}}; }
    },
    self: {
      registration:{active:active?{}:null,scope:'https://attendance.example/'},
      clients:{matchAll:async()=>clients.map(c=>({url:'https://attendance.example'+c.path,postMessage:(_:any,ports:any[])=>{if(c.modern) ports[0].reply({type:'ATTENDANCE_UPDATE_CAPABLE'});}}))},
      addEventListener:(type:string,fn:any)=>{if(type==='install')handler=fn;},
      skipWaiting:async()=>{activated++;}
    }
  };
  vm.runInNewContext(source,context);
  let work: Promise<any> = Promise.resolve();
  handler({waitUntil:(p:Promise<any>)=>{work=p;}});
  await work;return activated;
}
test('legacy employee clients can transition without deletion or navigation',async()=>{
  assert.equal(await install([{path:'/employee',modern:false}]),1);
  assert.equal(await install([{path:'/employee',modern:false},{path:'/admin/schedule',modern:true}]),1);
});
test('modern clients always wait for user activation, including mixed employee/admin sessions',async()=>{
  assert.equal(await install([{path:'/employee',modern:true}]),0);
  assert.equal(await install([{path:'/employee',modern:true},{path:'/admin/schedule',modern:true}]),0);
});
test('unknown admin/login clients are never forcibly migrated; first installs and empty client lists need no bridge',async()=>{
  assert.equal(await install([{path:'/employee',modern:false},{path:'/admin/schedule',modern:false}]),0);
  assert.equal(await install([{path:'/login',modern:false}]),0);
  assert.equal(await install([{path:'/employee',modern:false}],false),0);
  assert.equal(await install([]),0);
});
