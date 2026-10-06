import React from "react";

export function thirdPartyProjectLabel(item) {
  const company = String(item.thirdPartyCompany || "").trim();
  const name = String(item.projectName || "未命名项目").trim();
  if (!company || !name.startsWith(company)) return name;
  return name.slice(company.length).replace(/^[\s\-_—–:：·]+/, "") || name;
}

export function thirdPartyGroups(items = []) {
  const groups = new Map();
  for (const item of items) {
    const company = String(item.thirdPartyCompany || "").trim() || "公司待配置";
    if (!groups.has(company)) groups.set(company, []);
    groups.get(company).push(item);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-Hans-CN"));
}

// A company name always receives the same restrained visual tone.
export function thirdPartyCompanyTone(company = "") {
  return [...String(company)].reduce((sum, character) => sum + character.codePointAt(0), 0) % 6;
}

export function ThirdPartyAuthorizationGroups({ items, openCompany, onToggle, renderItem, renderCompany = company => company }) {
  return <div className="third-party-company-groups">{thirdPartyGroups(items).map(([company, companyItems]) => {
    const open = openCompany === company;
    return <section className={`third-party-company company-tone-${thirdPartyCompanyTone(company)} ${open ? "expanded" : ""}`} key={company}>
      <button type="button" className="third-party-company-toggle" aria-expanded={open} onClick={() => onToggle(open ? "" : company)}>
        <span>{open ? "▾" : "▸"} <b>{renderCompany(company)}</b></span><strong>{companyItems.length}条</strong>
      </button>
      {open && <div className="third-party-company-items">{companyItems.map(item => renderItem(item, thirdPartyProjectLabel(item)))}</div>}
    </section>;
  })}</div>;
}
