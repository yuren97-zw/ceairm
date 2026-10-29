import React from 'react';
import {today} from '../capability-core.mjs';
import {statusPeopleColumns,statusPersonGroup,statusPersonEnd} from './status-people.js';
import {matchesPersonSearch} from './person-search.js';

export function StatusPeoplePool({snap,open,onToggle,sort='endDate',onSort,readOnly,onPerson,onManage,recordLabel,query=''}) {
  const columns = statusPeopleColumns(snap,sort), day = today();
  const total = columns.reduce((count,column) => count + column.items.length, 0);
  return <section className={`status-people-pool${open?' is-open':''}`}>
    <div className="status-people-header"><button className="status-people-toggle" type="button" aria-expanded={open} onClick={() => onToggle(!open)}><span aria-hidden="true">{open?'▾':'▸'} </span>状态人员 · {total}人</button>
      <button className="status-people-sort" type="button" aria-label={`状态人员排序：${sort==='group'?'按班组':'按结束日期'}，点击切换`} onClick={() => onSort?.(sort==='group'?'endDate':'group')}>{sort==='group'?'按班组':'按结束日期'}</button></div>
    {open && <div className="status-people-columns">
      {columns.map(({kind,title,items}) => <section className="status-people-column" key={kind} aria-label={title}>
        <h3>{title}<span>{items.length}人</span></h3>
        <div className="status-people-list" tabIndex={0} role="region" aria-label={`${title}人员列表`}>
          {items.filter(({person})=>matchesPersonSearch(person,query)).map(({person,state,record}) => {
            const end = statusPersonEnd(record?.end_date,day);
            return <article className={`status-people-card${end.soon?' ending-soon':''}`} key={person.id}>
              <button type="button" className="status-people-open" onClick={() => onPerson(person)}>
                <span className="status-people-heading"><strong>{person.name}</strong><span className="status-people-group">{statusPersonGroup(person,state)}</span><span className="status-people-label">{recordLabel(record) || title}</span></span>
                <span className="status-people-dates"><span className="status-people-date" aria-label="开始日期">{record?.start_date || '开始待核实'}</span>
                  {record?.end_date && <><span className="status-people-date-arrow" aria-hidden="true">→</span><span className="status-people-date" aria-label="结束日期">{record.end_date}</span></>}
                </span>
              </button>
              <div className="status-people-footer"><span className={`status-people-end${end.soon?' soon':''}`}>{end.text}</span>
                {!readOnly && <button type="button" className="status-people-manage" aria-label={`前往${title}管理：${person.name}`} onClick={() => onManage(kind,person.id)}>管理</button>}
              </div>
            </article>;
          })}
          {!items.some(({person})=>matchesPersonSearch(person,query)) && <p className="status-people-empty">{query.trim()?'无匹配人员':'暂无人员'}</p>}
        </div>
      </section>)}
    </div>}
  </section>;
}
