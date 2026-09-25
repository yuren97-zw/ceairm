export function createPersonnelDeletion({ db, now, randomId, audit, superAccountId, clearSessionCache }) {
  const failure = (message, status, details) => Object.assign(new Error(message), { status, details });
  const isSuper = user => user?.id === superAccountId;
  function authorize(user, id, deleting = false) {
    if (isSuper(user)) return;
    audit(user, deleting ? "reject_delete_personnel" : "deny_personnel_deletion_preview", "personnel", id, "仅唯一超级管理员可操作");
    throw failure("仅超级管理员可删除人员", 403);
  }
  function preview(id, user) {
    authorize(user, id);
    const person = db.prepare("select * from personnel where id=?").get(id);
    if (!person) throw failure("未找到人员", 404);
    const accounts = db.prepare("select id,username,status from users where person_id=? order by id").all(id);
    const blockers = db.prepare(`select a.id as assignmentId,a.flight_id as flightId,a.owner_type as ownerType,
      a.owner_id as ownerId,a.role,a.status,f.flight_no as flightNo,f.date,
      case when a.owner_type='subtask' then coalesce(s.title,'非例行') else '维修机会' end as taskName
      from maintenance_assignments a join maintenance_flights f on f.id=a.flight_id
      left join maintenance_subtasks s on a.owner_type='subtask' and s.id=a.owner_id
      where a.person_id=? and coalesce(f.archived_at,'')=''
      and coalesce(a.status,'')<>'已确认'
      order by f.date,f.flight_no,a.id`).all(id);
    const counts = {};
    for (const [key, table] of [["licenses", "personnel_licenses"], ["authorizations", "personnel_authorizations"], ["training", "personnel_training_records"]]) {
      counts[key] = Number(db.prepare(`select count(*) as count from ${table} where person_id=?`).get(id).count);
    }
    const protectedIdentity = person.employee_no === superAccountId || accounts.some(row => row.id === superAccountId);
    return { person: { id, employeeNo: person.employee_no, name: person.name, dataStatus: person.data_status }, accounts, counts, blockers,
      protectedIdentity, alreadyDeleted: person.data_status === "deleted", canDelete: !protectedIdentity && person.data_status === "active" && !blockers.length };
  }
  function remove(id, payload, user) {
    authorize(user, id, true);
    let result;
    try {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw failure("请填写工号和删除原因", 400);
      const reason = String(payload.reason || "").trim();
      const employeeNo = String(payload.employeeNo || "").trim();
      if (!reason) throw failure("请填写删除原因", 400);
      db.exec("begin immediate");
      try {
        // Same lock as the PostgreSQL association guards. SQLite serializes writers itself.
        if (db.kind === "postgres") db.exec("select pg_advisory_xact_lock(54002010, 31)");
        const impact = preview(id, user);
        if (impact.protectedIdentity) throw failure("唯一超级管理员的人员记录不可删除", 403);
        if (employeeNo !== impact.person.employeeNo) throw failure("确认工号与目标人员不一致", 400);
        if (impact.alreadyDeleted) result = { ok: true, alreadyDeleted: true, retainedHistory: true, disabledAccountIds: [] };
        else {
          if (!impact.canDelete) throw failure("存在未完成或未确认维修派工，请先改派或完成确认", 409, { blockers: impact.blockers });
          const stamp = now();
          db.prepare("update personnel set data_status='deleted',deleted_at=?,deleted_by=?,delete_reason=?,updated_at=? where id=?")
            .run(stamp, user.id, reason, stamp, id);
          for (const account of impact.accounts) {
            db.prepare("update users set status='disabled',credential_version=coalesce(credential_version,1)+1,updated_at=? where id=?").run(stamp, account.id);
            db.prepare("delete from sessions where user_id=?").run(account.id);
          }
          db.prepare("insert into personnel_change_logs(id,person_id,field_name,field_label,old_value,new_value,source_type,source_batch_id,reason,operator_id,operator_name,created_at) values(?,?,'dataStatus','人员记录状态','active','deleted','manual','',?,?,?,?)")
            .run(randomId("pchange"), id, reason, user.id, user.name, stamp);
          audit(user, "delete_personnel", "personnel", id, JSON.stringify({ employeeNo, reason, counts: impact.counts, accounts: impact.accounts.map(row => row.id), retainedHistory: true }));
          result = { ok: true, alreadyDeleted: false, retainedHistory: true, disabledAccountIds: impact.accounts.map(row => row.id) };
        }
        db.exec("commit");
      } catch (error) { db.exec("rollback"); throw error; }
    } catch (error) {
      audit(user, "reject_delete_personnel", "personnel", id, JSON.stringify({ error: error.message, ...error.details }));
      throw error;
    }
    // Cache changes follow commit; a failed deletion must leave valid sessions intact.
    result.disabledAccountIds.forEach(clearSessionCache);
    return result;
  }
  return { isSuper, preview, remove };
}

// Guards cover stale HTTP requests and multiple application processes, not just UI filtering.
// Only deletion invariants are enforced here; existing historical rows remain untouched.
export function installPersonnelDeletionGuards(db) {
  const unavailablePerson = expression => `not exists(select 1 from personnel p where p.id=${expression} and p.data_status='active' and p.employment_status not in ('离职','停职'))`;
  const guards = [
    ["personnel_no_restore", "personnel", "update of data_status", "old.data_status='deleted' and new.data_status<>'deleted'"],
    ["users_no_deleted_insert", "users", "insert", "new.person_id is not null and trim(new.person_id)<>'' and not exists(select 1 from personnel where id=new.person_id and data_status='active')"],
    ["users_no_deleted_update", "users", "update of person_id,status", "(coalesce(new.person_id,'')<>coalesce(old.person_id,'')) or (coalesce(new.status,'active')<>'disabled' and new.person_id is not null and trim(new.person_id)<>'' and not exists(select 1 from personnel where id=new.person_id and data_status='active'))"],
    ["users_identity_immutable", "users", "update of person_id", "coalesce(new.person_id,'')<>coalesce(old.person_id,'')"],
    ["assignments_no_deleted_insert", "maintenance_assignments", "insert", unavailablePerson("new.person_id")],
    ["assignments_no_deleted_update", "maintenance_assignments", "update of person_id", `new.person_id<>old.person_id and ${unavailablePerson("new.person_id")}`],
    ["recipients_no_deleted_insert", "record_recipients", "insert", `${unavailablePerson("new.person_id")} or not exists(select 1 from users where id=new.user_id and person_id=new.person_id and coalesce(status,'active')<>'disabled')`],
    ["recipients_no_deleted_update", "record_recipients", "update of user_id,person_id", "new.user_id<>old.user_id or coalesce(new.person_id,'')<>coalesce(old.person_id,'')"]
  ];
  for (const table of ["personnel_licenses", "personnel_authorizations", "personnel_training_records"]) {
    for (const event of ["insert", "update"]) guards.push([`${table}_no_deleted_${event}`, table, event, "not exists(select 1 from personnel where id=new.person_id and employee_no=new.employee_no and data_status='active')"]);
  }
  for (const [name, table, event, condition] of guards) {
    if (db.kind === "postgres") {
      db.exec(`create or replace function guard_${name}() returns trigger language plpgsql as $$
        begin
          perform pg_advisory_xact_lock(54002010, 31);
          if ${condition} then raise exception '人员已删除、人员不存在或身份对应不一致，不能新增关联'; end if;
          return new;
        end $$;
        drop trigger if exists ${name} on ${table};
        create trigger ${name} before ${event} on ${table} for each row execute function guard_${name}();`);
    } else {
      db.exec(`drop trigger if exists ${name}; create trigger ${name} before ${event} on ${table}
        when ${condition} begin select raise(abort,'人员已删除、人员不存在或身份对应不一致，不能新增关联'); end;`);
    }
  }
}
