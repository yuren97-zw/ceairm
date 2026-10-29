import React from 'react';
import {PEOPLE_CATEGORIES,peopleCategory,sortedPeople} from './people-list.js';

export function PeopleNameList({ids,byId,onPerson,showLegend=true}){
  const ordered=sortedPeople(ids,byId);
  const counts=Object.fromEntries(PEOPLE_CATEGORIES.map(([key])=>[key,0]));
  ordered.forEach(id=>counts[peopleCategory(byId[id])]++);
  return <div className="people-name-list">
    {showLegend&&!!ordered.length&&<div className="people-name-legend" aria-label="人员分类">{PEOPLE_CATEGORIES.filter(([key])=>counts[key]).map(([key,label])=><span key={key}><i className={`people-name-swatch ${key}`} aria-hidden="true"/>{label} {counts[key]}人</span>)}</div>}
    <div className="name-list">{!ordered.length&&<p className="empty">暂无人员</p>}{ordered.map(id=>{const person=byId[id],category=peopleCategory(person),label=PEOPLE_CATEGORIES.find(([key])=>key===category)[1];return <button type="button" className={`people-name ${category}`} key={id} aria-label={`${person?.name||id}，${label}`} disabled={!person} onClick={()=>onPerson(person)}>{person?.name||id}</button>;})}</div>
  </div>;
}
