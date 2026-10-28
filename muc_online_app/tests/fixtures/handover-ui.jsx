import React from 'react';
import {createRoot} from 'react-dom/client';
import {StatusForm} from '../../capability-ui/Center.jsx';
import css from '../../capability-ui/center.css';
const host=document.querySelector('#preview').attachShadow({mode:'open'}),style=document.createElement('style'),root=document.createElement('div');
style.textContent=css;host.append(style,root);
const snap={people:[{id:'incoming',name:'接班测试人员',employeeNo:'TEST002'},{id:'outgoing',name:'原派驻测试人员',employeeNo:'TEST001'}],records:[{id:'prior',person_id:'outgoing',kind:'DEPLOYED',phase:'ACTIVE',deployment_location_id:'loc',start_date:'2026-10-01',end_date:'',handover_days:1}],permissions:{allocate:true},returnTargets:['一组','WAITING'],deploymentLocations:[{id:'loc',name:'交接测试地点',status:'active'}],otherStatusOptions:[]};
createRoot(root).render(<StatusForm snap={snap} model={{kind:'DEPLOYED',personId:'incoming'}} busy={false} isSuper={true} canManageLocations={false} onClose={()=>{}} onSave={p=>{document.querySelector('#result').textContent=JSON.stringify(p);}}/>);
