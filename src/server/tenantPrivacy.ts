/** Platform subscription privileges never grant access to another company's business data. */
export type TenantPrincipal = { role: string; companyId: string };
export const businessCompany = (auth: TenantPrincipal) => auth.role === 'superadmin' ? 'default' : auth.companyId;
export const canReadCompany = (auth: TenantPrincipal, companyId: string) => businessCompany(auth) === companyId;
export const subscriptionMetadata = (company: any) => ({
  id: company.id, name: company.name, companyCode: company.companyCode,
  subscriptionStatus: company.subscriptionStatus, subscriptionExpiresAt: company.subscriptionExpiresAt,
  monthlyFee: company.monthlyFee, createdAt: company.createdAt,
});
export function subscriptionUpdate(body: any) {
  if (!body || Object.keys(body).some(key => !['id', 'subscriptionStatus', 'subscriptionExpiresAt'].includes(key))) throw Object.assign(new Error('صلاحية مسؤول النظام تقتصر على حالة الاشتراك وتجديده؛ بيانات الحساب والشركة خاصة بصاحبها'), { status: 403 });
  if (typeof body.id !== 'string' || !body.id || body.id === 'default') throw Object.assign(new Error('حدد شركة مشتركة'), { status: 400 });
  const values: any = {};
  if (body.subscriptionStatus !== undefined) {
    if (!['active', 'suspended'].includes(body.subscriptionStatus)) throw Object.assign(new Error('حالة الاشتراك غير صحيحة'), { status: 400 });
    values.subscriptionStatus = body.subscriptionStatus;
  }
  if (body.subscriptionExpiresAt !== undefined) {
    const date = new Date(body.subscriptionExpiresAt);
    if (typeof body.subscriptionExpiresAt !== 'string' || !Number.isFinite(date.getTime())) throw Object.assign(new Error('تاريخ انتهاء الاشتراك غير صحيح'), { status: 400 });
    values.subscriptionExpiresAt = date;
  }
  if (!Object.keys(values).length) throw Object.assign(new Error('حدد إجراء الاشتراك'), { status: 400 });
  return values;
}
