export async function readEmployeesAction() {
  await new Promise(resolve => setTimeout(resolve, 600));
  return {status:'unavailable',message:'Lecture synthétique indisponible.'};
}
export async function saveEmployeeAction() { throw new Error('Writes are not supported by this readiness fixture'); }
