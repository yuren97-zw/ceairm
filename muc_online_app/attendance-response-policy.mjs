// HTTP viewers do not inherit statistics through newly added display aliases.
export function attendanceViewerSnapshot(snapshot,canStats){
 if(canStats)return snapshot;
 const people=snapshot.people.map(person=>{const {counts,displayCounts,pendingCounts,overtimeSeconds,computedDays,uncomputableDays,...detail}=person;return detail;});
 const {approvalReasonCoverage,...safe}=snapshot;
 return {...safe,people};
}
