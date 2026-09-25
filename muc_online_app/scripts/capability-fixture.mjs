import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { GROUPS, DEFAULT_CODES } from '../capability-core.mjs';

// Test-only seeding. Never called by the production server or import center.
export async function seedCapabilityFixture(db, baselinePath) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Fixture requires NODE_ENV=test');
  const at = new Date().toISOString();
  const data = baselinePath ? JSON.parse(await fs.readFile(baselinePath, 'utf8')) : {
    people: Array.from({length: 9}, (_, i) => ({
      id: String(78000000+i), name: '回归人员'+(i+1),
      sourceGroup: i===8?'老头班':GROUPS[i%4], group: i===8?'其他池':GROUPS[i%4],
      licenses: [{type:'CAAC',number:'TEST-'+i}], english:'4',
      capabilities: [
        ...DEFAULT_CODES.slice(0,5).map((code,j)=>({code,name:['飞机维修CFM56','飞机维修LEAP','航线放行CFM56','航线放行LEAP','慢车试车CFM56'][j],category:['maintenance','maintenance','release','release','test_run'][j],unit:'本单位',authorizationType:'145'})),
        {code:'2-A03-01',name:'三方A320维修',category:'third_party',unit:'单位甲',authorizationType:'121'},
        {code:'2-A03-01',name:'三方A320维修',category:'third_party',unit:'单位乙',authorizationType:'121'}
      ]
    }))
  };
  const orgByCode=code=>db.prepare('select id from organization_units where code=?').get(code).id;
  const departmentId=orgByCode('DEPT-LINE'),orgId=orgByCode('GROUP-LINE-1'),orgId2=orgByCode('GROUP-LINE-2');
  const parentGroupForTeam=g=>['一组','二组'].includes(g)?orgId2:orgId;
  const teamIdFor=g=>{
    const code={'一组':'TEAM-LINE-1','二组':'TEAM-LINE-2','三组':'TEAM-LINE-3','四组':'TEAM-LINE-4'}[g];
    if(code)return orgByCode(code);
    const id='cap-test-'+g;
    db.prepare("insert into organization_units(id,code,name,unit_type,parent_id,status,created_at,updated_at) values(?,?,?,'administrative_team',?,'active',?,?) on conflict(id) do nothing").run(id,'CAP-'+g,g,parentGroupForTeam(g),at,at);
    return id;
  };
  const insertPerson=db.prepare('insert into personnel(id,employee_no,name,department,home_team,department_id,personnel_group_id,administrative_team_id,employment_status,data_status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?)');
  const insertAuth=db.prepare('insert into personnel_authorizations(id,person_id,employee_no,project_code,project_name,authorization_type,authorization_unit,authorization_status,authorization_expires_at,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?)');
  for(const p of data.people) {
    const group=p.sourceGroup||p.group, existing=db.prepare('select id from personnel where employee_no=?').get(p.id), id=existing?.id||'cap-person-'+p.id;
    if(existing) db.prepare('update personnel set department=?,home_team=?,department_id=?,personnel_group_id=?,administrative_team_id=? where id=?').run('能力集成验收部门',group,departmentId,parentGroupForTeam(group),teamIdFor(group),id);
    else insertPerson.run(id,p.id,p.name,'能力集成验收部门',group,departmentId,parentGroupForTeam(group),teamIdFor(group),'在职','active',at,at);
    for(const l of p.licenses||[])db.prepare('insert into personnel_licenses(id,person_id,employee_no,license_no,license_type,license_english_level,is_valid,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),id,p.id,l.number,l.type,p.english,'有效',at,at);
    for(const c of p.capabilities) {
      db.prepare('insert into capability_catalog(id,project_code,project_name,project_category,category_source,category_updated_at,authorization_type,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?) on conflict(project_code) do update set project_category=excluded.project_category,category_source=excluded.category_source,category_updated_at=excluded.category_updated_at').run(crypto.randomUUID(),c.code,c.name,c.category||'other','test_fixture',at,c.authorizationType,'active',at,at);
      for(let n=0;n<(c.sourceCount||1);n++)insertAuth.run(crypto.randomUUID(),id,p.id,c.code,c.name,n?String(c.authorizationType||'145')+'-'+n:c.authorizationType||'145',c.unit||'本单位','有效','2000-01-01',at,at);
    }
  }
  return {workspace:'department:'+departmentId,data};
}
