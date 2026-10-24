// Test transport only. No product server action or authentication is replaced in Next.js.
export async function transport(body) {
  const response = await fetch('/__qualification', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  if (!response.ok) throw new Error('Synthetic acknowledgement lost');
  return response.json();
}
export const saveAgentDisplayName = input => transport({kind: 'name-write', input});
export const readEmployeesAction = ventureId => transport({kind: 'employee-read', ventureId});
export const saveEmployeeAction = (ventureId, input) => transport({kind: 'employee-write', ventureId, input});
