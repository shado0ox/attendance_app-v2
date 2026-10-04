import test from 'node:test';
import assert from 'node:assert/strict';
import { filterEmployees, safeDepartmentLogo, departmentColor, validEmployeeEmail } from '../src/lib/employeeDirectory';
const departments = [{ id: 'sales', name: 'المبيعات' }, { id: 'hr', name: 'الموارد البشرية' }];
const employees = [{ id: 'a', name: 'Ahmed  Ali', dept: 'sales', email: 'ahmed@example.com', phone: '050123' }, { id: 'b', name: 'محمد', dept: 'hr', email: '' }, { id: 'c', name: 'منى', dept: 'deleted', username: 'MONA' }];
test('directory combines search, department and incomplete email without changing stored employees', () => {
  assert.deepEqual(filterEmployees(employees, departments, ' AHMED ali ', 'sales', false).map(e => e.id), ['a']);
  assert.deepEqual(filterEmployees(employees, departments, 'mona', 'unassigned', true).map(e => e.id), ['c']);
  assert.deepEqual(filterEmployees(employees, departments, '', 'hr', true).map(e => e.id), ['b']);
  assert.equal(filterEmployees(employees, departments, '050123', 'all', true).length, 0);
  assert.equal(employees[0].name, 'Ahmed  Ali');
});
test('department badges accept bounded raster images and safe colors; reject SVG, remote URLs and invalid email', () => {
  assert.equal(safeDepartmentLogo('data:image/png;base64,YQ=='), 'data:image/png;base64,YQ==');
  for (const value of ['https://example.com/image.png', 'data:image/svg+xml;base64,YQ==', 'data:image/png;base64,' + 'a'.repeat(100000)]) assert.equal(safeDepartmentLogo(value), '');
  assert.equal(departmentColor('#AABBCC'), '#AABBCC');
  assert.equal(departmentColor('url(javascript:alert(1))'), '#01696f');
  assert.equal(validEmployeeEmail('employee@example.com'), true);
  assert.equal(validEmployeeEmail('employee@example.com\nBcc: other@example.com'), false);
});
