import type { SimulationEvent } from './simulation';
import type { Team } from './contracts';
/** Explicit fictional exercise inputs. Not historical evidence, AI output or recorded calls. */
export const katrinaCenter: [number,number] = [-89.956,29.946];
export const katrinaEvents: SimulationEvent[] = [
  { id:'K-01',source:'news',atSeconds:0,label:'Chalmette exercise sector',coordinates:[-89.965,29.948],text:'FICTIONAL TRAINING NEWS BULLETIN: Standing floodwater and stalled vehicles reported across a road segment in the Chalmette exercise sector. Road access is reportedly blocked; extent and depth have not been confirmed.' },
  { id:'K-02',source:'911 bulletin',atSeconds:8,label:'Arabi exercise sector',coordinates:[-89.988,29.957],text:'FICTIONAL TRAINING 911 INTAKE BULLETIN (not a recorded call): Six residents report smoke and visible flames outside a building in the Arabi exercise sector. Injury count is unknown. The front entrance is reported inaccessible; rear access is unconfirmed.' },
  { id:'K-03',source:'police',atSeconds:16,label:'Meraux exercise sector',coordinates:[-89.929,29.934],text:'FICTIONAL TRAINING POLICE BULLETIN: Utility power and street signals are reported out in the Meraux exercise sector. A utility line is reportedly down. Whether the road is blocked is unconfirmed; no verified injury count is available.' },
  { id:'K-04',source:'911 bulletin',atSeconds:24,label:'Chalmette east exercise sector',coordinates:[-89.945,29.945],text:'FICTIONAL TRAINING 911 INTAKE BULLETIN (not a recorded call): Twelve people at a temporary exercise gathering point request three standardized supply totes of water. The source says the local access lane is open but does not provide independent confirmation.' },
  { id:'K-05',source:'police',atSeconds:32,label:'Violet exercise sector',coordinates:[-89.899,29.906],text:'FICTIONAL TRAINING POLICE BULLETIN: Fallen debris is reported blocking a road segment in the Violet exercise sector. Exact affected lanes and passability are uncertain. No responders have been deployed by this simulation.' },
  { id:'K-06',source:'news',atSeconds:40,label:'Meraux north exercise sector',coordinates:[-89.932,29.946],text:'FICTIONAL TRAINING NEWS BULLETIN: Smoke and a small visible fire are reported near an unoccupied roadside structure in the Meraux north exercise sector. No reliable injury report is available. Road access remains unconfirmed.' },
];
export const katrinaTeams: Team[] = [
  {id:'DRILL-A',name:'Exercise team Alpha',members:3,status:'available',capacity:12,capabilities:['water','food','medicine'],coordinates:[-89.972,29.942],nodeId:'DRILL-A',depotLabel:'Fictional Chalmette staging point'},
  {id:'DRILL-B',name:'Exercise team Bravo',members:3,status:'available',capacity:12,capabilities:['water','food','medicine'],coordinates:[-89.918,29.929],nodeId:'DRILL-B',depotLabel:'Fictional Meraux staging point'},
];
