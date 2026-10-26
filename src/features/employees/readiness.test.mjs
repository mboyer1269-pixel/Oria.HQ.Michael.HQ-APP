import test from 'node:test';
import assert from 'node:assert/strict';
import {createJiti} from 'jiti';
const {projectEmployeeReadiness} = await createJiti(import.meta.url).import('./readiness.ts');
const profile = {id:'emp_fixture',displayName:'Profil',specialty:'Recherche',instructions:'Utiliser les outils souhaités',assignmentRole:'Analyste',assignmentContext:'Business',state:'draft',revision:1,ownerId:'owner',workspaceId:'workspace',ventureId:'venture'};
test('complete proposed profile is deliberately unqualified, never executable', () => {
  const result = projectEmployeeReadiness(profile);
  assert.equal(result.status,'proposed'); assert.equal(result.executable,false);
  assert.match(result.execution,/exclu du registre/); assert.match(result.execution,/connexion fournisseur ne suffirait pas/);
  assert.match(result.access,/besoins, pas des accès/); assert.doesNotMatch(JSON.stringify(result),/compte manquant|prêt à exécuter/i);
});
test('partial mandate never implies permission; projection does not mutate input', () => {
  const partial = Object.freeze({...profile,instructions:''});
  assert.match(projectEmployeeReadiness(partial).mandate,/incomplet/);
  assert.equal(projectEmployeeReadiness(partial).executable,false);
});
test('archived and unknown states are distinct and never propose activation', () => {
  assert.equal(projectEmployeeReadiness({...profile,state:'archived'}).status,'archived');
  for (const value of [null,{...profile,state:'unexpected'}]) {
    const result = projectEmployeeReadiness(value);
    assert.equal(result.status,'unknown'); assert.equal(result.executable,false);
    assert.match(result.execution,/non confirmées/);
  }
});
