export const validEmployeeEmail = (value: unknown): value is string => typeof value === 'string' && value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
export const safeDepartmentLogo = (value: unknown): string => typeof value === 'string' && value.length <= 100000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) ? value : '';
export const departmentColor = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#01696f';
export function filterEmployees(employees: any[], departments: any[], query: string, department: string, missingEmail: boolean) {
  const normalize = (v: unknown) => String(v || '').normalize('NFKC').toLocaleLowerCase('ar').replace(/\s+/g, ' ').trim();
  const search = normalize(query);
  return employees.filter(e => (department === 'all' || (department === 'unassigned' ? !departments.some(d => d.id === e.dept) : e.dept === department)) && (!missingEmail || !validEmployeeEmail(e.email)) && (!search || [e.name, e.username, e.email, e.phone].some(v => normalize(v).includes(search))));
}
