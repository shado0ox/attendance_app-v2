import test from 'node:test';
import assert from 'node:assert/strict';
import { conflictingIdentity, employeeIdentities, identityValue, resolveIdentity, adminIdentity, masterIdentity } from '../src/server/companyIdentity';
const a=employeeIdentities('a',[{id:'e',name:'Same name',username:' Staff ',email:' STAFF@EXAMPLE.COM '}])[0];
const b=employeeIdentities('b',[{id:'e',name:'Same name',username:'other',email:'other@example.com'}])[0];
test('global login resolves normalized username/email and never uses caller-supplied company',()=>{
 assert.equal(identityValue(' Staff@Example.com '),'staff@example.com');for(const input of ['staff',' STAFF@EXAMPLE.COM '])assert.equal(resolveIdentity([a,b],input,'employee')?.companyId,'a');assert.equal(resolveIdentity([a,b],'same name','employee'),null);assert.equal(resolveIdentity([a,b],'staff','admin'),null);
});
test('ambiguous legacy identities fail closed even if one password or role matches',()=>{
 const duplicate={...b,email:a.email};assert.equal(resolveIdentity([a,duplicate],a.email,'employee'),null);assert.equal(resolveIdentity([a,adminIdentity({id:1,username:'staff',companyId:'b'})],'staff','employee'),null);
});
test('cross-field global conflicts are blocked, including archived staff and company managers',()=>{
 const next={...b,username:a.email};assert.equal(conflictingIdentity([next],[b],[a,b]),a.email);assert.equal(conflictingIdentity([a,b],[],[masterIdentity({id:'c',adminUsername:a.username})]),a.username);
 assert.equal(conflictingIdentity([{...a,email:'new@example.com'}],[a],[a,b]),null);assert.equal(conflictingIdentity([a,b],[],[]),null,'display names can coincide');
});
test('legacy duplicate claims are preserved for unrelated saves but no new collision can be introduced',()=>{
 const duplicate={...b,username:a.username};assert.equal(conflictingIdentity([a],[a],[a,duplicate]),null);assert.equal(conflictingIdentity([{...a,email:b.email}],[a],[a,b]),b.email);assert.equal(conflictingIdentity([a,{...b,email:a.email}],[],[]),a.email);
});
