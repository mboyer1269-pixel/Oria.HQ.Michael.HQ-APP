import {createRoot} from 'react-dom/client';
import {EmployeeTeam} from '@/features/employees/components/employee-team';
import '../../src/app/globals.css';
const profile = {id:'emp_fixture',displayName:'Profil synthétique',specialty:'Recherche',instructions:'Utiliser un outil souhaité',assignmentRole:'Analyste',assignmentContext:'Business synthétique',state:'draft',revision:1,ownerId:'owner',workspaceId:'workspace',ventureId:'venture'};
const scenario = new URLSearchParams(location.search).get('scenario');
const initial = scenario === 'error' ? {status:'unavailable',message:'Lecture synthétique indisponible.'} : {status:'ready',employees:scenario === 'empty' ? [] : [{...profile,...(scenario === 'long-name' ? {displayName:'X'.repeat(80)} : scenario === 'partial' ? {instructions:''} : scenario === 'archived' ? {state:'archived'} : {})}]};
createRoot(document.getElementById('root')).render(<main style={{padding:16,maxWidth:1100,margin:'auto'}}><h1>Readiness — données synthétiques uniquement</h1><EmployeeTeam ventureId="venture" recoveryScope={{ownerId:'owner',workspaceId:'workspace'}} initial={initial}/></main>);
