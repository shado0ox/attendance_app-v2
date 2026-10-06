import test from 'node:test';
import assert from 'node:assert/strict';
import { businessCompany, canReadCompany, subscriptionMetadata, subscriptionUpdate } from '../src/server/tenantPrivacy';
test('platform admin business scope stays company 101 even for legacy foreign tokens',()=>{
  const root={role:'superadmin',companyId:'private'};
  assert.equal(businessCompany(root),'default');assert.equal(canReadCompany(root,'private'),false);assert.equal(canReadCompany(root,'default'),true);
  assert.equal(canReadCompany({role:'admin',companyId:'private'},'private'),true);assert.equal(canReadCompany({role:'employee',companyId:'private'},'default'),false);
});
test('subscription metadata never includes credentials or tenant content',()=>{
  const metadata=subscriptionMetadata({id:'a',name:'A',companyCode:'102',subscriptionStatus:'active',adminUsername:'secret',adminEmail:'secret@example.com',adminPassword:'secret',employees:['secret'],logoUrl:'private'});
  assert.equal(metadata.companyCode,'102');assert.ok(!JSON.stringify(metadata).includes('secret'));assert.equal('logoUrl' in metadata,false);
});
test('subscription update rejects credential resets and tenant editing',()=>{
  for(const key of ['adminPassword','adminUsername','adminEmail','name','logoUrl','companyCode','monthlyFee','employees','companyId']) assert.throws(()=>subscriptionUpdate({id:'a',subscriptionStatus:'active',[key]:'forged'}),{status:403});
  assert.deepEqual(subscriptionUpdate({id:'a',subscriptionStatus:'suspended'}),{subscriptionStatus:'suspended'});
  assert.equal(subscriptionUpdate({id:'a',subscriptionExpiresAt:'2030-01-01'}).subscriptionExpiresAt.toISOString(),'2030-01-01T00:00:00.000Z');
  for(const body of [{id:'default',subscriptionStatus:'active'},{id:'a',subscriptionStatus:'unknown'},{id:'a',subscriptionExpiresAt:'bad'},{id:'a'}]) assert.throws(()=>subscriptionUpdate(body),{status:400});
});
