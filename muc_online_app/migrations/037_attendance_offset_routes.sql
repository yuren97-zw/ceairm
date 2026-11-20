-- B4 考勤路由候选集合（V1.1 §6.3）：干部共同审批的快照候选与可达性标记。
-- 036 编号预留给尚未合并的考勤单日封顶迁移（attendance_single_cap）。
create table if not exists attendance_offset_candidates(request_id text not null,user_id text not null,route_kind text not null,reachable integer not null default 1,reason text,created_at text not null,primary key(request_id,user_id));
create index if not exists attendance_offset_candidate_user on attendance_offset_candidates(user_id,request_id);
