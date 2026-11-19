// Build a fresh SYNTHETIC base sqlite fixture by importing the real app (migrations+seed only).
// No business database involved. Traceable: logs seed counts and db path.
const app='/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app';
const out='/private/tmp/zcode-sealed-20261117';
process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';
process.env.DB_PATH=out+'/base.sqlite';process.env.UPLOAD_DIR=out+'/uploads';
process.env.APP_VERSION='test-version';
process.env.COS_SECRET_ID='test-secret-id';process.env.COS_SECRET_KEY='test-secret-key';process.env.COS_BUCKET='test-bucket-1234567890';process.env.COS_REGION='ap-shanghai';
for(const k of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED','ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED','ATTENDANCE_VALIDATION_ENABLED'])process.env[k]='false';
const {db}=await import(app+'/server.mjs');
const user=db.prepare("select id,username,person_id from users where id='54002010'").get();
const roles=db.prepare('select count(*) n from rbac_roles').get();
const migrations=db.prepare('select count(*) n from schema_migrations').get();
console.log(JSON.stringify({ok:!!user,user,rbacRoles:roles.n,migrations:migrations.n}));
await db.close?.();
