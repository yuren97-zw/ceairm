import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPosition, identityQualityReport, IDENTITY_CLASSES, IDENTITY_CLASSIFICATION_RULES_VERSION } from '../identity-classification.mjs';

// V1.1 §3.1 身份分类规则：去首尾空白后精确匹配；空值与未知值归普通员工且显式标记；
// 不拆词、不模糊识别；分组/角色/岗级与本分类无关（本模块唯一输入是 position_code）。

test('干部职位精确匹配', () => {
  for (const position of ['主任', '副主任', '助理', '书记']) {
    const result = classifyPosition(position);
    assert.equal(result.identity, IDENTITY_CLASSES.CADRE);
    assert.equal(result.identityLabel, '干部');
    assert.equal(result.quality, 'matched');
    assert.equal(result.suspectedCombined, false);
  }
});

test('班组长职位精确匹配', () => {
  const result = classifyPosition('班组长');
  assert.equal(result.identity, IDENTITY_CLASSES.TEAM_LEADER);
  assert.equal(result.identityLabel, '班组长');
  assert.equal(result.quality, 'matched');
});

test('已知普通员工职位匹配且不升级', () => {
  for (const position of ['维修人员', '放行人员', '维修', '放行']) {
    const result = classifyPosition(position);
    assert.equal(result.identity, IDENTITY_CLASSES.WORKER);
    assert.equal(result.quality, 'matched');
  }
});

test('空值与缺失归普通员工并显式标记', () => {
  for (const raw of ['', null, undefined, '   ', '　']) {
    const result = classifyPosition(raw);
    assert.equal(result.identity, IDENTITY_CLASSES.WORKER);
    assert.equal(result.quality, 'empty');
  }
});

test('未知值归普通员工且不模糊识别', () => {
  for (const position of ['车间主任', '助理工程师', '班长', '班 组 长', '副班组长', '主任助理', '运行主任']) {
    const result = classifyPosition(position);
    assert.equal(result.identity, IDENTITY_CLASSES.WORKER, `「${position}」不应模糊识别为干部/班组长`);
    assert.equal(result.quality, 'unknown_value');
  }
});

test('组合值按未知值处理并标记 suspectedCombined，不拆词', () => {
  for (const position of ['主任/班组长', '副主任、班组长', '助理，班组长']) {
    const result = classifyPosition(position);
    assert.equal(result.identity, IDENTITY_CLASSES.WORKER, '组合值不拆词识别');
    assert.equal(result.quality, 'unknown_value');
    assert.equal(result.suspectedCombined, true);
  }
});

test('去首尾空白后精确匹配，保留原语义不做全角转换', () => {
  assert.equal(classifyPosition('  主任  ').identity, IDENTITY_CLASSES.CADRE);
  assert.equal(classifyPosition('\t班组长\n').identity, IDENTITY_CLASSES.TEAM_LEADER);
  // 全角空格不属于首尾空白常规范围外的字符变换：此处仅验证 trim 行为一致
  assert.equal(classifyPosition('  放行人员').quality, 'matched');
});

test('分类结果携带来源与规则版本，不自动生成权限', () => {
  const result = classifyPosition('主任');
  assert.equal(result.source, 'personnel.position_code');
  assert.equal(result.rulesVersion, IDENTITY_CLASSIFICATION_RULES_VERSION);
  assert.ok(!('permissions' in result) && !('roles' in result));
});

test('数据质量清单：汇总与未知值明细一致，不输出其他敏感字段', () => {
  const rows = [
    { employeeNo: '54000001', name: '甲', position: '主任' },
    { employeeNo: '54000002', name: '乙', position: '班组长' },
    { employeeNo: '54000003', name: '丙', position: '维修人员' },
    { employeeNo: '54000004', name: '丁', position: '' },
    { employeeNo: '54000005', name: '戊', position: '主任/班组长' },
    { employeeNo: '54000006', name: '己', position: '调度员' }
  ];
  const report = identityQualityReport(rows);
  assert.equal(report.summary.total, 6);
  assert.equal(report.summary.cadre, 1);
  assert.equal(report.summary.teamLeader, 1);
  assert.equal(report.summary.worker, 4);
  assert.equal(report.summary.workerMatched, 1);
  assert.equal(report.summary.workerUnknownValues, 2);
  assert.equal(report.summary.emptyPositions, 1);
  assert.equal(report.summary.suspectedCombined, 1);
  assert.deepEqual(report.unknownValues.map(item => item.employeeNo), ['54000005', '54000006']);
  assert.deepEqual(Object.keys(report.unknownValues[0]).sort(), ['employeeNo', 'name', 'position', 'suspectedCombined']);
});

test('数据质量清单对空输入与非数组输入安全', () => {
  for (const input of [[], null, undefined]) {
    const report = identityQualityReport(input);
    assert.equal(report.summary.total, 0);
    assert.deepEqual(report.unknownValues, []);
  }
});

test('携带账号信息时统计干部缺账号，缺省时不输出该维度', () => {
  const rows = [
    { employeeNo: '54000001', name: '甲', position: '主任', hasAccount: false },
    { employeeNo: '54000002', name: '乙', position: '副主任', hasAccount: true },
    { employeeNo: '54000003', name: '丙', position: '班组长', hasAccount: false },
    { employeeNo: '54000004', name: '丁', position: '维修人员', hasAccount: false }
  ];
  const report = identityQualityReport(rows);
  assert.equal(report.summary.cadreWithoutAccounts, 1, '仅干部身份计入缺账号统计');
  assert.deepEqual(report.cadreWithoutAccounts, [{ employeeNo: '54000001', name: '甲', position: '主任' }]);
  assert.deepEqual(Object.keys(report.cadreWithoutAccounts[0]).sort(), ['employeeNo', 'name', 'position']);
  const withoutAccountInfo = identityQualityReport(rows.map(({ hasAccount, ...rest }) => rest));
  assert.ok(!('cadreWithoutAccounts' in withoutAccountInfo.summary));
  assert.ok(!('cadreWithoutAccounts' in withoutAccountInfo));
});
