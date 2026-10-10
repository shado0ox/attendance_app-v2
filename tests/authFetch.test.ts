import test from 'node:test';
import assert from 'node:assert/strict';
import {installAuthFetch,SESSION_EXPIRED_EVENT} from '../src/lib/authFetch';

test('manager login failures and separate tokens do not expire the stored employee session',async()=>{
  const previousWindow=(globalThis as any).window,previousStorage=(globalThis as any).localStorage;
  const calls:{url:string;authorization:string|null}[]=[],events:string[]=[];
  const fakeWindow={location:{origin:'https://attendance.example.com'},fetch:async(input:any,init:any)=>{calls.push({url:String(input),authorization:new Headers(init?.headers).get('Authorization')});return new Response('{}',{status:401});},dispatchEvent:(event:Event)=>events.push(event.type)};
  (globalThis as any).window=fakeWindow;
  (globalThis as any).localStorage={getItem:()=>JSON.stringify({info:{token:'employee-session'}})};
  try{
    installAuthFetch();
    await fakeWindow.fetch('/api/auth/admin-login',{method:'POST'});
    await fakeWindow.fetch('/api/auth/employee-login',{method:'POST'});
    await fakeWindow.fetch('/api/document-approval/test',{headers:{Authorization:'Bearer manager-session'}});
    assert.equal(calls[0].authorization,null);assert.equal(calls[1].authorization,null);
    assert.equal(calls[2].authorization,'Bearer manager-session');assert.deepEqual(events,[]);
    await fakeWindow.fetch('/api/employee-attendance',{});
    assert.equal(calls[3].authorization,'Bearer employee-session');assert.deepEqual(events,[SESSION_EXPIRED_EVENT]);
  } finally {(globalThis as any).window=previousWindow;(globalThis as any).localStorage=previousStorage;}
});
