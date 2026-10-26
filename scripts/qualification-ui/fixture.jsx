import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AgentCard} from '@/features/agents/components/agent-card';
import {EmployeeTeam} from '@/features/employees/components/employee-team';
import {agentRegistry} from '@/features/agents/seed';
import {transport} from './actions.js';
const agent = agentRegistry.find(row => row.id === 'joris');
function Fixture() {
  const [scope, setScope] = useState('A');
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  async function refresh() {
    try { setSnapshot(await transport({kind: 'snapshot', scope})); }
    catch { setError('Lecture synthétique indisponible'); }
  }
  useEffect(() => { setSnapshot(null); void refresh(); }, [scope]);
  useEffect(() => { window.addEventListener('qualification-refresh', refresh); return () => window.removeEventListener('qualification-refresh', refresh); }, [scope]);
  return <main><h1>Qualification locale — réponses synthétiques uniquement</h1>
    <p>Vrais composants montés isolément. Ni Auth réel, ni base durable, ni page HQ authentifiée. La mémoire du banc survit au rechargement, pas à son arrêt.</p>
    <button id="switch" onClick={() => setScope(scope === 'A' ? 'B' : 'A')}>Changer le périmètre synthétique</button>
    <button id="refresh" onClick={refresh}>Relire le nom synthétique</button>
    <p>Périmètre {scope} · propriétaire, workspace et business changent ensemble (simulation)</p>
    {error && <p role="alert">{error}</p>}
    {snapshot && <><section id="builtin"><AgentCard key={scope} agent={{...agent,name:snapshot.name ?? agent.name}} naming={{available:true,defaultName:agent.name}}/></section>
      <section id="team"><EmployeeTeam key={scope} ventureId={'business-'+scope} recoveryScope={{ownerId:'owner-'+scope,workspaceId:'workspace-'+scope}} initial={{status:'ready',employees:snapshot.employees}}/></section></>}
  </main>;
}
const optedIn = new URLSearchParams(location.search).get('qualification') === 'synthetic';
createRoot(document.getElementById('root')).render(optedIn ? <Fixture/> : <p>Qualification désactivée. Aucun composant ni transport de test démarré.</p>);
