// A fixed simulation contract for spec 20.4, never a published business check.
// No request can provide executable rules, applicability or confirmation gates.
const simulation=Object.freeze({code:'nonsettlement_simulation',version:1,resultType:'CHECK_RESULT',tasks:Object.freeze([Object.freeze({key:'feedback',title:'模拟检查反馈'})]),outcomes:Object.freeze(['PASS','FAIL'])});
export function maintenanceWorkflowTemplates(simulationEnabled){return simulationEnabled?[simulation]:[];}
export function resolveMaintenanceWorkflowTemplate(code,version,module,simulationEnabled){
 if(!simulationEnabled||module.moduleTypeCode!=='extension_workflow_simulation'||module.moduleVersion!==1||module.resultType!=='CHECK_RESULT'||code!==simulation.code||version!==simulation.version)throw Object.assign(Error('没有已批准的工作流模板；模拟流程须明确启用'),{status:409});
 return simulation;
}
