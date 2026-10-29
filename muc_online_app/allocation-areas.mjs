export const ALLOCATION_POOLS = ['SPECIAL','WAITING'];
export const SPECIAL_AREA = '@special';
// Production membership remains workingGroup (one of the four groups or null).
// Pool membership is an independent work-placement attribute, never organization.
export const allocationArea = state => state.workingGroup ?? (state.allocationPool==='SPECIAL'?SPECIAL_AREA:null);
export const allocationTarget = area => ({targetGroup:area===SPECIAL_AREA?null:area,targetPool:area===SPECIAL_AREA?'SPECIAL':area===null?'WAITING':undefined});
