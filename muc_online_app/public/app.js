const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

const pageSizes = Array.from({ length: 9 }, (_, index) => 10 + index * 5);
const ataOptions = Array.from({ length: 100 }, (_, index) => String(index).padStart(2, "0"));
const receiverStatusFilters = ["全部", "未读", "已读", "超期", "收藏"];
const publisherStatusFilters = ["全部", "未读", "已读", "超期", "收藏", "我发布"];
const adminStatusFilters = ["全部", "未读", "已读", "超期", "收藏", "我发布", "作废"];
const LOGIN_STORAGE_KEY = "muc_saved_login_v1";
const AUTO_LOGIN_SKIP_KEY = "muc_skip_auto_login_once";
const MAINTENANCE_RULE_GROUPS_STORAGE_KEY = "muc_maintenance_rule_groups_open_v1";
const tabOptions = [
  ["homePage", "首页"],
  ["infoPage", "信息传达"],
  ["maintenancePage", "维修管控"],
  ["fixedPage", "固化项目"],
  ["hoursPage", "工时统计"],
  ["attendancePage", "考勤管理"]
];
const permissionOptions = [
  ["view", "查看"],
  ["create", "发布"],
  ["edit", "修改"],
  ["delete", "删除"],
  ["remind", "催办"],
  ["fixedManage", "固化项目维护"]
];
const roleLabels = { receiver: "接收者", publisher: "发布者", admin: "管理员" };
const statusLabels = { active: "启用", disabled: "停用" };
const defaultPersonnelFunctionCategories = ["维修", "放行"];

const demoUsers = [
  { id: "00000001", username: "receiver", password: "123456", name: "接收者", role: "receiver", department: "航线车间", team: "一班", permissions: ["view"], allowedTabs: ["homePage", "infoPage", "maintenancePage"] },
  { id: "u-publisher", username: "publisher", password: "123456", name: "发布者", role: "publisher", department: "质量管理", team: "发布组", permissions: ["view", "create", "remind"], allowedTabs: ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage"] },
  { id: "54002010", username: "54002010", password: "muc2026", name: "系统管理员", role: "admin", department: "系统管理", team: "管理员", permissions: ["view", "create", "edit", "delete", "remind", "fixedManage"], allowedTabs: ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage"] }
];

const fallbackRecords = [
  { date: "2026-05-31 10:05", category: "规定要求", title: "安全生产月与安全大整治活动", original: "请各班组结合安全生产月要求，组织开展风险识别、问题排查和整改闭环，确保宣贯到每名维修人员。", publisher: "赵威", attachments: [{ id: "demo-att-001", name: "安全生产月宣贯材料.txt", type: "text/plain", size: 180, storage: "demo", url: "data:text/plain;charset=utf-8,%E5%AE%89%E5%85%A8%E7%94%9F%E4%BA%A7%E6%9C%88%E5%AE%A3%E8%B4%AF%E6%9D%90%E6%96%99", ownerType: "record", ownerId: "demo-record" }] },
  { date: "2026-05-28 09:30", category: "质量问题", title: "国籍证夹安装方式检查问题", original: "航后检查发现B8648飞机国籍证夹开胶，进一步检查发现该机国籍证夹安装位置不符合EO的要求，现场要求维修人员重新粘贴。", publisher: "黄磊" },
  { date: "2026-05-24 15:10", category: "规定要求", title: "班组考核方案调整", original: "本月班组考核方案调整三方感谢信奖励分配和优秀经验总结报送规则，请各班组按新要求执行。", publisher: "王大伟" },
  { date: "2026-05-21 08:45", category: "质量问题", title: "大翼金属胶带破损连续未处理", original: "6636飞机19/20连续两日在青航后，右大翼金属胶带破损均未处理，后续工作中类似问题要积极处理。", publisher: "黄金山" },
  { date: "2026-05-18 11:20", category: "规定要求", title: "撤锥桶信息及时传递", original: "5月16日有一起机坪违章，125机位撤锥桶时间晚，后续关于风速变化撤摆锥桶请班组长及时通过对讲机通知。", publisher: "盖光启" },
  { date: "2026-05-15 16:40", category: "质量问题", title: "飞机记录本填写要求", original: "CCAR121.701(a)条规定应记录运行中发现的缺陷和维修工作，请大家正确填写记录本，不要漏签。", publisher: "李雪" },
  { date: "2026-05-11 09:00", category: "规定要求", title: "机场督查5月重点检查项", original: "重点检查特殊天气管控、车辆倒车速度及指挥、工作梯等无动力设备状态、接送机保障流程及状态。", publisher: "赵威" },
  { date: "2026-05-01 07:50", category: "规定要求", title: "航前短停更换机轮起落架销提示牌要求", original: "航前短停更换机轮，使用起落架销时必须借用提示牌摆放在机头前。提示牌在外场工具间。", publisher: "王舰艇" },
  { date: "2026-04-24 19:35", category: "规定要求", title: "ARJ送机停止边推边启动", original: "ARJ飞机须立即暂停边推边启动程序，需要推到位停稳后方能启动。务必确保所有C909授权人员知晓。", publisher: "田元鹏" },
  { date: "2026-04-20 13:25", category: "质量问题", title: "工具清点记录不全", original: "检查近期航线工具间回收的工具清单，发现多份工具清单上工具清点记录不全，提醒维修人员规范落实工具三清点。", publisher: "黄金山" },
  { date: "2026-04-17 17:05", category: "规定要求", title: "机坪发动机冷转申请要求", original: "各位班组长，现在机坪发动机冷转也需要申请，请大家知晓。", publisher: "赵威" },
  { date: "2026-04-14 10:18", category: "质量问题", title: "定期水洗发动机反推失效提醒", original: "检查B323C飞机执行定期水洗发动机工作时，发现维修人员打开左发反推包皮后，未及时失效反推。", publisher: "黄磊" }
];

const defaultSettings = {
  categories: ["质量问题", "规定要求", "周例会", "日例会", "其他"],
  personnelFunctionCategories: ["维修", "放行"],
  reminderDays: 1,
  overdueDays: 3,
  people: [
    { id: "00000001", name: "接收者", department: "未设置", team: "一班" },
    { id: "10000001", name: "王大伟", department: "未设置", team: "一班" },
    { id: "10000002", name: "赵威", department: "未设置", team: "管理组" },
    { id: "10000003", name: "黄金山", department: "未设置", team: "二班" },
    { id: "10000004", name: "黄磊", department: "未设置", team: "检查组" },
    { id: "10000005", name: "田元鹏", department: "未设置", team: "运行组" }
  ],
  rolePermissions: {
    receiver: { allowedTabs: ["homePage", "infoPage", "maintenancePage"], permissions: ["view"] },
    publisher: { allowedTabs: ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage"], permissions: ["view", "create", "remind"] },
    admin: { allowedTabs: ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage"], permissions: ["view", "create", "edit", "delete", "remind", "fixedManage"] }
  },
  securityNotes: "当前为静态演示版。正式上线需改为后端登录认证、数据库权限校验、附件访问鉴权、操作日志、撤回和修改留痕。"
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadMaintenanceRuleGroupsOpen() {
  try {
    const saved = JSON.parse(localStorage.getItem(MAINTENANCE_RULE_GROUPS_STORAGE_KEY) || "[]");
    const validKeys = new Set(["workType", "routineRatio", "nonroutineRatio"]);
    const keys = Array.isArray(saved) ? saved.filter(key => validKeys.has(key) || String(key).startsWith("routine:")) : [];
    return new Set(keys.length ? keys : ["workType"]);
  } catch {
    return new Set(["workType"]);
  }
}

const seedFixedProjects = [
  { id: "fp-001", ata: "32", title: "航前短停更换机轮固定提醒", contentHtml: "<p><b>步骤：</b>确认构型、借用起落架销、摆放提示牌、复核工具三清点。</p><p><b>风险：</b>提示牌遗漏、工具清点记录不完整、维护构型未复核。</p>", references: "AMM 32章；现场工具管理要求", attachments: [], createdAt: "2026-06-01T08:00:00", updatedAt: "2026-06-01T08:00:00" },
  { id: "fp-002", ata: "71", title: "发动机区域航后防护固定提醒", contentHtml: "<p><b>步骤：</b>确认发动机区域工作结束，检查天气条件，雨水天气按要求安装防雨罩。</p><p><b>风险：</b>工作结束后未及时加装防雨罩，造成质量检查问题。</p>", references: "EB-2016-V250-77-202-R5", attachments: [], createdAt: "2026-06-01T08:00:00", updatedAt: "2026-06-01T08:00:00" }
];

const state = {
  user: { id: "", username: "", name: "", role: "", permissions: [], allowedTabs: [] },
  records: [],
  receipts: [],
  fixedProjects: [],
  users: [],
  selectedUserIds: new Set(),
  userRoleFilter: "全部",
  settings: clone(defaultSettings),
  favorites: {},
  recordFiles: [],
  fixedFiles: [],
  selectedRecipientIds: new Set(),
  activePage: "homePage",
  activeSubpage: "infoListSubpage",
  selectedCategories: new Set(),
  deferFilterRecordIds: new Set(),
  deferFilterTimers: new Map(),
  statusFilter: "全部",
  statsSearch: "",
  statsTeam: "全部",
  statsStartDate: "",
  statsEndDate: "",
  statsSearchTimer: null,
  statsSearchComposing: false,
  activeMonth: "全部",
  page: 1,
  pageSize: 15,
  viewerZoom: 1,
  viewerMode: "",
  viewerDownloadUrl: "",
  viewerDownloadName: "",
  maintenanceTab: "dispatch",
  maintenanceLeftStatuses: new Set(["未派工"]),
  maintenanceRightStatuses: new Set(["已派工"]),
  maintenanceLeftSort: "default",
  maintenanceRightSort: "default",
  maintenanceStartDate: new Date().toISOString().slice(0, 10),
  maintenanceEndDate: new Date().toISOString().slice(0, 10),
  maintenanceOpportunityFilters: new Set(["航前", "航后", "航后/航前", "短停", "热备机", "停场", "附加", "其他", "三方短停", "三方航后", "三方航前"]),
  maintenanceFlightSearch: "",
  maintenanceFlightSearchTimer: null,
  maintenanceFlightSearchComposing: false,
  maintenanceFlights: [],
  maintenanceNextCursor: "",
  maintenanceRules: [],
  maintenanceStats: null,
  maintenanceRuleGroupsOpen: loadMaintenanceRuleGroupsOpen(),
  maintenancePersonalStats: null,
  maintenanceDataView: "personal",
  maintenanceDataRange: "half",
  maintenanceCompositionPeriod: "day",
  maintenanceDataChartView: "composition",
  maintenanceSearch: "",
  maintenanceMonth: new Date().toISOString().slice(0, 7),
  maintenanceDispatchDraft: null,
  maintenanceReviewDraft: null,
  maintenanceArchiveDeleteDraft: null,
  maintenanceWorkReportDraft: null,
  maintenanceSyncVersion: 0,
  maintenanceSyncTimer: null,
  maintenanceEventSource: null,
  maintenanceReconnectTimer: null,
  maintenanceSseConnected: false,
  maintenanceRefreshPending: false,
  maintenanceReleaseConfirmAssignmentId: "",
  maintenanceReleaseConfirmFlightId: "",
  maintenanceReleaseConfirmSubmitting: false,
  maintenanceDispatchOpenFlightId: "",
  maintenanceDispatchOpenNonroutineIds: new Set(),
  maintenanceDispatchClickTimer: null,
  maintenanceExecuteOpenFlightId: "",
  maintenanceExecuteOpenDate: "",
  maintenanceExecuteTimeSort: "desc",
  maintenanceFeedbackOpenId: "",
  maintenanceFeedbackDrafts: {},
  loadedData: new Set()
};

const LOCAL_APP_URL = "http://127.0.0.1:8787/";
const API_BASE_URL = window.MUC_API_BASE_URL || (location.protocol === "file:" ? `${LOCAL_APP_URL}api` : `${location.origin}/api`);
const ROUTES = {
  login: "/login",
  dashboard: "/dashboard"
};

function emptyUser() {
  return { id: "", username: "", name: "", role: "", permissions: [], allowedTabs: [] };
}

function isLoggedIn() {
  return !!state.user?.id;
}

function savedLogin() {
  try {
    return JSON.parse(localStorage.getItem(LOGIN_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistLoginPreference(username, password, rememberPassword, autoLogin) {
  if (!rememberPassword) {
    localStorage.removeItem(LOGIN_STORAGE_KEY);
    return;
  }
  localStorage.setItem(LOGIN_STORAGE_KEY, JSON.stringify({
    username,
    password,
    rememberPassword: true,
    autoLogin: !!autoLogin
  }));
}

function clearAutoLoginPreference() {
  const saved = savedLogin();
  if (!saved.rememberPassword) return;
  localStorage.setItem(LOGIN_STORAGE_KEY, JSON.stringify({ ...saved, autoLogin: false }));
}

function fillLoginForm() {
  const saved = savedLogin();
  $("#loginUser").value = saved.username || "";
  $("#loginPass").value = saved.rememberPassword ? (saved.password || "") : "";
  $("#rememberPassword").checked = !!saved.rememberPassword;
  $("#autoLogin").checked = !!saved.autoLogin && !!saved.rememberPassword;
}

function currentRoute() {
  return location.pathname === ROUTES.dashboard ? ROUTES.dashboard : ROUTES.login;
}

function setRoute(path, replace = false) {
  if (location.pathname === path) return;
  const method = replace ? "replaceState" : "pushState";
  history[method](null, "", path);
}

function setAppMode(mode) {
  document.body.classList.remove("app-booting", "app-locked", "app-ready");
  if (mode === "ready") {
    document.body.classList.add("app-ready");
  } else if (mode === "locked") {
    document.body.classList.add("app-locked");
  } else {
    document.body.classList.add("app-booting");
  }
}

function showLoginRoute(message = "", replace = false) {
  setRoute(ROUTES.login, replace);
  showLoginPage(message);
}

async function showDashboardRoute(replace = false) {
  setRoute(ROUTES.dashboard, replace);
  state.activePage = "homePage";
  state.activeSubpage = "infoListSubpage";
  await renderAll();
  window.scrollTo({ top: 0, left: 0 });
}

async function ensureAuthenticated() {
  if (isLoggedIn()) return true;
  try {
    state.user = await authService.current();
    return isLoggedIn();
  } catch (error) {
    if (isAuthExpired(error)) return false;
    throw error;
  }
}

async function guardRoute(message = "") {
  const route = currentRoute();
  if (route === ROUTES.dashboard) {
    const ok = await ensureAuthenticated();
    if (!ok) {
      showLoginRoute(message, true);
      return false;
    }
    await showDashboardRoute(true);
    return true;
  }
  if (isLoggedIn()) {
    await showDashboardRoute(true);
    return true;
  }
  showLoginRoute(message, true);
  return false;
}

async function navigate(path, options = {}) {
  const target = path === ROUTES.dashboard ? ROUTES.dashboard : ROUTES.login;
  setRoute(target, !!options.replace);
  return guardRoute(options.message || "");
}

function showLoginPage(message = "") {
  state.user = emptyUser();
  setAppMode("locked");
  $("#loginPage").hidden = false;
  renderDemoLoginActions();
  $("#pager").hidden = true;
  $("#openEntryBtn").hidden = true;
  $("#openFixedBtn").hidden = true;
  $("#loginBtn").hidden = true;
  $("#logoutBtn").hidden = true;
  fillLoginForm();
  const loginMessage = $("#loginMessage");
  if (loginMessage) {
    loginMessage.hidden = !message;
    loginMessage.textContent = message;
  }
  setTimeout(() => ($("#loginUser").value ? $("#loginPass") : $("#loginUser"))?.focus(), 0);
}

function hideLoginPage() {
  setAppMode("ready");
  $("#loginPage").hidden = true;
  $("#loginBtn").hidden = true;
  const loginMessage = $("#loginMessage");
  if (loginMessage) {
    loginMessage.hidden = true;
    loginMessage.textContent = "";
  }
}

function setLoginBusy(isBusy, message = "") {
  const button = $("#loginSubmit");
  const loginMessage = $("#loginMessage");
  if (button) {
    button.disabled = isBusy;
    button.textContent = isBusy ? "正在登录..." : "登录";
  }
  if (loginMessage) {
    loginMessage.hidden = !message;
    loginMessage.textContent = message;
  }
}

function openChangePasswordDialog() {
  $("#changePasswordForm").reset();
  $("#changePasswordUser").value = $("#loginUser").value.trim();
  setChangePasswordBusy(false, "");
  $("#changePasswordDialog").showModal();
  setTimeout(() => ($("#changePasswordUser").value ? $("#changePasswordOld") : $("#changePasswordUser"))?.focus(), 0);
}

function setChangePasswordBusy(isBusy, message = "") {
  const button = $("#changePasswordSubmit");
  const messageBox = $("#changePasswordMessage");
  if (button) {
    button.disabled = isBusy;
    button.textContent = isBusy ? "正在修改..." : "确认修改";
  }
  if (messageBox) {
    messageBox.hidden = !message;
    messageBox.textContent = message;
  }
}

async function submitChangePassword() {
  if ($("#changePasswordSubmit")?.disabled) return;
  const username = $("#changePasswordUser").value.trim();
  const oldPassword = $("#changePasswordOld").value;
  const newPassword = $("#changePasswordNew").value;
  const confirmPassword = $("#changePasswordConfirm").value;
  if (!username || !oldPassword || !newPassword || !confirmPassword) {
    setChangePasswordBusy(false, "请完整填写账号、旧密码和新密码。");
    return;
  }
  if (newPassword.length < 6) {
    setChangePasswordBusy(false, "新密码至少需要6位。");
    return;
  }
  if (newPassword !== confirmPassword) {
    setChangePasswordBusy(false, "两次输入的新密码不一致。");
    return;
  }
  setChangePasswordBusy(true, "正在修改密码...");
  try {
    await authService.changePassword(username, oldPassword, newPassword);
    const saved = savedLogin();
    if (saved.username === username) localStorage.removeItem(LOGIN_STORAGE_KEY);
    sessionStorage.setItem(AUTO_LOGIN_SKIP_KEY, "1");
    $("#changePasswordDialog").close();
    $("#loginPass").value = "";
    $("#rememberPassword").checked = false;
    $("#autoLogin").checked = false;
    setLoginBusy(false, "密码已修改，请使用新密码登录。");
  } catch (error) {
    setChangePasswordBusy(false, error.message || "修改失败，请稍后再试。");
  } finally {
    const button = $("#changePasswordSubmit");
    if (button) {
      button.disabled = false;
      button.textContent = "确认修改";
    }
  }
}

async function performLogin() {
  if ($("#loginSubmit")?.disabled) return;
  const username = $("#loginUser").value.trim();
  const password = $("#loginPass").value;
  if (!username || !password) {
    setLoginBusy(false, "请输入账号和密码。");
    return;
  }
  const rememberPassword = $("#rememberPassword").checked;
  const autoLogin = $("#autoLogin").checked;
  setLoginBusy(true, "正在登录...");
  try {
    const user = await authService.login(username, password);
    state.user = user;
    state.loadedData = new Set();
    persistLoginPreference(username, password, rememberPassword, autoLogin);
    sessionStorage.removeItem(AUTO_LOGIN_SKIP_KEY);
    setLoginBusy(true, "登录成功，正在进入系统...");
    await navigate(ROUTES.dashboard);
  } catch (error) {
    state.user = emptyUser();
    setAppMode("locked");
    $("#loginPage").hidden = false;
    $("#pager").hidden = true;
    setLoginBusy(false, `登录失败：${error.message}`);
  } finally {
    const button = $("#loginSubmit");
    if (button) {
      button.disabled = false;
      button.textContent = "登录";
    }
  }
}

function apiUrl(path = "") {
  if (/^(blob:|data:|https?:)/i.test(path || "")) return path;
  if (String(path || "").startsWith("/api/")) return `${API_BASE_URL}${path.slice(4)}`;
  return path || "";
}

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const init = { credentials: "include", ...options, headers };
  if (options.body && !(options.body instanceof FormData)) {
    init.body = JSON.stringify(options.body);
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.blob();
  if (!response.ok) {
    const error = new Error(data?.error || "接口请求失败");
    error.status = response.status;
    throw error;
  }
  return data;
}

function isAuthExpired(error) {
  return error?.status === 401 || /请先登录|登录/.test(error?.message || "");
}

function closeOpenMenus(exceptWrap = null) {
  $$(".more-wrap.open").forEach(item => {
    if (item === exceptWrap) return;
    item.classList.remove("open");
    item.querySelector(".more-menu")?.classList.remove("drop-up", "align-left");
    item.closest(".card")?.classList.remove("menu-open");
  });
}

function positionOpenMenu(wrap) {
  const menu = wrap?.querySelector(".more-menu");
  if (!menu) return;
  menu.classList.remove("drop-up", "align-left");
  menu.style.maxWidth = "";
  const bottomGuard = 76;
  let rect = menu.getBoundingClientRect();
  if (rect.bottom > window.innerHeight - bottomGuard) {
    menu.classList.add("drop-up");
    rect = menu.getBoundingClientRect();
  }
  if (rect.right > window.innerWidth - 10) {
    menu.classList.add("align-left");
    rect = menu.getBoundingClientRect();
  }
  if (rect.left < 10 || rect.right > window.innerWidth - 10) {
    menu.style.maxWidth = "calc(100vw - 24px)";
  }
}

async function handleAuthExpired(message = "登录状态已失效，请重新登录。") {
  state.user = emptyUser();
  state.loadedData = new Set();
  state.activeSubpage = "infoListSubpage";
  closeOpenMenus();
  ["entryDialog", "fixedDialog", "userDialog", "feedbackDialog", "changePasswordDialog"].forEach(id => {
    const dialog = $("#" + id);
    if (dialog?.open) dialog.close();
  });
  await navigate(ROUTES.login, { replace: true, message });
}

function showReadNote(article, text) {
  const note = article?.querySelector(".read-note");
  if (!note) return;
  note.hidden = false;
  note.textContent = text;
}

async function markRecordReadFromCard(article, record) {
  try {
    const before = readState(record);
    const marked = await receiptService.markRead(record);
    if (marked) {
      const deferred = state.statusFilter === "未读" && ["未读", "即将超期", "已超期"].includes(before) && deferUnreadReclassify(record.id);
      showReadNote(article, deferred ? "已自动记录阅读回执，5分钟后更新筛选归类。" : "已自动记录阅读回执。");
      refreshRecordCard(article, record);
      renderStats();
    } else if (receiptService.get(record.id)?.readAt) {
      showReadNote(article, "该信息已记录阅读回执。");
    }
  } catch (error) {
    if (isAuthExpired(error)) {
      await handleAuthExpired("登录状态已失效，请重新登录。");
      return;
    }
    throw error;
  }
}

const settingsService = {
  async get() {
    const data = await apiRequest("/settings");
    const settings = data.settings || clone(defaultSettings);
    return { ...settings, people: normalizePeople(settings.people || defaultSettings.people) };
  },
  async save(settings) {
    const data = await apiRequest("/settings", { method: "PUT", body: settings });
    return data.settings;
  }
};

const authService = {
  async current() {
    const data = await apiRequest("/me");
    if (!data.user) return null;
    return this.withSettings(data.user);
  },
  withSettings(user) {
    const settings = state.settings || defaultSettings;
    const roleConfig = settings.rolePermissions?.[user.role] || {};
    const editableTabKeys = new Set(tabOptions.map(([value]) => value));
    const permissionKeys = new Set(permissionOptions.map(([value]) => value));
    const tabs = new Set((user.allowedTabs || roleConfig.allowedTabs || []).filter(tab => editableTabKeys.has(tab)));
    tabs.add("homePage");
    if (user.role === "admin") tabs.add("settingsPage");
    const permissions = (user.permissions || roleConfig.permissions || []).filter(permission => permissionKeys.has(permission));
    return { ...user, permissions, allowedTabs: Array.from(tabs) };
  },
  async login(username, password) {
    const data = await apiRequest("/login", { method: "POST", body: { username, password } });
    return this.withSettings(data.user);
  },
  async changePassword(username, oldPassword, newPassword) {
    return await apiRequest("/change-password", { method: "POST", body: { username, oldPassword, newPassword } });
  },
  async logout() {
    await apiRequest("/logout", { method: "POST" });
  }
};

function normalizeRecipients(recipients) {
  const people = [...(state.settings.people || [])];
  demoUsers.forEach(user => {
    if (!people.some(person => person.id === user.id)) {
      people.push({ id: user.id, name: user.name, department: user.department || "未设置", team: user.team || "未设置" });
    }
  });
  const ids = (recipients?.length ? recipients : people.map(person => person.id)).map((id, index) => legacyWorkNo(id, index));
  return ids.map(id => people.find(person => person.id === id)).filter(Boolean);
}

function legacyWorkNo(id, index = 0) {
  const legacyMap = {
    "u-receiver": "00000001",
    "p-001": "10000001",
    "p-002": "10000002",
    "p-003": "10000003",
    "p-004": "10000004",
    "p-005": "10000005"
  };
  if (/^\d{8}$/.test(String(id || ""))) return String(id);
  if (legacyMap[id]) return legacyMap[id];
  return String(id || 90000000 + index).slice(0, 64);
}

function normalizePerson(person, index = 0) {
  if (!person) return null;
  return {
    id: legacyWorkNo(person.id, index),
    username: String(person.username || person.id || "").trim(),
    name: String(person.name || "").trim() || "未命名",
    department: String(person.department || "未设置").trim() || "未设置",
    team: String(person.team || person.department || "未设置").trim() || "未设置",
    functionCategory: String(person.functionCategory || "维修").trim() || "维修"
  };
}

function normalizePeople(people) {
  const seen = new Set();
  return (people || []).map(normalizePerson).filter(person => {
    if (!person || seen.has(person.id)) return false;
    seen.add(person.id);
    return true;
  });
}

function parsePeopleLines(text) {
  let skipped = 0;
  const people = String(text || "").split(/\n+/).map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split(/[,，\t]/).map(part => part.trim());
    if (parts.length >= 4 && !/^\d{8}$/.test(parts[0]) && /^\d{8}$/.test(parts[1])) parts.shift();
    const [id, name, team] = parts;
    if (!/^\d{8}$/.test(id || "") || !name || !team) {
      skipped++;
      return null;
    }
    return { id, name, department: "未设置", team };
  }).filter(Boolean);
  return { people: normalizePeople(people), skipped };
}

function hasAttachments(record) {
  return Array.isArray(record.attachments) && record.attachments.length > 0;
}

function demoAttachment(ownerId) {
  return { id: "demo-att-001", name: "安全生产月宣贯材料.txt", type: "text/plain", size: 180, storage: "demo", url: "data:text/plain;charset=utf-8,%E5%AE%89%E5%85%A8%E7%94%9F%E4%BA%A7%E6%9C%88%E5%AE%A3%E8%B4%AF%E6%9D%90%E6%96%99", ownerType: "record", ownerId };
}

function enrichRecord(record, index = 0) {
  const now = new Date();
  const baseDate = parseDate(record.date) || now;
  const overdueDays = Number(state.settings?.overdueDays || 3);
  const deadline = record.deadline || new Date(baseDate.getTime() + 1000 * 60 * 60 * 24 * Math.max(1, overdueDays)).toISOString().slice(0, 16);
  const publisherId = record.publisherId || "u-publisher";
  return {
    id: record.id || `rec-${Date.now()}-${index}`,
    date: record.date || formatDisplayDate(now),
    category: record.category || "规定要求",
    title: record.title || "未命名信息",
    original: record.original || "",
    publisher: record.publisher || "发布者",
    sourceSet: record.sourceSet || "",
    attachments: Array.isArray(record.attachments) ? record.attachments : [],
    favorite: record.favorite === true,
    importedRead: record.importedRead === true || record.importedReadComplete === true,
    recipients: Array.isArray(record.recipients) && record.recipients.length ? record.recipients.map((item, itemIndex) => typeof item === "object" ? { id: item.id, name: item.name, department: item.department || "未设置", team: item.team || "未设置" } : normalizeRecipients([item])[0]).filter(Boolean) : normalizeRecipients([]),
    deadline,
    priority: record.priority || (index % 7 === 0 ? "重要" : "普通"),
    publishStatus: record.publishStatus || "已发布",
    publisherId,
    pinned: false,
    remindEnabled: record.remindEnabled !== false,
    allowWithdraw: record.allowWithdraw !== false,
    allowEdit: record.allowEdit !== false,
    createdBy: record.createdBy || publisherId,
    updatedBy: record.updatedBy || publisherId,
    createdAt: record.createdAt || baseDate.toISOString(),
    updatedAt: record.updatedAt || baseDate.toISOString()
  };
}

const recordService = {
  async list() {
    const data = await apiRequest("/records");
    if (data.settings) state.settings = { ...data.settings, people: normalizePeople(data.settings.people || []) };
    state.receipts = data.receipts || [];
    return (data.records || []).map(enrichRecord);
  },
  async create(payload) {
    const data = await apiRequest("/records", { method: "POST", body: payload });
    return enrichRecord(data.record);
  },
  async update(id, payload) {
    const data = await apiRequest(`/records/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
    return enrichRecord(data.record);
  },
  async remove(id) {
    await apiRequest(`/records/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async void(id) {
    const data = await apiRequest(`/records/${encodeURIComponent(id)}/void`, { method: "POST" });
    return data.record ? enrichRecord(data.record) : null;
  },
  async restore(id) {
    const data = await apiRequest(`/records/${encodeURIComponent(id)}/restore`, { method: "POST" });
    return data.record ? enrichRecord(data.record) : null;
  },
  async importRows(rows) {
    return await apiRequest("/records/import", { method: "POST", body: { rows } });
  },
};

const receiptService = {
  list() {
    return state.receipts || [];
  },
  saveAll(receipts) {
    state.receipts = receipts;
  },
  get(recordId, userId = state.user.id) {
    return this.list().find(item => item.recordId === recordId && item.userId === userId);
  },
  async markRead(record) {
    if (!state.user.id) return false;
    const found = this.get(record.id);
    if (found?.readAt) return false;
    const data = await apiRequest(`/records/${encodeURIComponent(record.id)}/read`, { method: "POST" });
    if (!data.receipt) return false;
    state.receipts = state.receipts.filter(item => !(item.recordId === record.id && item.userId === state.user.id));
    state.receipts.push(data.receipt);
    return true;
  },
  remind(record, userIds) {
    return apiRequest(`/records/${encodeURIComponent(record.id)}/remind`, { method: "POST", body: { userIds } }).catch(() => null);
  },
  async updateStatus(recordId, userId, status) {
    const data = await apiRequest(`/records/${encodeURIComponent(recordId)}/receipts/${encodeURIComponent(userId)}`, { method: "PUT", body: { status } });
    state.receipts = state.receipts.filter(item => item.recordId !== recordId).concat(data.receipts || []);
    return data.receipts || [];
  },
  async updateStatusBatch(recordId, userIds, status) {
    const data = await apiRequest(`/records/${encodeURIComponent(recordId)}/receipts`, { method: "PUT", body: { userIds, status } });
    state.receipts = state.receipts.filter(item => item.recordId !== recordId).concat(data.receipts || []);
    return data.receipts || [];
  },
  removeRecord(recordId) {
    state.receipts = this.list().filter(item => item.recordId !== recordId);
  }
};

const fixedProjectService = {
  async list() {
    try {
      const data = await apiRequest("/fixed-projects");
      return data.projects || [];
    } catch {
      return [];
    }
  },
  async create(payload) {
    const data = await apiRequest("/fixed-projects", { method: "POST", body: payload });
    return data.project;
  },
  async update(id, payload) {
    const data = await apiRequest(`/fixed-projects/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
    return data.project;
  },
  async remove(id) {
    await apiRequest(`/fixed-projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
};

const favoriteService = {
  isFavorite(recordId) {
    return !!state.records.find(record => record.id === recordId)?.favorite;
  },
  async toggle(recordId) {
    const current = this.isFavorite(recordId);
    const data = await apiRequest(`/records/${encodeURIComponent(recordId)}/favorite`, { method: current ? "DELETE" : "POST" });
    const record = state.records.find(item => item.id === recordId);
    if (record) record.favorite = !!data.favorite;
  }
};

const auditService = {
  add() {}
};

const userService = {
  async list() {
    if (state.user.role !== "admin") return [];
    const data = await apiRequest("/admin/users");
    return data.users || [];
  },
  async create(payload) {
    const data = await apiRequest("/admin/users", { method: "POST", body: payload });
    return data.user;
  },
  async update(id, payload) {
    const data = await apiRequest(`/admin/users/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
    return data.user;
  },
  async resetPassword(id, password) {
    return await apiRequest(`/admin/users/${encodeURIComponent(id)}/reset-password`, { method: "POST", body: { password } });
  },
  async remove(id) {
    return await apiRequest(`/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async batchUpdate(userIds, updates) {
    return await apiRequest("/admin/users/batch", { method: "PUT", body: { userIds, updates } });
  },
  async importRows(rows) {
    return await apiRequest("/admin/users/import", { method: "POST", body: { rows } });
  }
};

const maintenanceService = {
  taskListQuery(cursor = "") {
    const scope = state.maintenanceTab === "execute" ? "execute" : "dispatch";
    const query = new URLSearchParams({ scope, view: "summary", limit: "100" });
    if (cursor) query.set("cursor", cursor);
    if (scope !== "execute") {
      if (state.maintenanceStartDate) query.set("dateFrom", state.maintenanceStartDate);
      if (state.maintenanceEndDate) query.set("dateTo", state.maintenanceEndDate);
      if (state.maintenanceFlightSearch.trim()) query.set("search", state.maintenanceFlightSearch.trim());
      for (const opportunity of state.maintenanceOpportunityFilters || []) query.append("opportunity", opportunity);
    }
    return query;
  },
  async load() {
    if (!canView("maintenancePage")) {
      state.maintenanceFlights = [];
      state.maintenanceNextCursor = "";
      state.maintenanceRules = [];
      state.maintenanceStats = null;
      return;
    }
    state.maintenanceStats = null;
    if (state.maintenanceTab === "hours") {
      state.maintenanceFlights = [];
      state.maintenanceNextCursor = "";
      state.maintenancePersonalStats = null;
      const rulesData = await apiRequest("/maintenance/rules");
      state.maintenanceRules = rulesData.rules || [];
      return;
    }
    if (state.maintenanceTab === "data") {
      state.maintenanceFlights = [];
      state.maintenanceRules = [];
      const personalQuery = new URLSearchParams({
        month: state.maintenanceMonth || "",
        range: state.maintenanceDataRange || "half"
      }).toString();
      state.maintenancePersonalStats = await apiRequest(`/maintenance/stats/personal?${personalQuery}`);
      return;
    }
    const query = this.taskListQuery();
    const tasksData = await apiRequest(`/maintenance/flights?${query.toString()}`);
    state.maintenanceFlights = tasksData.flights || [];
    state.maintenanceNextCursor = tasksData.nextCursor || "";
    state.maintenanceSyncVersion = Number(tasksData.version || state.maintenanceSyncVersion || 0);
    state.maintenanceRules = [];
  },
  async loadMore() {
    if (!state.maintenanceNextCursor || !["dispatch", "execute"].includes(state.maintenanceTab)) return;
    const query = this.taskListQuery(state.maintenanceNextCursor);
    const tasksData = await apiRequest(`/maintenance/flights?${query.toString()}`);
    const existing = new Set(state.maintenanceFlights.map(item => item.id));
    state.maintenanceFlights.push(...(tasksData.flights || []).filter(item => !existing.has(item.id)));
    state.maintenanceNextCursor = tasksData.nextCursor || "";
    state.maintenanceSyncVersion = Number(tasksData.version || state.maintenanceSyncVersion || 0);
  },
  async importRows(rows) {
    return await apiRequest("/maintenance/flights/import", { method: "POST", body: { rows } });
  },
  async createFlight(payload) {
    return await apiRequest("/maintenance/flights", { method: "POST", body: payload });
  },
  async updateFlight(id, payload) {
    return await apiRequest(`/maintenance/flights/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
  },
  async getFlight(id, scope = "dispatch") {
    const data = await apiRequest(`/maintenance/flights/${encodeURIComponent(id)}?scope=${encodeURIComponent(scope)}`);
    return data.flight || null;
  },
  async removeFlight(id, reason = "") {
    return await apiRequest(`/maintenance/flights/${encodeURIComponent(id)}`, { method: "DELETE", body: { reason } });
  },
  async createSubtask(flightId, payload) {
    return await apiRequest(`/maintenance/flights/${encodeURIComponent(flightId)}/subtasks`, { method: "POST", body: payload });
  },
  async updateSubtask(id, payload) {
    return await apiRequest(`/maintenance/subtasks/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
  },
  async removeSubtask(id, reason = "") {
    return await apiRequest(`/maintenance/subtasks/${encodeURIComponent(id)}`, { method: "DELETE", body: { reason } });
  },
  async dispatch(ownerType, ownerId, assignments) {
    const path = ownerType === "flight" ? "flights" : "subtasks";
    return await apiRequest(`/maintenance/${path}/${encodeURIComponent(ownerId)}/dispatch`, { method: "POST", body: { assignments } });
  },
  async getReview(flightId) {
    return await apiRequest(`/maintenance/flights/${encodeURIComponent(flightId)}/review`);
  },
  async saveReview(flightId, mode, tasks, reason = "", newSubtasks = []) {
    return await apiRequest(`/maintenance/flights/${encodeURIComponent(flightId)}/review`, { method: "PUT", body: { mode, tasks, reason, newSubtasks } });
  },
  async getReports(flightId) {
    return await apiRequest(`/maintenance/flights/${encodeURIComponent(flightId)}/reports`);
  },
  async getPersonalDetails(params = {}) {
    return await apiRequest(`/maintenance/stats/personal/details?${new URLSearchParams(params).toString()}`);
  },
  async submitReport(flightId, type, payload = {}) {
    return await apiRequest(`/maintenance/flights/${encodeURIComponent(flightId)}/reports/${encodeURIComponent(type)}`, { method: "PUT", body: payload });
  },
  async saveNonroutineDraft(flightId, payload = {}) {
    return await apiRequest(`/maintenance/flights/${encodeURIComponent(flightId)}/reports/nonroutine/draft`, { method: "PUT", body: payload });
  },
  async deleteNonroutineDraft(flightId, version) {
    return await apiRequest(`/maintenance/flights/${encodeURIComponent(flightId)}/reports/nonroutine/draft`, { method: "DELETE", body: { version } });
  },
  async saveRoutineDraft(flightId, payload = {}) {
    return await apiRequest(`/maintenance/flights/${encodeURIComponent(flightId)}/reports/routine/draft`, { method: "PUT", body: payload });
  },
  async finalizeReports(flightId, payload = {}) {
    return await apiRequest(`/maintenance/flights/${encodeURIComponent(flightId)}/report-confirmation`, { method: "POST", body: payload });
  },
  async saveReportConfirmation(flightId, payload = {}) {
    return await apiRequest(`/maintenance/flights/${encodeURIComponent(flightId)}/report-confirmation`, { method: "POST", body: { ...payload, mode: "save" } });
  },
  async version() {
    return await apiRequest("/maintenance/version");
  },
  async assignmentAction(id, action, payload = {}) {
    return await apiRequest(`/maintenance/assignments/${encodeURIComponent(id)}/${action}`, { method: "POST", body: payload });
  },
  async saveRules(rules) {
    return await apiRequest("/maintenance/rules", { method: "PUT", body: { rules } });
  },
  async adjustHour(id, adjustedHours) {
    return await apiRequest(`/maintenance/hours/${encodeURIComponent(id)}`, { method: "PUT", body: { adjustedHours } });
  },
  async confirmHour(id) {
    return await apiRequest(`/maintenance/hours/${encodeURIComponent(id)}/confirm`, { method: "POST" });
  },
  async confirmSortie(id) {
    return await apiRequest(`/maintenance/sorties/${encodeURIComponent(id)}/confirm`, { method: "POST" });
  },
  exportUrl() {
    const query = new URLSearchParams({ month: state.maintenanceMonth || "", search: state.maintenanceSearch || "" }).toString();
    return `${API_BASE_URL}/maintenance/export.xlsx?${query}`;
  }
};

async function hydrateMaintenanceFlight(flightId) {
  const scope = state.maintenanceTab === "execute" || state.maintenanceTab === "data" ? "execute" : "dispatch";
  const flight = await maintenanceService.getFlight(flightId, scope);
  if (!flight) return null;
  const index = state.maintenanceFlights.findIndex(item => item.id === flightId);
  if (index >= 0) state.maintenanceFlights.splice(index, 1, flight);
  else state.maintenanceFlights.push(flight);
  return flight;
}

const statsService = {
  rows(records, receipts) {
    return records.flatMap(record => (record.recipients || []).map(person => {
      const receipt = receipts.find(item => item.recordId === record.id && item.userId === person.id);
      const status = this.rowStatus(record, receipt);
      return { record, person, receipt, status };
    }));
  },
  rowStatus(record, receipt) {
    if (receipt?.readAt) return receipt.isOverdue ? "超期已读" : "已读";
    return isPast(record.deadline) ? "超期未读" : "未读";
  },
  blankStat(base = {}) {
    return { ...base, total: 0, read: 0, unread: 0, overdueUnread: 0, overdueRead: 0, totalUnread: 0, readRate: 0, overdueRate: 0 };
  },
  fillStat(stat, row) {
    stat.total++;
    if (row.status === "已读") stat.read++;
    if (row.status === "未读") stat.unread++;
    if (row.status === "超期未读") stat.overdueUnread++;
    if (row.status === "超期已读") stat.overdueRead++;
    return stat;
  },
  finalize(stat) {
    stat.totalUnread = stat.unread + stat.overdueUnread + stat.overdueRead;
    stat.readRate = stat.total ? Math.round((stat.read + stat.overdueRead) / stat.total * 100) : 0;
    stat.overdueRate = stat.total ? Math.round((stat.overdueUnread + stat.overdueRead) / stat.total * 100) : 0;
    return stat;
  },
  statsFromRows(rows, base = {}) {
    return this.finalize(rows.reduce((acc, row) => this.fillStat(acc, row), this.blankStat(base)));
  },
  overviewStats(records, receipts) {
    return this.statsFromRows(this.rows(records, receipts), { publishCount: records.length });
  },
  personStats(records, receipts) {
    const map = new Map();
    this.rows(records, receipts).forEach(row => {
      const key = row.person.id || row.person.name;
      if (!map.has(key)) map.set(key, this.blankStat({ id: row.person.id || "", name: row.person.name || "未知", team: row.person.team || "未设置" }));
      this.fillStat(map.get(key), row);
    });
    return Array.from(map.values()).map(stat => this.finalize(stat)).sort(compareAssessmentStats);
  },
  teamStats(records, receipts, people = []) {
    const map = new Map();
    this.rows(records, receipts).forEach(row => {
      const team = row.person.team || "未设置";
      if (!map.has(team)) map.set(team, this.blankStat({ team, people: new Set() }));
      const stat = map.get(team);
      stat.people.add(row.person.id || row.person.name);
      this.fillStat(stat, row);
    });
    return Array.from(map.values()).map(stat => {
      const knownPeople = people.filter(person => (person.team || "未设置") === stat.team).length;
      return this.finalize({ ...stat, peopleCount: Math.max(stat.people.size, knownPeople), people: undefined });
    }).sort(compareAssessmentStats);
  },
  recordsInDateRange(records, options = {}) {
    const start = options.startDate ? parseDate(options.startDate) : null;
    const endBase = options.endDate ? parseDate(options.endDate) : null;
    const end = endBase ? new Date(endBase.getFullYear(), endBase.getMonth(), endBase.getDate(), 23, 59, 59, 999) : null;
    return records.filter(record => {
      if (record.publishStatus === "作废") return false;
      const date = parseDate(record.date);
      if (!date) return false;
      return (!start || date >= start) && (!end || date <= end);
    });
  },
  filtered(records, receipts, options = {}) {
    const search = String(options.search || "").trim().toLowerCase();
    const team = options.team || "全部";
    const scopedRecords = this.recordsInDateRange(records, options);
    const allRows = this.rows(scopedRecords, receipts);
    const filteredRows = allRows.filter(row => {
      const text = [row.person.id, row.person.name, row.person.team].join(" ").toLowerCase();
      return (team === "全部" || row.person.team === team) && (!search || text.includes(search));
    });
    const filteredRecordIds = new Set(filteredRows.map(row => row.record.id));
    const personStats = this.personStats(scopedRecords, receipts).filter(row => {
      const text = [row.id, row.name, row.team].join(" ").toLowerCase();
      return (team === "全部" || row.team === team) && (!search || text.includes(search));
    });
    const teamMap = new Map();
    filteredRows.forEach(row => {
      const teamName = row.person.team || "未设置";
      if (!teamMap.has(teamName)) teamMap.set(teamName, this.blankStat({ team: teamName, people: new Set() }));
      const stat = teamMap.get(teamName);
      stat.people.add(row.person.id || row.person.name);
      this.fillStat(stat, row);
    });
    const teamStats = Array.from(teamMap.values()).map(stat => this.finalize({ ...stat, peopleCount: stat.people.size, people: undefined })).sort(compareAssessmentStats);
    return { overview: this.statsFromRows(filteredRows, { publishCount: filteredRecordIds.size }), teams: teamStats, people: personStats, records: scopedRecords };
  },
  exportStatsCsv(records, receipts, options = {}) {
    const data = this.filtered(records, receipts, options);
    const line = values => values.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",");
    const filterText = statsFilterText(options);
    const lines = [
      line(["筛选条件", filterText]),
      "",
      line(["整体概览"]),
      line(["发布数", "接收人次", "已读", "未读", "超期未读", "超期已读", "已读率", "超期率"]),
      line([data.overview.publishCount, data.overview.total, data.overview.read, data.overview.unread, data.overview.overdueUnread, data.overview.overdueRead, `${data.overview.readRate}%`, `${data.overview.overdueRate}%`]),
      "",
      line(["班组统计"]),
      line(["班组", "人数", "应读", "已读", "总未读", "未读", "超期未读", "超期已读", "已读率", "超期率"]),
      ...data.teams.map(row => line([row.team, row.peopleCount, row.total, row.read, row.totalUnread, row.unread, row.overdueUnread, row.overdueRead, `${row.readRate}%`, `${row.overdueRate}%`])),
      "",
      line(["个人统计"]),
      line(["姓名", "班组", "应读", "已读", "总未读", "未读", "超期未读", "超期已读", "已读率", "超期率"]),
      ...data.people.map(row => line([row.name, row.team, row.total, row.read, row.totalUnread, row.unread, row.overdueUnread, row.overdueRead, `${row.readRate}%`, `${row.overdueRate}%`]))
    ];
    return lines.join("\n");
  },
  exportTables(records, receipts, options = {}) {
    const data = this.filtered(records, receipts, options);
    const filterText = statsFilterText(options);
    return [
      {
        name: "整体概览",
        rows: [
          ["筛选条件", filterText],
          [],
          ["发布数", "接收人次", "已读", "未读", "超期未读", "超期已读", "已读率", "超期率"],
          [data.overview.publishCount, data.overview.total, data.overview.read, data.overview.unread, data.overview.overdueUnread, data.overview.overdueRead, `${data.overview.readRate}%`, `${data.overview.overdueRate}%`]
        ]
      },
      {
        name: "班组统计",
        rows: [
          ["筛选条件", filterText],
          [],
          ["班组", "人数", "应读", "已读", "总未读", "未读", "超期未读", "超期已读", "已读率", "超期率"],
          ...data.teams.map(row => [row.team, row.peopleCount, row.total, row.read, row.totalUnread, row.unread, row.overdueUnread, row.overdueRead, `${row.readRate}%`, `${row.overdueRate}%`])
        ]
      },
      {
        name: "个人统计",
        rows: [
          ["筛选条件", filterText],
          [],
          ["姓名", "班组", "应读", "已读", "总未读", "未读", "超期未读", "超期已读", "已读率", "超期率"],
          ...data.people.map(row => [row.name, row.team, row.total, row.read, row.totalUnread, row.unread, row.overdueUnread, row.overdueRead, `${row.readRate}%`, `${row.overdueRate}%`])
        ]
      }
    ];
  },
  summary(records, receipts) {
    const recipientRows = this.rows(records, receipts);
    const readCount = recipientRows.filter(row => row.status === "已读" || row.status === "超期已读").length;
    const overdueCount = recipientRows.filter(row => row.status === "超期未读").length;
    return {
      publishCount: records.length,
      recipientCount: recipientRows.length,
      readCount,
      unreadCount: recipientRows.length - readCount,
      overdueCount,
      readRate: recipientRows.length ? Math.round(readCount / recipientRows.length * 100) : 0,
      byDepartment: groupCount(recipientRows, row => row.person.department || "未设置"),
      byPublisher: groupCount(records, row => row.publisher || "未知"),
      byCategory: groupCount(records, row => row.category || "未分类")
    };
  }
};

function compareAssessmentStats(a, b) {
  const aRisk = (a.overdueUnread || 0) + (a.overdueRead || 0);
  const bRisk = (b.overdueUnread || 0) + (b.overdueRead || 0);
  return bRisk - aRisk || (b.total || 0) - (a.total || 0) || String(a.name || a.team).localeCompare(String(b.name || b.team), "zh-Hans-CN");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function sanitizeRichHtml(value) {
  const allowedTags = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "SPAN", "A", "DIV"]);
  const allowedStyles = new Set(["color", "background-color"]);
  const template = document.createElement("template");
  template.innerHTML = String(value || "");
  const cleanNode = node => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
    const tag = node.tagName.toUpperCase();
    const fragment = document.createDocumentFragment();
    if (!allowedTags.has(tag)) {
      Array.from(node.childNodes).forEach(child => fragment.appendChild(cleanNode(child)));
      return fragment;
    }
    const element = document.createElement(tag.toLowerCase());
    if (tag === "A") {
      const href = node.getAttribute("href") || "";
      if (/^(https?:|mailto:|\/(?!\/)|#)/i.test(href)) {
        element.setAttribute("href", href);
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
      }
    }
    const safeStyles = [];
    String(node.getAttribute("style") || "").split(";").forEach(rule => {
      const [name, rawValue] = rule.split(":").map(part => part?.trim());
      if (!allowedStyles.has(String(name || "").toLowerCase())) return;
      if (/^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]+)$/i.test(rawValue || "")) safeStyles.push(`${name}:${rawValue}`);
    });
    if (safeStyles.length) element.setAttribute("style", safeStyles.join(";"));
    Array.from(node.childNodes).forEach(child => element.appendChild(cleanNode(child)));
    return element;
  };
  const output = document.createElement("div");
  Array.from(template.content.childNodes).forEach(child => output.appendChild(cleanNode(child)));
  return output.innerHTML;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const normalized = String(value).replace("T", " ").replace(/[年月/.]/g, "-").replace(/日/g, "").trim();
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), match[4] === undefined ? 12 : Number(match[4]), Number(match[5] || 0));
}

function recordSortValue(record) {
  return parseDate(record?.date)?.getTime()
    || parseDate(record?.updatedAt)?.getTime()
    || parseDate(record?.createdAt)?.getTime()
    || 0;
}

function compareRecordsDesc(a, b) {
  const byDate = recordSortValue(b) - recordSortValue(a);
  if (byDate) return byDate;
  const byUpdated = (parseDate(b?.updatedAt)?.getTime() || 0) - (parseDate(a?.updatedAt)?.getTime() || 0);
  if (byUpdated) return byUpdated;
  return String(b?.id || "").localeCompare(String(a?.id || ""));
}

function calculateDeadline(value) {
  const start = parseDate(value) || new Date();
  const days = Number(state.settings?.overdueDays || 3);
  return new Date(start.getTime() + Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function formatDisplayDate(value) {
  const date = parseDate(value) || new Date(value || Date.now());
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDisplayDateOnly(value) {
  const date = parseDate(value) || new Date(value || Date.now());
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function inputDateValue(value = new Date()) {
  const date = parseDate(value) || new Date(value || Date.now());
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function maintenanceFlightMonthDay(value) {
  const match = String(value || "").trim().match(/^\d{4}[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}.${match[2].padStart(2, "0")}`;
}

function monthLabel(value) {
  const date = parseDate(value);
  return date ? String(date.getMonth() + 1).padStart(2, "0") + "月" : "";
}

function isPast(value) {
  const date = parseDate(value);
  return !!date && date.getTime() < Date.now();
}

function isNearDeadline(record) {
  const deadline = parseDate(record.deadline);
  if (!deadline || isPast(deadline)) return false;
  const limit = Number(state.settings.reminderDays || 1) * 24 * 60 * 60 * 1000;
  return deadline.getTime() - Date.now() <= limit;
}

function inDateRange(value) {
  return state.activeMonth === "全部" || monthLabel(value) === state.activeMonth;
}

function has(permission) {
  return state.user.permissions?.includes(permission);
}

function isRecordOwner(record) {
  if (!record || !state.user.id) return false;
  const publisherName = (record.publisher || "").trim();
  if (publisherName === state.user.name && publisherName !== "发布者") return true;
  if (publisherName && publisherName !== state.user.name) return false;
  return record.publisherId === state.user.id || record.createdBy === state.user.id;
}

function canEditRecord(record) {
  return has("edit") && canViewRecord(record);
}

function canDeleteRecord(record) {
  return has("delete") && canViewRecord(record);
}

function canVoidRecord(record) {
  if (!record || record.publishStatus === "作废") return false;
  if (state.user.role === "admin") return true;
  return state.user.role === "publisher" && isRecordOwner(record);
}

function canRestoreRecord(record) {
  return state.user.role === "admin" && record?.publishStatus === "作废";
}

function canManageFeedbackRecord(record) {
  if (state.user.role === "admin") return true;
  return state.user.role === "publisher" && isRecordOwner(record);
}

function canViewRecord(record) {
  if (!state.user.id) return false;
  if (record?.publishStatus === "作废") return state.user.role === "admin";
  if (state.user.role === "admin") return true;
  if (state.user.role === "publisher") return isRecipient(record) || isRecordOwner(record);
  return isRecipient(record);
}

function canTrackPersonalRead(record) {
  return !!state.user.id && record?.publishStatus !== "作废" && isRecipient(record);
}

function canFilterReadState(record) {
  return canTrackPersonalRead(record);
}

function canView(tab) {
  if (!isLoggedIn()) return false;
  if (tab === "homePage") return true;
  if (tab === "settingsPage") return state.user.role === "admin";
  return state.user.allowedTabs?.includes(tab);
}

function canOpenSettings() {
  return state.user.role === "admin";
}

function canViewSubpage(subpage) {
  if (!isLoggedIn()) return false;
  if (subpage === "infoListSubpage") return true;
  if (subpage === "statsSubpage") return state.user.role === "publisher" || state.user.role === "admin";
  return false;
}

function groupCount(items, selector) {
  return items.reduce((acc, item) => {
    const key = selector(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function highlight(value, term) {
  const safe = escapeHtml(value);
  const words = term.split(/\s+/).filter(Boolean).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return words.length ? safe.replace(new RegExp("(" + words.join("|") + ")", "gi"), "<mark>$1</mark>") : safe;
}

function isRecipient(record, userId = state.user.id) {
  return (record.recipients || []).some(person => person.id === userId);
}

function readState(record) {
  const receipt = receiptService.get(record.id);
  if (record.publishStatus === "作废") return "作废";
  if (record.publishStatus === "已撤回") return "已撤回";
  if (record.publishStatus === "已归档") return "已归档";
  if (record.publishStatus === "已完成") return "已完成";
  if (receipt?.readAt) return receipt.isOverdue ? "超期已读" : "已读";
  if (isPast(record.deadline)) return "已超期";
  if (isNearDeadline(record)) return "即将超期";
  return "未读";
}

function recordMetrics(record) {
  const rows = (record.recipients || []).map(person => ({ person, receipt: receiptService.list().find(item => item.recordId === record.id && item.userId === person.id) }));
  const read = rows.filter(row => row.receipt?.readAt).length;
  const overdue = rows.filter(row => !row.receipt?.readAt && isPast(record.deadline)).length;
  return { total: rows.length, read, unread: rows.length - read, overdue, rate: rows.length ? Math.round(read / rows.length * 100) : 0 };
}

function statusTags(record) {
  const tags = [];
  if (canTrackPersonalRead(record)) tags.push(readState(record));
  if (record.publishStatus && !["已发布"].includes(record.publishStatus)) tags.push(record.publishStatus);
  return Array.from(new Set(tags)).map(tag => `<span class="status-tag ${tagClass(tag)}">${escapeHtml(tag)}</span>`).join("");
}

function tagClass(tag) {
  if (["未读"].includes(tag)) return "unread";
  if (["已超期", "超期已读", "已撤回", "作废"].includes(tag)) return "overdue";
  if (tag === "紧急") return "urgent";
  if (tag === "重要") return "important";
  if (["已读", "已完成", "已归档"].includes(tag)) return "done";
  return "";
}

function categoryTag(record) {
  const category = record.category || "未分类";
  return `<span class="tag cat-${escapeHtml(category.slice(0, 2))}">${escapeHtml(category)}</span>`;
}

function categoryColor(record) {
  const category = String(record.category || "其他").trim() || "其他";
  return categoryColorMap().get(category) || fallbackCategoryColor(category);
}

function categoryColorMap() {
  const fixed = new Map([
    ["质量问题", "#D97706"],
    ["规定要求", "#7C3AED"],
    ["周例会", "#2563EB"],
    ["日例会", "#059669"],
    ["其他", "#64748B"]
  ]);
  const palette = ["#0891B2", "#0F766E", "#4F46E5", "#9333EA", "#C2410C", "#BE123C", "#0E7490", "#15803D", "#A16207", "#B45309", "#6D28D9", "#0369A1"];
  const categories = Array.from(new Set((state.settings?.categories || []).map(item => String(item || "").trim()).filter(Boolean)));
  const used = new Set(fixed.values());
  const colors = new Map(fixed);
  let index = 0;
  for (const category of categories) {
    if (colors.has(category)) continue;
    while (index < palette.length && used.has(palette[index])) index++;
    const color = index < palette.length ? palette[index] : fallbackCategoryColor(category);
    colors.set(category, color);
    used.add(color);
    index++;
  }
  return colors;
}

function fallbackCategoryColor(category) {
  const palette = ["#0891B2", "#0F766E", "#4F46E5", "#9333EA", "#C2410C", "#BE123C", "#0E7490", "#15803D", "#A16207", "#B45309", "#6D28D9", "#0369A1"];
  let hash = 0;
  for (const char of category || "默认") hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function priorityTag(record) {
  if (!["重要", "紧急"].includes(record.priority)) return "";
  return `<span class="status-tag ${tagClass(record.priority)} priority-title-tag">${escapeHtml(record.priority)}</span>`;
}

function titleMeta(record) {
  const parts = [];
  if (favoriteService.isFavorite(record.id)) parts.push('<span class="badge favorite-badge" title="已收藏">★</span>');
  if (hasAttachments(record)) parts.push('<span class="badge attachment-badge" title="含附件" aria-label="含附件">📎</span>');
  return parts.length ? `<span class="title-meta">${parts.join("")}</span>` : "";
}

function canManageAttachmentUi(owner, ownerType) {
  if (!isLoggedIn()) return false;
  if (ownerType === "record") {
    if (owner?.publishStatus === "作废") return state.user.role === "admin";
    if (state.user.role === "admin") return true;
    return canEditRecord(owner) || (has("create") && isRecordOwner(owner));
  }
  if (ownerType === "fixedProject") return has("fixedManage");
  return false;
}

function renderAttachments(owner, ownerType) {
  const files = Array.isArray(owner.attachments) ? owner.attachments.filter(Boolean) : [];
  if (!files.length) return "";
  const canRemove = canManageAttachmentUi(owner, ownerType);
  return `<div class="attachments"><strong>附件：</strong>${files.map((file, index) => {
    const id = file.id || file.attachmentId || `${owner.id}-attachment-${index}`;
    const name = file.name || `附件${index + 1}`;
    return `<a href="${escapeHtml(apiUrl(file.url || file.dataUrl || "#"))}" target="_blank" data-attachment="${escapeHtml(id)}" data-owner-type="${ownerType}" data-owner-id="${escapeHtml(owner.id)}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</a>` +
      (canRemove ? `<button class="remove-attach" type="button" data-remove-attachment="${escapeHtml(id)}" data-owner-type="${ownerType}" data-owner-id="${escapeHtml(owner.id)}">移除</button>` : "");
  }).join("")}</div>`;
}

function renderExistingRecordAttachments(record) {
  const container = $("#recordExistingAttachments");
  if (!container) return;
  const files = Array.isArray(record?.attachments) ? record.attachments.filter(Boolean) : [];
  container.hidden = !files.length;
  container.innerHTML = files.length ? `<div class="existing-attachment-title">已上传附件</div>${renderAttachments(record, "record")}` : "";
}

function removeAttachmentFromState(attachmentId, ownerType, ownerId) {
  const list = ownerType === "fixedProject" ? state.fixedProjects : state.records;
  const owner = list.find(item => item.id === ownerId);
  if (!owner) return null;
  owner.attachments = (owner.attachments || []).filter(file => (file.id || file.attachmentId) !== attachmentId);
  return owner;
}

function renderShell() {
  if (!isLoggedIn()) {
    showLoginPage();
    $("#pager").hidden = true;
    return;
  }
  hideLoginPage();
  $("#loginBtn").hidden = true;
  $("#logoutBtn").hidden = false;
  $("#openEntryBtn").hidden = !has("create");
  $("#openFixedBtn").hidden = !has("fixedManage");
  if (!canView(state.activePage)) state.activePage = "homePage";
  $$(".subtab").forEach(tab => { tab.hidden = !canViewSubpage(tab.dataset.subpage); });
  $$(".top-tab").forEach(tab => {
    tab.hidden = !canView(tab.dataset.page);
    tab.classList.toggle("active", tab.dataset.page === state.activePage);
  });
  if (!canViewSubpage(state.activeSubpage)) state.activeSubpage = "infoListSubpage";
  $$(".subtab").forEach(tab => tab.classList.toggle("active", tab.dataset.subpage === state.activeSubpage));
  $$(".page").forEach(section => section.classList.toggle("active", section.id === state.activePage));
  $$(".subpage").forEach(section => section.classList.toggle("active", section.id === state.activeSubpage));
  $("#pager").hidden = state.activePage !== "infoPage" || state.activeSubpage !== "infoListSubpage";
  $("#infoFilters").hidden = state.activeSubpage !== "infoListSubpage";
  $("#resultStatus").hidden = state.activeSubpage !== "infoListSubpage";
  closeSubpageMenu();
}

function isDemoMode() {
  return location.protocol === "file:" || ["127.0.0.1", "localhost", ""].includes(location.hostname);
}

function renderDemoLoginActions() {
  const actions = $("#demoLoginActions");
  if (actions) actions.hidden = !isDemoMode();
}

function closeSubpageMenu() {
  const menu = $("#subpageMenu");
  const button = $("#subpageMenuBtn");
  if (!menu || !button) return;
  menu.hidden = true;
  button.classList.remove("active");
  button.setAttribute("aria-expanded", "false");
}

function toggleSubpageMenu() {
  const menu = $("#subpageMenu");
  const button = $("#subpageMenuBtn");
  if (!menu || !button) return;
  const nextOpen = menu.hidden;
  menu.hidden = !nextOpen;
  button.classList.toggle("active", nextOpen);
  button.setAttribute("aria-expanded", String(nextOpen));
}

function renderDateControls() {
  const months = ["全部", ...Array.from(new Set(state.records.map(item => monthLabel(item.date)).filter(Boolean))).sort((a, b) => Number(b.slice(0, 2)) - Number(a.slice(0, 2)))];
  $("#monthSelect").innerHTML = months.map(month => `<option value="${month}" ${month === state.activeMonth ? "selected" : ""}>${month}</option>`).join("");
}

function renderCategoryControls() {
  const categories = ["全部", ...(state.settings.categories || [])];
  $("#categoryChips").innerHTML = categories.map(category => `<button class="chip ${((category === "全部" && !state.selectedCategories.size) || state.selectedCategories.has(category)) ? "active" : ""}" type="button" data-category="${category}">${escapeHtml(category)}</button>`).join("");
}

function renderStatusControls() {
  const filters = state.user.role === "admin" ? adminStatusFilters : state.user.role === "publisher" ? publisherStatusFilters : receiverStatusFilters;
  if (!filters.includes(state.statusFilter)) state.statusFilter = "全部";
  $("#statusChips").innerHTML = filters.map(filter => {
    const active = state.statusFilter === filter && !(filter === "全部" && state.activeMonth !== "全部");
    return `<button class="chip ${active ? "active" : ""}" type="button" data-status="${filter}">${escapeHtml(filter)}</button>`;
  }).join("");
}

function visibleInfoRecords() {
  return state.records.filter(record => canViewRecord(record));
}

function personalReadRecords(records = visibleInfoRecords()) {
  return records.filter(record => canFilterReadState(record));
}

function renderHome() {
  const box = $("#homeInfoMetrics");
  if (!box) return;
  const visible = visibleInfoRecords();
  const personal = personalReadRecords(visible);
  const currentMonth = monthLabel(new Date());
  const currentMonthPersonal = personal.filter(record => monthLabel(record.date) === currentMonth);
  const unread = personal.filter(record => ["未读", "即将超期", "已超期"].includes(readState(record)));
  const overdue = currentMonthPersonal.filter(record => ["已超期", "超期已读"].includes(readState(record)));
  const favorites = visible.filter(record => favoriteService.isFavorite(record.id));
  const overdueRate = currentMonthPersonal.length ? Math.round(overdue.length / currentMonthPersonal.length * 100) : 0;
  const cards = [
    { label: "未读条数", value: unread.length, hint: "查看待阅读信息", filter: "未读", warn: unread.length > 0 },
    { label: `超期率 · ${currentMonth}`, value: `${overdueRate}%`, hint: `${overdue.length}/${currentMonthPersonal.length || 0} 条`, filter: "超期", warn: overdue.length > 0 },
    { label: "信息总条数", value: visible.length, hint: "查看全部可见信息", filter: "全部" },
    { label: "收藏条数", value: favorites.length, hint: "查看我的收藏", filter: "收藏" }
  ];
  box.innerHTML = cards.map(card => `<button class="metric home-metric-btn ${card.warn ? "warn" : ""}" type="button" data-home-info-filter="${card.filter}"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong><small>${escapeHtml(card.hint)}</small></button>`).join("");
}

function statusPass(record) {
  const filter = state.statusFilter;
  if (record.publishStatus === "作废") return state.user.role === "admin" && (filter === "全部" || filter === "作废");
  if (filter === "作废") return false;
  if (filter === "全部") return record.publishStatus !== "已撤回" || canManageFeedbackRecord(record);
  if (filter === "收藏") return favoriteService.isFavorite(record.id);
  if (filter === "未读" && canFilterReadState(record) && state.deferFilterRecordIds.has(record.id)) return true;
  if (filter === "未读") return canFilterReadState(record) && ["未读", "即将超期", "已超期"].includes(readState(record));
  if (filter === "已读") return canFilterReadState(record) && ["已读", "超期已读"].includes(readState(record));
  if (filter === "超期") return canFilterReadState(record) && ["已超期", "超期已读"].includes(readState(record));
  if (filter === "我发布") return isRecordOwner(record);
  return true;
}

function filteredRecords() {
  const term = $("#searchInput").value.trim().toLowerCase();
  const words = term.split(/\s+/).filter(Boolean);
  const visible = visibleInfoRecords();
  return visible.filter(record => {
    const haystack = [record.date, record.publisher, record.category, record.title, record.original, record.sourceSet, record.priority, record.publishStatus, (record.attachments || []).map(file => file.name).join(" ")].join(" ").toLowerCase();
    return (!state.selectedCategories.size || state.selectedCategories.has(record.category)) && inDateRange(record.date) && statusPass(record) && words.every(word => haystack.includes(word));
  }).sort(compareRecordsDesc);
}

function renderPager(total) {
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;
  $("#pagerText").textContent = `第 ${state.page} / ${totalPages} 页`;
  $("#pageSizeSelect").innerHTML = pageSizes.map(size => `<option value="${size}" ${size === state.pageSize ? "selected" : ""}>${size} 条</option>`).join("");
  const isCompactPager = window.matchMedia("(max-width: 520px)").matches;
  const pages = isCompactPager ? [state.page] : Array.from(new Set([1, state.page - 1, state.page, state.page + 1, totalPages].filter(page => page >= 1 && page <= totalPages)));
  $("#pageButtons").innerHTML = `<button class="page-btn" data-page-action="prev" ${state.page <= 1 ? "disabled" : ""}>上一页</button>` + pages.map(page => `<button class="page-btn ${page === state.page ? "active" : ""}" data-page="${page}">${page}</button>`).join("") + `<button class="page-btn" data-page-action="next" ${state.page >= totalPages ? "disabled" : ""}>下一页</button>`;
}

function recordMetaLine(record, publisherLine = "") {
  const parts = [`<span>${escapeHtml(formatDisplayDateOnly(record.date))}</span>`];
  if (["publisher", "admin"].includes(state.user.role)) {
    parts.push(`<span class="publisher">${escapeHtml(record.publisher || "未知")}</span>`);
  }
  if (publisherLine) parts.push(publisherLine);
  return parts.join("<span>·</span>");
}

function renderRecords() {
  renderDateControls();
  renderCategoryControls();
  renderStatusControls();
  const term = $("#searchInput").value.trim().toLowerCase();
  const filtered = filteredRecords();
  const pageItems = filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
  $("#cards").innerHTML = pageItems.map(record => {
    const metrics = recordMetrics(record);
    const canManageFeedback = record.publishStatus !== "作废" && canManageFeedbackRecord(record);
    const publisherLine = state.user.role === "admin" && canManageFeedback ? `<span class="record-metrics">接收 ${metrics.total} · 已读 ${metrics.read} · 未读 ${metrics.unread} · 超期 ${metrics.overdue}</span>` : "";
    const menu = state.user.id ? `<div class="more-wrap"><button class="more-btn" type="button" data-more>⋯</button><div class="more-menu">
      <button class="item-btn" type="button" data-favorite="${escapeHtml(record.id)}">${favoriteService.isFavorite(record.id) ? "取消收藏" : "收藏"}</button>
      ${canEditRecord(record) ? `<button class="item-btn" type="button" data-edit-record="${escapeHtml(record.id)}">修改</button>` : ""}
      ${canVoidRecord(record) ? `<button class="item-btn delete" type="button" data-void-record="${escapeHtml(record.id)}">作废</button>` : ""}
      ${canRestoreRecord(record) ? `<button class="item-btn" type="button" data-restore-record="${escapeHtml(record.id)}">恢复发布</button>` : ""}
      ${canDeleteRecord(record) ? `<button class="item-btn delete" type="button" data-delete-record="${escapeHtml(record.id)}">删除</button>` : ""}
      ${canManageFeedback ? `<button class="item-btn" type="button" data-feedback-record="${escapeHtml(record.id)}">反馈明细</button><button class="item-btn" type="button" data-remind-record="${escapeHtml(record.id)}">催办未读</button><button class="item-btn" type="button" data-export-record="${escapeHtml(record.id)}">导出反馈</button>` : ""}
    </div></div>` : "";
    return `<article class="card" data-record-id="${escapeHtml(record.id)}" style="--category-color:${categoryColor(record)}">
      <div class="card-row"><h2 class="title"><span class="title-text">${highlight(record.title, term)}</span>${priorityTag(record)}${titleMeta(record)}</h2>${menu}</div>
      <div class="card-row secondary"><span class="inline-status-tags">${statusTags(record)}</span>${recordMetaLine(record, publisherLine)}<span>·</span><button class="link-btn" type="button" data-toggle-panel>展开原文</button></div>
      <div class="original-panel" hidden><div class="original">${highlight(record.original, term)}</div><div class="read-note" hidden></div><div class="attachment-slot">${renderAttachments(record, "record")}</div></div>
    </article>`;
  }).join("");
  $("#empty").hidden = !!filtered.length;
  $("#resultStatus").textContent = `共 ${state.records.length} 条 · 当前显示 ${filtered.length} 条`;
  renderPager(filtered.length);
}

function refreshRecordCard(article, record) {
  state.receipts = receiptService.list();
  const tags = article.querySelector(".inline-status-tags");
  if (tags) tags.innerHTML = statusTags(record);
  const metricsNode = article.querySelector(".record-metrics");
  if (metricsNode) {
    const metrics = recordMetrics(record);
    metricsNode.textContent = `接收 ${metrics.total} · 已读 ${metrics.read} · 未读 ${metrics.unread} · 超期 ${metrics.overdue}`;
  }
  if (!state.deferFilterRecordIds.has(record.id) && !statusPass(record)) renderRecords();
}

function deferUnreadReclassify(recordId) {
  if (state.statusFilter !== "未读") return false;
  state.deferFilterRecordIds.add(recordId);
  const existingTimer = state.deferFilterTimers.get(recordId);
  if (existingTimer) clearTimeout(existingTimer);
  const timer = setTimeout(() => {
    state.deferFilterRecordIds.delete(recordId);
    state.deferFilterTimers.delete(recordId);
    if (state.statusFilter === "未读") renderRecords();
  }, 5 * 60 * 1000);
  state.deferFilterTimers.set(recordId, timer);
  return true;
}

function clearDeferredReclassify(recordId) {
  const timer = state.deferFilterTimers.get(recordId);
  if (timer) clearTimeout(timer);
  state.deferFilterTimers.delete(recordId);
  state.deferFilterRecordIds.delete(recordId);
}

function clearAllDeferredReclassify() {
  state.deferFilterTimers.forEach(timer => clearTimeout(timer));
  state.deferFilterTimers.clear();
  state.deferFilterRecordIds.clear();
}

function renderStats() {
  const teams = ["全部", ...Array.from(new Set(normalizePeople(state.settings.people || []).map(person => person.team).filter(Boolean)))];
  if (!teams.includes(state.statsTeam)) state.statsTeam = "全部";
  const options = statsOptions();
  const data = statsService.filtered(state.records, state.receipts, options);
  const percent = value => `${Number(value || 0)}%`;
  const num = value => `<span class="stats-num">${escapeHtml(value)}</span>`;
  const risk = value => `<span class="stats-num ${Number(value) ? "stats-bad" : ""}">${escapeHtml(value)}</span>`;
  const riskRate = value => `<span class="stats-num ${Number(value) ? "stats-bad" : ""}">${percent(value)}</span>`;
  const rate = value => `<span class="stats-num ${Number(value) >= 90 ? "stats-good" : ""}">${percent(value)}</span>`;
  const teamRow = row => `<div class="stats-table-row stats-team-row"><span>${escapeHtml(row.team)}</span>${num(row.peopleCount)}${num(row.total)}${num(row.read)}${risk(row.totalUnread)}${num(row.unread)}${risk(row.overdueUnread)}${risk(row.overdueRead)}${rate(row.readRate)}${riskRate(row.overdueRate)}</div>`;
  const personRow = row => `<div class="stats-table-row stats-person-row"><span>${escapeHtml(row.name)}</span><span>${escapeHtml(row.team)}</span>${num(row.total)}${num(row.read)}${risk(row.totalUnread)}${num(row.unread)}${risk(row.overdueUnread)}${risk(row.overdueRead)}${rate(row.readRate)}${riskRate(row.overdueRate)}</div>`;
  $("#statsPanel").innerHTML = `<div class="module-head">
    <div><h1>统计分析</h1><p>按阅读回执统计个人和班组已读、未读、超期情况，用于考核核对。</p></div>
    <div class="stats-actions"><button id="exportStatsExcelBtn" class="btn" type="button">导出 Excel</button><button id="exportStatsCsvBtn" class="btn secondary" type="button">导出 CSV</button></div>
  </div>
  <section class="metric-grid">
    <div class="metric"><span>发布数</span><strong>${data.overview.publishCount}</strong></div>
    <div class="metric"><span>接收人次</span><strong>${data.overview.total}</strong></div>
    <div class="metric"><span>已读人次</span><strong>${data.overview.read + data.overview.overdueRead}</strong></div>
    <div class="metric"><span>整体已读率</span><strong>${percent(data.overview.readRate)}</strong></div>
    <div class="metric"><span>未读</span><strong>${data.overview.unread}</strong></div>
    <div class="metric warn"><span>超期未读</span><strong>${data.overview.overdueUnread}</strong></div>
    <div class="metric warn"><span>超期已读</span><strong>${data.overview.overdueRead}</strong></div>
    <div class="metric warn"><span>超期率</span><strong>${percent(data.overview.overdueRate)}</strong></div>
  </section>
  <section class="data-panel setting-list"><div class="stats-toolbar"><input id="statsSearch" class="search" type="search" placeholder="搜索姓名、班组、工号" value="${escapeHtml(state.statsSearch)}"><label class="select-pill">班组<select id="statsTeamSelect">${teams.map(team => `<option value="${escapeHtml(team)}" ${team === state.statsTeam ? "selected" : ""}>${escapeHtml(team)}</option>`).join("")}</select></label><label class="select-pill stats-date">开始<input id="statsStartDate" type="date" value="${escapeHtml(state.statsStartDate)}"></label><label class="select-pill stats-date">结束<input id="statsEndDate" type="date" value="${escapeHtml(state.statsEndDate)}"></label><button id="clearStatsDatesBtn" class="btn secondary" type="button">清除日期</button></div><div class="status-line">${escapeHtml(statsFilterText(options))} · 当前班组 ${data.teams.length} 个 · 当前个人 ${data.people.length} 人</div></section>
  <section class="stats-layout">
    <div class="data-panel"><div class="stats-section-title">班组统计</div><div class="stats-table"><div class="stats-table-row stats-team-row head"><span>班组</span><span class="stats-num">人数</span><span class="stats-num">应读</span><span class="stats-num">已读</span><span class="stats-num">总未读</span><span class="stats-num">未读</span><span class="stats-num">超期未读</span><span class="stats-num">超期已读</span><span class="stats-num">已读率</span><span class="stats-num">超期率</span></div>${data.teams.map(teamRow).join("") || '<div class="status-line" style="padding:12px">暂无班组统计。</div>'}</div></div>
    <div class="data-panel"><div class="stats-section-title">个人统计</div><div class="stats-table"><div class="stats-table-row stats-person-row head"><span>姓名</span><span>班组</span><span class="stats-num">应读</span><span class="stats-num">已读</span><span class="stats-num">总未读</span><span class="stats-num">未读</span><span class="stats-num">超期未读</span><span class="stats-num">超期已读</span><span class="stats-num">已读率</span><span class="stats-num">超期率</span></div>${data.people.map(personRow).join("") || '<div class="status-line" style="padding:12px">暂无个人统计。</div>'}</div></div>
  </section>`;
}

function renderStatsAndRestoreSearchFocus(selectionStart, selectionEnd) {
  renderStats();
  const input = $("#statsSearch");
  if (!input) return;
  input.focus({ preventScroll: true });
  const end = input.value.length;
  const startPos = Math.min(selectionStart ?? end, end);
  const endPos = Math.min(selectionEnd ?? startPos, end);
  if (typeof input.setSelectionRange === "function") {
    input.setSelectionRange(startPos, endPos);
  }
}

function scheduleStatsSearchRender(input) {
  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  if (state.statsSearchTimer) clearTimeout(state.statsSearchTimer);
  state.statsSearchTimer = setTimeout(() => {
    state.statsSearchTimer = null;
    renderStatsAndRestoreSearchFocus(selectionStart, selectionEnd);
  }, 300);
}

function renderMaintenanceAndRestoreSearchFocus(selectionStart, selectionEnd) {
  renderMaintenance();
  const input = $("#maintenanceFlightSearch");
  if (!input) return;
  input.focus({ preventScroll: true });
  const end = input.value.length;
  const startPos = Math.min(selectionStart ?? end, end);
  const endPos = Math.min(selectionEnd ?? startPos, end);
  if (typeof input.setSelectionRange === "function") input.setSelectionRange(startPos, endPos);
}

function scheduleMaintenanceFlightSearchRender(input) {
  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  if (state.maintenanceFlightSearchTimer) clearTimeout(state.maintenanceFlightSearchTimer);
  state.maintenanceFlightSearchTimer = setTimeout(async () => {
    state.maintenanceFlightSearchTimer = null;
    try {
      await refreshMaintenance();
      renderMaintenanceAndRestoreSearchFocus(selectionStart, selectionEnd);
    } catch (error) {
      alert(`搜索失败：${error.message}`);
    }
  }, 300);
}

function roleDefaults(role) {
  return state.settings.rolePermissions?.[role] || state.settings.rolePermissions?.receiver || { allowedTabs: ["homePage", "infoPage", "maintenancePage"], permissions: ["view"] };
}

function displayTabLabels(tabs = []) {
  const labels = new Map(tabOptions);
  return tabs.filter(tab => labels.has(tab)).map(tab => labels.get(tab)).join("、");
}

function checkedGroup(name, options, selected = []) {
  const set = new Set(selected);
  return `<div class="check-grid">${options.map(([value, label]) => `<label class="check-option"><input type="checkbox" name="${name}" value="${escapeHtml(value)}" ${set.has(value) ? "checked" : ""}><span>${escapeHtml(label)}</span></label>`).join("")}</div>`;
}

function selectedChecks(name) {
  return $$(`input[name="${name}"]:checked`).map(input => input.value);
}

function personnelFunctionCategories() {
  const configured = state.settings?.personnelFunctionCategories;
  return Array.isArray(configured) && configured.length ? configured : defaultPersonnelFunctionCategories;
}

function functionCategoryOptions(selected = "维修") {
  return personnelFunctionCategories().map(value => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function renderUserManagement() {
  const roleFilterOptions = [["全部", "全部"], ...Object.entries(roleLabels)];
  const rows = (state.users || []).filter(user => state.userRoleFilter === "全部" || user.role === state.userRoleFilter);
  const rowIds = new Set(rows.map(user => user.id));
  state.selectedUserIds = new Set([...state.selectedUserIds].filter(id => rowIds.has(id)));
  const selectedCount = state.selectedUserIds.size;
  const allChecked = rows.length > 0 && rows.every(user => state.selectedUserIds.has(user.id));
  return `<div class="data-panel setting-list user-admin-card"><div class="module-head"><div><strong>登录用户管理</strong><div class="status-line">新增账号、配置角色权限、重置密码和启用/停用。</div></div><button id="openUserCreateBtn" class="btn secondary" type="button">新增账号</button></div>
    <div class="import-box"><label>Excel / CSV 批量导入用户<input id="userImportFile" type="file" accept=".xlsx,.xls,.csv"></label><button id="userImportBtn" class="btn secondary" type="button">导入用户</button><div id="userImportResult" class="status-line">列名：账号、姓名、班组、角色、初始密码、页签权限、功能权限、状态、人员职能类别。</div></div>
    <div class="user-batch-toolbar"><label class="status-line user-toolbar-left">角色筛选 <select id="userRoleFilter">${roleFilterOptions.map(([value, label]) => `<option value="${escapeHtml(value)}" ${state.userRoleFilter === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label><div class="user-toolbar-right"><span id="userBatchCount" class="status-line">已选择 ${selectedCount} 个账号</span><button id="openUserBatchBtn" class="btn secondary" type="button" ${selectedCount ? "" : "disabled"}>批量修改</button></div></div>
    <div class="user-table admin-user-table"><div class="user-row admin-user-row head"><span><input id="userSelectAll" type="checkbox" ${allChecked ? "checked" : ""} aria-label="全选当前列表"></span><span>账号</span><span>姓名</span><span>角色</span><span>班组</span><span>职能类别</span><span>状态</span><span>页签</span><span>操作</span></div>${rows.map(user => `<div class="user-row admin-user-row"><span><input type="checkbox" data-user-select="${escapeHtml(user.id)}" ${state.selectedUserIds.has(user.id) ? "checked" : ""} aria-label="选择 ${escapeHtml(user.username)}"></span><span>${escapeHtml(user.username)}</span><span>${escapeHtml(user.name)}</span><span>${escapeHtml(roleLabels[user.role] || user.role)}</span><span>${escapeHtml(user.team || "未设置")}</span><span>${escapeHtml(user.functionCategory || "维修")}</span><span>${escapeHtml(statusLabels[user.status] || user.status || "启用")}</span><span>${escapeHtml(displayTabLabels(user.allowedTabs))}</span><span class="user-actions"><button class="link-btn" type="button" data-edit-user="${escapeHtml(user.id)}">编辑</button><button class="link-btn" type="button" data-reset-user="${escapeHtml(user.id)}">重置密码</button><button class="link-btn" type="button" data-toggle-user="${escapeHtml(user.id)}">${user.status === "disabled" ? "启用" : "停用"}</button>${user.id !== state.user.id && user.id !== "54002010" ? `<button class="link-btn danger-text" type="button" data-delete-user="${escapeHtml(user.id)}">删除</button>` : ""}</span></div>`).join("") || '<div class="status-line">当前角色下暂无账号。</div>'}</div></div>`;
}

function openUserDialog(user = null) {
  const isEdit = !!user;
  const defaults = roleDefaults(user?.role || "receiver");
  const allowedTabs = user?.allowedTabs || defaults.allowedTabs;
  const permissions = user?.permissions || defaults.permissions;
  $("#userDialogBody").innerHTML = `<div class="dialog-head"><h2>${isEdit ? "编辑账号" : "新增账号"}</h2><button class="icon-btn" data-close="userDialog" type="button">×</button></div><form id="userForm" class="entry-grid">
    <input id="userId" type="hidden" value="${escapeHtml(user?.id || "")}">
    <label>账号<input id="userUsername" value="${escapeHtml(user?.username || "")}" ${isEdit ? "disabled" : ""} required></label>
    <label>姓名<input id="userName" value="${escapeHtml(user?.name || "")}" required></label>
    <label>班组<input id="userTeam" value="${escapeHtml(user?.team || "")}" placeholder="例如：一班"></label>
    <label>人员职能类别<select id="userFunctionCategory">${functionCategoryOptions(user?.functionCategory || "维修")}</select></label>
    ${isEdit ? "" : '<label>初始密码<input id="userPassword" value="123456" required></label>'}
    <label>角色<select id="userRole"><option value="receiver">接收者</option><option value="publisher">发布者</option><option value="admin">管理员</option></select></label>
    <label>状态<select id="userStatus"><option value="active">启用</option><option value="disabled">停用</option></select></label>
    <div><span class="status-line">可访问页签</span>${checkedGroup("userTabs", tabOptions, allowedTabs)}</div>
    <div><span class="status-line">功能权限</span>${checkedGroup("userPerms", permissionOptions, permissions)}</div>
    <div class="form-actions"><button class="btn secondary" type="button" data-close="userDialog">取消</button><button class="btn" type="submit">保存</button></div>
  </form>`;
  $("#userRole").value = user?.role || "receiver";
  $("#userStatus").value = user?.status || "active";
  $("#userDialog").showModal();
}

function openUserBatchDialog() {
  const selectedUsers = state.users.filter(user => state.selectedUserIds.has(user.id));
  if (!selectedUsers.length) return;
  const defaults = roleDefaults("receiver");
  $("#userBatchDialogBody").innerHTML = `<div class="dialog-head"><h2>批量修改账号</h2><button class="icon-btn" data-close="userBatchDialog" type="button">×</button></div><form id="userBatchForm" class="entry-grid">
    <div class="status-line">已选择 ${selectedUsers.length} 个账号。仅勾选“应用”的项目会被修改；页签和功能权限将完整替换。</div>
    <label class="batch-apply"><input id="batchApplyRole" type="checkbox">应用角色<select id="batchRole"><option value="receiver">接收者</option><option value="publisher">发布者</option><option value="admin">管理员</option></select></label>
    <label class="batch-apply"><input id="batchApplyStatus" type="checkbox">应用状态<select id="batchStatus"><option value="active">启用</option><option value="disabled">停用</option></select></label>
    <label class="batch-apply"><input id="batchApplyTeam" type="checkbox">应用班组<input id="batchTeam" placeholder="例如：一班"></label>
    <label class="batch-apply"><input id="batchApplyFunctionCategory" type="checkbox">应用职能类别<select id="batchFunctionCategory">${functionCategoryOptions()}</select></label>
    <div class="batch-section"><label class="login-check"><input id="batchApplyTabs" type="checkbox">应用可访问页签</label>${checkedGroup("batchTabs", tabOptions, defaults.allowedTabs)}</div>
    <div class="batch-section"><label class="login-check"><input id="batchApplyPerms" type="checkbox">应用功能权限</label>${checkedGroup("batchPerms", permissionOptions, defaults.permissions)}</div>
    <div class="form-actions"><button class="btn secondary" type="button" data-close="userBatchDialog">取消</button><button class="btn" type="submit">保存批量修改</button></div>
  </form>`;
  $("#batchRole").value = "receiver";
  $("#userBatchDialog").showModal();
}

function applyRoleDefaults() {
  const defaults = roleDefaults($("#userRole").value);
  $$('input[name="userTabs"]').forEach(input => { input.checked = defaults.allowedTabs.includes(input.value); });
  $$('input[name="userPerms"]').forEach(input => { input.checked = defaults.permissions.includes(input.value); });
}

function applyBatchRoleDefaults() {
  const defaults = roleDefaults($("#batchRole").value);
  $$('input[name="batchTabs"]').forEach(input => { input.checked = defaults.allowedTabs.includes(input.value); });
  $$('input[name="batchPerms"]').forEach(input => { input.checked = defaults.permissions.includes(input.value); });
}

function userPayloadFromForm() {
  return {
    username: $("#userUsername")?.value.trim(),
    name: $("#userName").value.trim(),
    team: $("#userTeam").value.trim() || "未设置",
    functionCategory: $("#userFunctionCategory").value,
    department: "未设置",
    password: $("#userPassword")?.value || undefined,
    role: $("#userRole").value,
    status: $("#userStatus").value,
    allowedTabs: selectedChecks("userTabs"),
    permissions: selectedChecks("userPerms")
  };
}

function batchUserUpdatesFromForm() {
  const updates = {};
  if ($("#batchApplyRole")?.checked) updates.role = $("#batchRole").value;
  if ($("#batchApplyStatus")?.checked) updates.status = $("#batchStatus").value;
  if ($("#batchApplyTeam")?.checked) updates.team = $("#batchTeam").value.trim() || "未设置";
  if ($("#batchApplyFunctionCategory")?.checked) updates.functionCategory = $("#batchFunctionCategory").value;
  if ($("#batchApplyTabs")?.checked) updates.allowedTabs = selectedChecks("batchTabs");
  if ($("#batchApplyPerms")?.checked) updates.permissions = selectedChecks("batchPerms");
  return updates;
}

function syncUserSelectionUi() {
  const selectedCount = state.selectedUserIds.size;
  const count = $("#userBatchCount");
  if (count) count.textContent = `已选择 ${selectedCount} 个账号`;
  const button = $("#openUserBatchBtn");
  if (button) button.disabled = !selectedCount;
  const boxes = $$("[data-user-select]");
  const all = $("#userSelectAll");
  if (all) all.checked = boxes.length > 0 && boxes.every(box => box.checked);
}

function renderSettings() {
  if (!canOpenSettings()) return;
  const settings = state.settings;
  const peopleRows = normalizePeople(settings.people || []);
  $("#settingsPanel").innerHTML = `<section class="settings-grid">
    <div class="data-panel setting-list"><strong>分类设置</strong><textarea id="settingsCategories" rows="5">${escapeHtml((settings.categories || []).join("\n"))}</textarea><span class="status-line">每行一个分类，保存后会同步到发布表单和筛选。</span></div>
    <div class="data-panel setting-list"><strong>超期门限</strong><label>信息超期门限天数<input id="settingsOverdueDays" type="number" min="1" max="60" value="${escapeHtml(settings.overdueDays || 3)}"></label><label>即将超期提醒天数<input id="settingsReminderDays" type="number" min="1" max="60" value="${escapeHtml(settings.reminderDays || 1)}"></label><span class="status-line">以发布时间为起点，每24小时为一天；只有日期时按当天12:00计算。</span></div>
    <div class="data-panel setting-list"><strong>人员列表</strong><span class="status-line">人员信息由“登录用户管理”的启用账号自动同步，不再单独录入或导入。</span><div class="user-table people-table"><div class="user-row head"><span>账号</span><span>姓名</span><span>班组</span><span>状态</span><span></span><span></span><span></span></div>${peopleRows.map(person => `<div class="user-row"><span>${escapeHtml(person.username || person.id)}</span><span>${escapeHtml(person.name)}</span><span>${escapeHtml(person.team || "未设置")}</span><span>启用</span><span></span><span></span><span></span></div>`).join("") || '<div class="status-line">暂无启用账号。</div>'}</div></div>
    <div class="data-panel setting-list"><strong>信息批量导入</strong><div class="import-box"><label>Excel / CSV 导入信息<input id="settingsBatchImportFile" type="file" accept=".xlsx,.xls,.csv,.txt"></label><button id="settingsBatchImportBtn" class="btn secondary" type="button">批量导入信息</button><div id="settingsBatchImportResult" class="status-line">列名：日期、类别、标题、原文、发布者。导入后默认推送全员并标记已读。</div></div></div>
    ${renderUserManagement()}
  </section><div class="form-actions"><button id="saveSettingsBtn" class="btn" type="button">保存设置</button></div>`;
}

function renderEntryOptions() {
  $("#entryCategory").innerHTML = (state.settings.categories || []).map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
  renderRecipientPicker();
}

function selectedRecipientIds() {
  return Array.from(state.selectedRecipientIds);
}

function setRecipientSelection(ids) {
  state.selectedRecipientIds = new Set(ids);
  syncRecipientCheckboxes();
}

function syncRecipientCheckboxes() {
  $$("#recipientOptions input[data-recipient]").forEach(input => {
    input.checked = state.selectedRecipientIds.has(input.dataset.recipient);
  });
}

function visibleRecipientIds() {
  return $$("#recipientOptions input[data-recipient]").map(input => input.dataset.recipient);
}

function renderRecipientPicker() {
  const people = normalizePeople(state.settings.people || []);
  const teams = ["全部", ...Array.from(new Set(people.map(person => person.team).filter(Boolean)))];
  const currentTeam = $("#recipientTeamFilter")?.value || "全部";
  const currentSearch = ($("#recipientSearch")?.value || "").trim().toLowerCase();
  $("#recipientTeamFilter").innerHTML = teams.map(team => `<option value="${escapeHtml(team)}" ${team === currentTeam ? "selected" : ""}>${escapeHtml(team)}</option>`).join("");
  const visible = people.filter(person => {
    const text = [person.id, person.name, person.team].join(" ").toLowerCase();
    return (currentTeam === "全部" || person.team === currentTeam) && (!currentSearch || text.includes(currentSearch));
  });
  $("#recipientOptions").innerHTML = visible.map(person => `<label class="recipient-option"><span class="recipient-name">${escapeHtml(person.name)} · ${escapeHtml(person.team)}</span><input type="checkbox" data-recipient="${escapeHtml(person.id)}" ${state.selectedRecipientIds.has(person.id) ? "checked" : ""}></label>`).join("") || '<div class="status-line">没有匹配人员。</div>';
}

function renderFixedAtaOptions() {
  $("#fixedAta").innerHTML = ataOptions.map(ata => `<option value="${ata}">${ata}</option>`).join("");
  $("#fixedAtaFilter").innerHTML = `<option value="全部">全部</option>` + ataOptions.map(ata => `<option value="${ata}">${ata}</option>`).join("");
}

function filteredFixed() {
  const term = $("#fixedSearch").value.trim().toLowerCase();
  const ata = $("#fixedAtaFilter").value;
  return state.fixedProjects.filter(item => {
    const text = [item.ata, item.title, item.contentHtml, item.references, (item.attachments || []).map(file => file.name).join(" ")].join(" ").toLowerCase();
    return (ata === "全部" || item.ata === ata) && (!term || text.includes(term));
  });
}

function renderFixedProjects() {
  const items = filteredFixed();
  $("#fixedStatus").textContent = `共 ${state.fixedProjects.length} 项 · 当前显示 ${items.length} 项`;
  $("#fixedEmpty").hidden = !!items.length;
  $("#fixedList").innerHTML = items.map(project => `<article class="card fixed-card" data-fixed-id="${escapeHtml(project.id)}">
    <div class="card-row"><span class="tag cat-规定">ATA ${escapeHtml(project.ata)}</span><h2 class="title">${escapeHtml(project.title)}${project.attachments?.length ? '<span class="title-meta"><span class="badge attachment-badge">附件</span></span>' : ""}</h2>
    <div class="more-wrap"><button class="more-btn" type="button" data-more>⋯</button><div class="more-menu">${has("fixedManage") ? `<button class="item-btn" type="button" data-edit-fixed="${escapeHtml(project.id)}">修改</button><button class="item-btn delete" type="button" data-delete-fixed="${escapeHtml(project.id)}">删除</button>` : ""}</div></div></div>
    <div class="card-row secondary"><span>更新 ${escapeHtml((project.updatedAt || "").slice(0, 10))}</span><span>·</span><button class="link-btn" type="button" data-toggle-panel>展开</button><span>·</span><button class="link-btn" type="button" data-print-fixed="${escapeHtml(project.id)}">打印</button></div>
    <div class="fixed-panel" hidden><div class="rich-view">${sanitizeRichHtml(project.contentHtml || "<p>暂无内容</p>")}</div>${project.references ? `<div class="references"><strong>参考资料：</strong>\n${escapeHtml(project.references)}</div>` : ""}${renderAttachments(project, "fixedProject")}</div>
  </article>`).join("");
}

const maintenanceTabs = [
  ["dispatch", "派工"],
  ["execute", "执行"],
  ["data", "数据"],
  ["hours", "工时"]
];
const aircraftTypes = ["A319", "A320", "A321", "A330", "B737", "B767", "B777", "B787", "ARJ21", "C919", "大机型", "小机型", "其他"];
const maintenanceOpportunityOptions = ["航前", "航后", "航后/航前", "短停", "热备机", "停场", "附加", "其他", "三方短停", "三方航后", "三方航前"];
const taskStatuses = ["未派工", "已派工", "已提报", "待复核", "已确认"];
const maintenanceSortOptions = [
  ["default", "默认排序"],
  ["aircraftNo:asc", "机号 正序"],
  ["aircraftNo:desc", "机号 倒序"],
  ["stand:asc", "机位 正序"],
  ["stand:desc", "机位 倒序"],
  ["plannedArrival:asc", "落地 正序"],
  ["plannedArrival:desc", "落地 倒序"],
  ["plannedDeparture:asc", "起飞 正序"],
  ["plannedDeparture:desc", "起飞 倒序"]
];
const subtaskCategories = ["工卡指令", "单项工作", "其他"];
const priorityOptions = ["普通", "重要", "紧急"];
const maintenanceRoleOptions = ["放行", "接机", "送机", "勤务", "例行检查", "例行机内", "例行L/G", "例行发动机", "例行机外", "例行电子"];
const maintenanceSubtaskRoleOptions = ["主作", "检验", "辅助"];
const maintenanceRoleAliases = { "航后机内": "例行机内", "航后起落架": "例行L/G", "航后发动机": "例行发动机", "航后外部": "例行机外", "航后电子": "例行电子" };

function maintenanceOperationalTimeValue(value) {
  const match = String(value || "").trim().match(/^(\d{1,4})(\+)?$/);
  if (!match) return null;
  const digits = match[1].padStart(4, "0");
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2));
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes + (match[2] ? 24 * 60 : 0);
}

function maintenanceLocalDateValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function compareMaintenanceOptionalTime(left, right, direction = "asc") {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const compared = left - right;
  return direction === "desc" ? -compared : compared;
}

function maintenanceStandardHoursLabel(value) {
  const hours = Number(value);
  return hours > 0 ? `${hours}h` : "未填写工时";
}

function maintenanceRolesForOpportunity(value) {
  const opportunity = value || "其他";
  if (["短停", "三方短停"].includes(opportunity)) return ["放行", "接机", "送机", "例行检查"];
  if (["航前", "三方航前"].includes(opportunity)) return ["放行", "送机", "勤务", "例行检查"];
  if (["航后", "三方航后"].includes(opportunity)) return ["放行", "接机", "勤务", "例行机内", "例行L/G", "例行发动机", "例行机外", "例行电子"];
  if (opportunity === "停场") return ["放行"];
  return maintenanceRoleOptions;
}

function maintenanceRolesForOwner(ownerType, opportunity) {
  return ownerType === "subtask" ? maintenanceSubtaskRoleOptions : maintenanceRolesForOpportunity(opportunity);
}

function normalizeMaintenanceRoleForMenu(value, roles) {
  const role = maintenanceRoleAliases[value] || value || "";
  return roles.includes(role) ? role : (roles.find(item => item !== "放行") || roles[0]);
}

function canManageMaintenance() {
  return state.user.role === "admin" || state.user.role === "publisher";
}

function maintenanceAllowedTabs() {
  if (canManageMaintenance()) return maintenanceTabs;
  return maintenanceTabs.filter(([key]) => ["execute", "data"].includes(key));
}

function maintenanceTitle(flight) {
  return [flight.flightNo, flight.aircraftNo, flight.workKind || flight.workType].filter(Boolean).join(" · ") || "未命名航班任务";
}

function maintenanceOpportunityTag(flight) {
  const opportunity = flight.workKind || flight.workType || "其他";
  const colors = {
    "航前": ["#E0F2FE", "#0369A1"],
    "航后": ["#EDE9FE", "#6D28D9"],
    "航后/航前": ["#DBEAFE", "#1D4ED8"],
    "短停": ["#DCFCE7", "#047857"],
    "热备机": ["#FEF3C7", "#B45309"],
    "停场": ["#FEE2E2", "#B91C1C"],
    "附加": ["#F1F5F9", "#475569"],
    "其他": ["#E5E7EB", "#4B5563"],
    "三方短停": ["#CCFBF1", "#0F766E"],
    "三方航后": ["#FCE7F3", "#BE185D"],
    "三方航前": ["#FFEDD5", "#C2410C"]
  };
  const [background, color] = colors[opportunity] || colors["其他"];
  return `<span class="maintenance-opportunity-tag" style="--opportunity-bg:${background};--opportunity-color:${color}">${escapeHtml(opportunity)}</span>`;
}

function maintenanceAssigneeGroups(item, ownerType = "flight") {
  const grouped = new Map();
  for (const person of item.assignments || []) {
    const role = maintenanceRoleAliases[person.role] || person.role || "未设置";
    if (!grouped.has(role)) grouped.set(role, []);
    const names = grouped.get(role);
    const name = person.userName || "未知人员";
    if (!names.includes(name)) names.push(name);
  }
  if (!grouped.size) return [];
  const order = maintenanceRolesForOwner(ownerType, item.workKind || item.workType || "其他");
  return [...grouped.entries()]
    .sort(([left], [right]) => {
      const leftIndex = order.indexOf(left);
      const rightIndex = order.indexOf(right);
      return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
    });
}

function maintenanceAssignees(item, ownerType = "flight") {
  const groups = maintenanceAssigneeGroups(item, ownerType);
  return groups.length ? groups.map(([role, names]) => `${role}：${names.join("、")}`).join("；") : "未派工";
}

function maintenanceAssigneesHtml(item, ownerType = "flight") {
  const groups = maintenanceAssigneeGroups(item, ownerType);
  if (!groups.length) return '<span class="maintenance-assignment-names">未派工</span>';
  return groups.map(([role, names], index) => `${index ? '<span class="maintenance-assignment-separator">；</span>' : ""}<span class="maintenance-assignment-group"><strong class="maintenance-assignment-role">${escapeHtml(role)}：</strong><span class="maintenance-assignment-names">${escapeHtml(names.join("、"))}</span></span>`).join("");
}

function maintenanceAircraftTypeOptions(value = "A320") {
  const current = String(value || "A320");
  if (aircraftTypes.includes(current)) return optionList(aircraftTypes, current);
  return optionList([...aircraftTypes.slice(0, -1), current, "其他"], current);
}

function maintenanceReportProgressHtml(flight, compact = false) {
  const segments = flight?.reportProgress?.segments || [];
  if (!segments.length) return "";
  const description = `已提报：${segments.map(segment => `${segment.label}${segment.status}`).join("，")}`;
  if (compact) {
    return `<span class="execute-report-status-segments" aria-hidden="true">${segments.map(segment => `<span class="execute-report-status-part ${segment.status === "已提报" ? "submitted" : segment.status === "无需报工" ? "skipped" : "pending"}" style="--report-color:${escapeHtml(segment.color)}"></span>`).join("")}</span>
      <span class="execute-report-status-label" aria-hidden="true">已提报</span>`;
  }
  return `<div class="maintenance-report-progress" aria-label="${escapeHtml(description)}">${segments.map(segment => `<div class="maintenance-report-segment ${segment.status === "已提报" ? "submitted" : segment.status === "无需报工" ? "skipped" : "pending"}" style="--report-color:${escapeHtml(segment.color)}"><strong>${escapeHtml(segment.label)}</strong><span>${escapeHtml(segment.status)}</span></div>`).join("")}</div>`;
}

function maintenanceReportTypeSubmitted(flight, reportType) {
  return ["已提报", "待复核", "已确认"].includes(flight?.reportProgress?.batches?.[reportType]?.status || "");
}

function maintenanceLockedDispatchRoles(flight, ownerType) {
  const locked = new Set();
  if (ownerType === "subtask") {
    if (maintenanceReportTypeSubmitted(flight, "nonroutine")) maintenanceSubtaskRoleOptions.forEach(role => locked.add(role));
    return locked;
  }
  if (maintenanceReportTypeSubmitted(flight, "release")) locked.add("放行");
  if (maintenanceReportTypeSubmitted(flight, "routine")) {
    maintenanceRolesForOpportunity(flight?.workKind || flight?.workType || "其他")
      .filter(role => role !== "放行")
      .forEach(role => locked.add(role));
  }
  return locked;
}

function maintenanceStatusBadge(status, dispatchTarget = "", reviewFlightId = "", reviewFocus = "", item = null) {
  const cls = status === "已确认" ? "ok" : status === "待复核" ? "warn" : status === "已提报" ? "submitted" : "";
  const ownerType = dispatchTarget.split(":")[0] || "flight";
  const flight = ownerType === "subtask" && item ? findMaintenanceSubtask(item.id).flight : item;
  const submittedCanDispatch = status === "已提报" && item && maintenanceLockedDispatchRoles(flight, ownerType).size < maintenanceRolesForOwner(ownerType, flight?.workKind || flight?.workType || "其他").length;
  if (dispatchTarget && canManageMaintenance() && (["未派工", "已派工"].includes(status) || submittedCanDispatch)) {
    const segmented = status === "已提报" && flight?.reportProgress?.segments?.length;
    const description = segmented ? `已提报：${flight.reportProgress.segments.map(segment => `${segment.label}${segment.status}`).join("，")}` : status;
    return `<button class="status-badge status-action ${cls} ${segmented ? "execute-report-status" : ""}" type="button" data-maint-dispatch="${escapeHtml(dispatchTarget)}" title="${status === "已提报" ? "调整尚未提报类别的人员" : "点击派工"}" aria-label="${escapeHtml(description)}">${segmented ? maintenanceReportProgressHtml(flight, true) : escapeHtml(status)}</button>`;
  }
  if (reviewFlightId && canManageMaintenance() && ["待复核", "已确认"].includes(status)) {
    return `<button class="status-badge status-action ${cls}" type="button" data-maint-review="${escapeHtml(reviewFlightId)}" data-maint-review-focus="${escapeHtml(reviewFocus)}" title="查看并复核任务树">${escapeHtml(status)}</button>`;
  }
  if (status === "已提报" && item?.reportProgress?.segments?.length) {
    const description = `已提报：${item.reportProgress.segments.map(segment => `${segment.label}${segment.status}`).join("，")}`;
    return `<span class="status-badge execute-report-status" role="img" aria-label="${escapeHtml(description)}" title="${escapeHtml(description)}">${maintenanceReportProgressHtml(item, true)}</span>`;
  }
  return `<span class="status-badge ${cls}">${escapeHtml(status || "未派工")}</span>`;
}

function maintenanceSubtaskCard(flight, item) {
  const confirmed = flight.status === "已确认" || Boolean(flight.archivedAt);
  const pendingReview = !confirmed && flight.status === "待复核";
  const protectedDelete = confirmed || pendingReview;
  const canDelete = canManageMaintenance() && (!confirmed || state.user.role === "admin");
  return `<article class="maintenance-subtask" ${canManageMaintenance() ? `data-maint-edit-target="subtask:${escapeHtml(item.id)}" title="双击修改"` : ""}>
    <div class="maintenance-subtask-main">
      <strong>${escapeHtml(item.title || "未填写标题")}</strong>
      <span>${escapeHtml(item.category || "-")} · ${escapeHtml(maintenanceStandardHoursLabel(item.standardHours))} · ${escapeHtml(maintenanceAssignees(item, "subtask"))}</span>
    </div>
    <div class="actions">
      ${maintenanceStatusBadge(item.status, `subtask:${item.id}`, flight.id, `subtask:${item.id}`, item)}
      ${canDelete ? `<button class="link-btn danger-text" type="button" data-maint-delete-subtask="${escapeHtml(item.id)}" data-maint-delete-protected="${protectedDelete ? "true" : "false"}">删除</button>` : ""}
    </div>
  </article>`;
}

function maintenanceDraftSubtaskCard(item) {
  const roleOrder = ["主作", "检验", "辅助"];
  const groups = new Map(roleOrder.map(role => [role, []]));
  (item.entries || []).forEach(entry => {
    if (!groups.has(entry.role) || !entry.userName) return;
    const names = groups.get(entry.role);
    if (!names.includes(entry.userName)) names.push(entry.userName);
  });
  const people = roleOrder
    .filter(role => groups.get(role)?.length)
    .map(role => `<span><strong>${escapeHtml(role)}：</strong>${escapeHtml(groups.get(role).join("、"))}</span>`)
    .join("");
  return `<article class="maintenance-subtask maintenance-subtask-draft">
    <div class="maintenance-subtask-main">
      <strong>${escapeHtml(item.title || "未命名非例行")}</strong>
      <span>${escapeHtml(item.category || "其他")} · ${escapeHtml(item.standardHours === "" ? "-" : item.standardHours || 0)}h</span>
      ${people ? `<div class="maintenance-draft-people">${people}</div>` : ""}
    </div>
    <span class="status-badge draft">草稿</span>
  </article>`;
}

function maintenanceFlightCard(flight) {
  const subtaskCount = (flight.subtasks || []).length;
  const draftItems = flight.nonroutineDraft?.items || [];
  const draftCount = draftItems.length;
  const expanded = state.maintenanceDispatchOpenFlightId === flight.id;
  const nonroutineExpanded = state.maintenanceDispatchOpenNonroutineIds.has(flight.id);
  const roleGroups = new Map();
  (flight.assignments || []).forEach(item => {
    if (!roleGroups.has(item.role)) roleGroups.set(item.role, []);
    const names = roleGroups.get(item.role);
    if (!names.includes(item.userName)) names.push(item.userName);
  });
  const roleOrder = maintenanceRolesForOpportunity(flight.workKind || flight.workType || "其他");
  const roster = [...roleGroups.entries()].sort(([left], [right]) => roleOrder.indexOf(left) - roleOrder.indexOf(right));
  const releaseBatch = flight.reportProgress?.batches?.release;
  const routineBatch = flight.reportProgress?.batches?.routine;
  const releaseSubmitted = maintenanceReportTypeSubmitted(flight, "release");
  const submittedRoutineRoles = maintenanceReportTypeSubmitted(flight, "routine")
    ? new Set((routineBatch?.entries || []).map(item => maintenanceRoleAliases[item.role] || item.role))
    : new Set();
  const confirmedDelete = flight.status === "已确认" || Boolean(flight.archivedAt);
  const protectedDelete = confirmedDelete || flight.status === "待复核";
  const canDelete = canManageMaintenance() && (!confirmedDelete || state.user.role === "admin");
  return `<article class="maintenance-card maintenance-flight-card ${expanded ? "expanded" : "collapsed"}" data-maint-dispatch-card="${escapeHtml(flight.id)}" ${canManageMaintenance() ? `data-maint-edit-target="flight:${escapeHtml(flight.id)}" title="单击展开，双击修改"` : ""}>
    <div class="maintenance-card-head">
      <div class="maintenance-flight-identity">
        <strong><span class="maintenance-aircraft-no">${escapeHtml(flight.aircraftNo || "-")}</span><span class="maintenance-flight-separator"> · </span><span class="maintenance-flight-no">${escapeHtml(flight.flightNo || "-")}</span><span class="maintenance-flight-separator"> · </span><span class="maintenance-aircraft-type">${escapeHtml(flight.aircraftType || "-")}</span>${maintenanceFlightMonthDay(flight.date) ? `<span class="maintenance-flight-date"> · ${escapeHtml(maintenanceFlightMonthDay(flight.date))}</span>` : ""}</strong>
        <div class="maintenance-key-tags"><span class="maintenance-stand-tag">机位 ${escapeHtml(flight.stand || "-")}</span>${maintenanceOpportunityTag(flight)}<span class="maintenance-time-tag">落地 ${escapeHtml(flight.plannedArrival || "-")}</span><span class="maintenance-time-tag">起飞 ${escapeHtml(flight.plannedDeparture || "-")}</span></div>
      </div>
      <div class="actions">${maintenanceStatusBadge(flight.status, `flight:${flight.id}`, flight.id, `flight:${flight.id}`, flight)}${canDelete ? `<button class="link-btn danger-text" type="button" data-maint-delete-flight="${escapeHtml(flight.id)}" data-maint-delete-protected="${protectedDelete ? "true" : "false"}">删除</button>` : ""}</div>
    </div>
    <div class="maintenance-progress"><span class="maintenance-assignment-prefix">派工：</span>${maintenanceAssigneesHtml(flight, "flight")}</div>
    ${expanded ? `<div class="maintenance-dispatch-detail">
      ${roster.length ? `<div class="execute-role-roster maintenance-dispatch-roster">${roster.map(([role, names]) => {
        const normalizedRole = maintenanceRoleAliases[role] || role;
        const submitted = normalizedRole === "放行" ? releaseSubmitted && Boolean(releaseBatch) : submittedRoutineRoles.has(normalizedRole);
        return `<div class="execute-role-row ${submitted ? `submitted ${normalizedRole === "放行" ? "release" : "routine"}` : ""}"><strong>${escapeHtml(role)}</strong><span>${escapeHtml(names.join("、"))}</span></div>`;
      }).join("")}</div>` : ""}
      ${flight.remark ? `<div class="original compact">${escapeHtml(flight.remark)}</div>` : ""}
    </div>` : ""}
    <div class="maintenance-children ${nonroutineExpanded ? "open" : ""}">
      <div class="maintenance-child-head">
        <button class="maintenance-child-toggle" type="button" data-maint-toggle-subtasks="${escapeHtml(flight.id)}" aria-expanded="${nonroutineExpanded ? "true" : "false"}"><span>＋ 非例行 <b class="maintenance-child-count ${subtaskCount ? "has-items" : ""}">${subtaskCount}</b> 项${draftCount ? ` · 草稿 <b class="maintenance-child-count draft-count">${draftCount}</b> 项` : ""}</span></button>
        ${canManageMaintenance() ? `<button class="link-btn" type="button" data-maint-add-subtask="${escapeHtml(flight.id)}">新增</button>` : ""}
      </div>
      ${nonroutineExpanded ? `<div class="maintenance-subtask-list">${(flight.subtasks || []).map(item => maintenanceSubtaskCard(flight, item)).join("")}${draftItems.map(maintenanceDraftSubtaskCard).join("")}${!subtaskCount && !draftCount ? '<div class="status-line">暂无非例行。</div>' : ""}</div>` : ""}
    </div>
  </article>`;
}

function maintenanceAssignmentsForMe() {
  const groups = (state.maintenanceFlights || []).map((flight, index) => {
    const mainAssignments = (flight.assignments || []);
    const mine = mainAssignments.filter(assignment => assignment.userId === state.user.id && ["已派工", "已提报"].includes(assignment.status));
    const subtasks = [];
    (flight.subtasks || []).forEach(item => {
      (item.assignments || []).filter(assignment => assignment.userId === state.user.id && ["已派工", "已提报"].includes(assignment.status))
        .forEach(assignment => subtasks.push({ item, ownerType: "subtask", assignment }));
    });
    return { flight, mainAssignments, mine, subtasks, index };
  }).filter(group => group.mine.length || group.subtasks.length);
  const groupPriority = flight => {
    if (flight.status === "已派工") return 0;
    const personal = flight.personalReportProgress || {};
    if (personal.hasPendingWork) return 1;
    if (personal.awaitingFinalConfirmation) return 3;
    return 2;
  };
  return groups.sort((left, right) => {
    const date = String(right.flight.date || "").localeCompare(String(left.flight.date || ""), "zh-CN", { numeric: true });
    if (date) return date;
    const priority = groupPriority(left.flight) - groupPriority(right.flight);
    if (priority) return priority;
    const direction = state.maintenanceExecuteTimeSort === "asc" ? "asc" : "desc";
    const leftArrival = maintenanceOperationalTimeValue(left.flight.plannedArrival);
    const rightArrival = maintenanceOperationalTimeValue(right.flight.plannedArrival);
    const leftDeparture = maintenanceOperationalTimeValue(left.flight.plannedDeparture);
    const rightDeparture = maintenanceOperationalTimeValue(right.flight.plannedDeparture);
    const time = compareMaintenanceOptionalTime(leftArrival ?? leftDeparture, rightArrival ?? rightDeparture, direction);
    if (time) return time;
    const departure = compareMaintenanceOptionalTime(leftDeparture, rightDeparture, direction);
    if (departure) return departure;
    const updated = String(right.flight.updatedAt || right.flight.createdAt || "")
      .localeCompare(String(left.flight.updatedAt || left.flight.createdAt || ""), "zh-CN", { numeric: true });
    return updated || left.index - right.index;
  });
}

function sortMaintenanceFlights(items, sortValue) {
  if (!sortValue || sortValue === "default") {
    return items.map((item, index) => ({ item, index })).sort((left, right) => {
      const date = String(right.item.date || "").localeCompare(String(left.item.date || ""), "zh-CN", { numeric: true });
      if (date) return date;
      const arrival = compareMaintenanceOptionalTime(maintenanceOperationalTimeValue(left.item.plannedArrival), maintenanceOperationalTimeValue(right.item.plannedArrival), "desc");
      if (arrival) return arrival;
      const departure = compareMaintenanceOptionalTime(maintenanceOperationalTimeValue(left.item.plannedDeparture), maintenanceOperationalTimeValue(right.item.plannedDeparture), "desc");
      if (departure) return departure;
      const updated = String(right.item.updatedAt || right.item.createdAt || "")
        .localeCompare(String(left.item.updatedAt || left.item.createdAt || ""), "zh-CN", { numeric: true });
      return updated || left.index - right.index;
    }).map(entry => entry.item);
  }
  const [field, direction] = sortValue.split(":");
  const sortableFields = new Set(["aircraftNo", "stand", "plannedArrival", "plannedDeparture"]);
  if (!sortableFields.has(field)) return items;
  return items.map((item, index) => ({ item, index })).sort((left, right) => {
    const a = String(left.item[field] || "").trim();
    const b = String(right.item[field] || "").trim();
    if (!a && !b) return left.index - right.index;
    if (!a) return 1;
    if (!b) return -1;
    const compared = ["plannedArrival", "plannedDeparture"].includes(field)
      ? compareMaintenanceOptionalTime(maintenanceOperationalTimeValue(a), maintenanceOperationalTimeValue(b), direction)
      : a.localeCompare(b, "zh-CN", { numeric: true, sensitivity: "base" }) * (direction === "desc" ? -1 : 1);
    return compared || left.index - right.index;
  }).map(entry => entry.item);
}

function maintenanceSortOptionsHtml(selected) {
  return maintenanceSortOptions.map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

function maintenanceStatusMenuHtml(side, selectedStatuses) {
  const selected = selectedStatuses instanceof Set ? selectedStatuses : new Set();
  const selectedLabels = taskStatuses.filter(status => selected.has(status));
  const summary = selectedLabels.length === 1 ? selectedLabels[0] : `${selectedLabels.length} 个状态`;
  const sideLabel = side === "left" ? "左侧" : "右侧";
  return `<details class="maintenance-status-menu" data-maint-status-menu="${side}">
    <summary class="maintenance-status-filter" aria-label="${sideLabel}状态筛选" title="${escapeHtml(selectedLabels.join("、"))}">${escapeHtml(summary)}</summary>
    <div class="maintenance-status-options" role="group" aria-label="${sideLabel}状态筛选选项">${taskStatuses.map(status => `<label><input type="checkbox" data-maint-status-option="${side}" value="${escapeHtml(status)}" ${selected.has(status) ? "checked" : ""}><span>${escapeHtml(status)}</span></label>`).join("")}</div>
  </details>`;
}

function maintenanceOpportunityMenuHtml() {
  const selected = state.maintenanceOpportunityFilters instanceof Set
    ? state.maintenanceOpportunityFilters
    : new Set(maintenanceOpportunityOptions);
  if (!selected.size) maintenanceOpportunityOptions.forEach(item => selected.add(item));
  const selectedLabels = maintenanceOpportunityOptions.filter(item => selected.has(item));
  const summary = selectedLabels.length === maintenanceOpportunityOptions.length
    ? "全部维修机会"
    : selectedLabels.length === 1
      ? selectedLabels[0]
      : `已选 ${selectedLabels.length} 项`;
  return `<details class="maintenance-opportunity-menu">
    <summary class="maintenance-opportunity-filter" aria-label="维修机会筛选" title="${escapeHtml(selectedLabels.join("、"))}">${escapeHtml(summary)}</summary>
    <div class="maintenance-opportunity-options" role="group" aria-label="维修机会筛选选项">
      <button class="maintenance-opportunity-select-all" type="button" data-maint-opportunity-all>全部选择</button>
      ${maintenanceOpportunityOptions.map(item => `<label><input type="checkbox" data-maint-opportunity-option value="${escapeHtml(item)}" ${selected.has(item) ? "checked" : ""}><span>${escapeHtml(item)}</span></label>`).join("")}
    </div>
  </details>`;
}

function renderMaintenanceDispatch() {
  const currentFlightIds = new Set((state.maintenanceFlights || []).map(flight => flight.id));
  for (const flightId of state.maintenanceDispatchOpenNonroutineIds) {
    if (!currentFlightIds.has(flightId)) state.maintenanceDispatchOpenNonroutineIds.delete(flightId);
  }
  const search = state.maintenanceFlightSearch.trim().toLowerCase();
  const flights = (state.maintenanceFlights || []).filter(flight => {
    const opportunity = flight.workKind || flight.workType || "其他";
    const flightDate = inputDateValue(flight.date);
    if (state.maintenanceStartDate && flightDate < state.maintenanceStartDate) return false;
    if (state.maintenanceEndDate && flightDate > state.maintenanceEndDate) return false;
    if (state.maintenanceOpportunityFilters instanceof Set && !state.maintenanceOpportunityFilters.has(opportunity)) return false;
    if (!search) return true;
    const assignedNames = [
      ...(flight.assignments || []).map(item => item.userName),
      ...(flight.subtasks || []).flatMap(item => (item.assignments || []).map(assignment => assignment.userName))
    ];
    return [flight.flightNo, flight.aircraftNo, flight.stand, flight.aircraftType, opportunity, ...assignedNames]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
  const renderColumn = (side, selectedStatuses) => {
    const sortValue = side === "left" ? state.maintenanceLeftSort : state.maintenanceRightSort;
    const items = sortMaintenanceFlights(flights.filter(flight => selectedStatuses.has(flight.status || "未派工")), sortValue);
    return `<section class="maintenance-dispatch-column">
      <div class="maintenance-column-tools">
        ${maintenanceStatusMenuHtml(side, selectedStatuses)}
        <select class="maintenance-sort-filter" data-maint-sort-filter="${side}" aria-label="${side === "left" ? "左侧" : "右侧"}任务排序">${maintenanceSortOptionsHtml(sortValue)}</select>
        <span>${items.length} 项</span>
      </div>
      <div class="maintenance-list">${items.map(maintenanceFlightCard).join("") || '<div class="status-line">暂无符合筛选条件的任务。</div>'}</div>
    </section>`;
  };
  return `<section class="data-panel maintenance-panel">
    <div class="maintenance-dispatch-actions">
      <div class="maintenance-dispatch-filters">
        <div class="maintenance-date-filter">
          <span>日期</span>
          <div class="maintenance-date-inputs">
            <input id="maintenanceStartDateFilter" type="date" value="${escapeHtml(state.maintenanceStartDate || "")}" aria-label="航班开始日期">
            <span aria-hidden="true">–</span>
            <input id="maintenanceEndDateFilter" type="date" value="${escapeHtml(state.maintenanceEndDate || "")}" aria-label="航班结束日期">
          </div>
        </div>
        ${maintenanceOpportunityMenuHtml()}
        <input id="maintenanceFlightSearch" class="search" type="search" placeholder="航班 / 机号 / 机位 / 机型 / 人员" value="${escapeHtml(state.maintenanceFlightSearch)}" aria-label="搜索航班或被派工人员">
      </div>
      <div class="actions"><input id="maintenanceImportFile" type="file" accept=".xlsx,.csv" hidden><button class="btn secondary" type="button" data-maint-import>导入航班计划</button><button class="btn" type="button" data-maint-create-flight>新建维修机会</button></div>
    </div>
    <div class="maintenance-dispatch-board">${renderColumn("left", state.maintenanceLeftStatuses)}${renderColumn("right", state.maintenanceRightStatuses)}</div>
    ${state.maintenanceNextCursor ? '<div class="maintenance-list-more"><button class="btn secondary" type="button" data-maint-load-more>继续加载</button></div>' : ""}
  </section>`;
}

function renderMaintenanceExecute() {
  const groups = maintenanceAssignmentsForMe();
  const visibleFlightIds = new Set(groups.map(group => group.flight.id));
  if (!visibleFlightIds.has(state.maintenanceExecuteOpenFlightId)) state.maintenanceExecuteOpenFlightId = "";
  const executeDateKey = date => date || "__undated__";
  const visibleDates = new Set(groups.map(group => executeDateKey(group.flight.date)));
  if (!visibleDates.has(state.maintenanceExecuteOpenDate)) state.maintenanceExecuteOpenDate = "";
  const personNamesHtml = (entries, highlightSelf = true) => {
    const seen = new Set();
    const people = (entries || []).reduce((result, entry) => {
      const person = typeof entry === "string"
        ? { userId: "", userName: entry }
        : { userId: entry?.userId || "", userName: entry?.userName || entry?.name || "" };
      if (!person.userName) return result;
      const key = person.userId || `name:${person.userName}`;
      if (seen.has(key)) return result;
      seen.add(key);
      result.push(person);
      return result;
    }, []);
    if (!people.length) return "-";
    return people.map((person, index) => {
      const isSelf = highlightSelf && (
        (person.userId && person.userId === state.user?.id)
        || (!person.userId && person.userName === state.user?.name)
      );
      return `${index ? "、" : ""}<span class="execute-person-name${isSelf ? " is-self" : ""}">${escapeHtml(person.userName)}</span>`;
    }).join("");
  };
  const statusHtml = flight => maintenanceStatusBadge(flight.status || "已派工", "", "", "", flight);
  const personalCompleteHtml = flight => flight.status === "已提报"
    && flight.personalReportProgress?.allAssignedWorkComplete
    ? '<span class="execute-personal-complete-check" role="img" aria-label="个人相关工作已全部提报" title="个人相关工作已全部提报"></span>'
    : "";
  const nonroutineHtml = flight => {
    const batchEntries = flight.reportProgress?.batches?.nonroutine?.entries || [];
    const formalItems = (flight.subtasks || []).map(item => ({ ...item, draft: false }));
    const draftItems = (flight.nonroutineDraft?.items || []).map(item => ({
      ...item,
      id: item.clientId || item.id || "",
      assignments: item.entries || [],
      draft: true
    }));
    return [...formalItems, ...draftItems].map(item => {
      const entries = item.draft ? [] : batchEntries.filter(entry => entry.ownerId === item.id);
      const source = entries.length ? entries : (item.assignments || []);
      const grouped = new Map();
      source.forEach(entry => {
        if (!entry.role || !entry.userName) return;
        grouped.set(entry.role, [...(grouped.get(entry.role) || []), entry]);
      });
      const orderedRoles = [
        ...maintenanceSubtaskRoleOptions.filter(role => grouped.has(role)),
        ...[...grouped.keys()].filter(role => !maintenanceSubtaskRoleOptions.includes(role))
      ];
      const peopleHtml = orderedRoles.length
        ? orderedRoles.map(role => {
          return `<span class="execute-nonroutine-person-group"><strong>${escapeHtml(role)}：</strong><span>${personNamesHtml(grouped.get(role) || [])}</span></span>`;
        }).join("")
        : `<div class="execute-nonroutine-empty">尚未派工</div>`;
      return `<section class="execute-nonroutine-item ${item.draft ? "draft" : ""}">
        <div class="execute-nonroutine-head"><strong class="execute-nonroutine-title">${escapeHtml(item.title || "未填写标题")}</strong><small class="execute-nonroutine-meta">${escapeHtml(item.category || "非例行")} · ${escapeHtml(maintenanceStandardHoursLabel(item.standardHours))}</small>${item.draft ? '<span class="execute-nonroutine-draft-badge">草稿</span>' : ""}</div>
        <div class="execute-nonroutine-people">${peopleHtml}</div>
      </section>`;
    }).join("");
  };
  const mainWorkHtml = ({ flight, mainAssignments, mine, subtasks }) => {
    const hasTreeAssignment = Boolean(mine.length || subtasks.length);
    if (!hasTreeAssignment) return "";
    const progress = flight.reportProgress || {};
    const routineBatch = progress.batches?.routine;
    const releaseBatch = progress.batches?.release;
    const reportEntries = routineBatch?.entries?.length ? routineBatch.entries : mainAssignments.filter(item => item.role !== "放行");
    const peopleByRole = new Map();
    const releaseEntries = releaseBatch?.entries?.length ? releaseBatch.entries : mainAssignments.filter(item => item.role === "放行");
    releaseEntries.forEach(item => peopleByRole.set("放行", [...(peopleByRole.get("放行") || []), item]));
    reportEntries.forEach(item => peopleByRole.set(item.role, [...(peopleByRole.get(item.role) || []), item]));
    const roles = maintenanceRolesForOpportunity(flight.workKind || flight.workType || "其他").filter(role => peopleByRole.has(role));
    const submittedRoutineRoles = new Set((routineBatch?.entries || []).map(item => item.role));
    const release = mine.find(item => item.role === "放行");
    const canRoutine = progress.hasRoutine && !routineBatch && hasTreeAssignment;
    const canNonroutine = progress.hasFormalNonroutine && !progress.batches?.nonroutine && hasTreeAssignment;
    const canCreateNonroutine = !progress.hasFormalNonroutine && !progress.batches?.nonroutine && hasTreeAssignment && !["待复核", "已确认"].includes(flight.status);
    const finalizeBlockedByDraft = releaseBatch?.submittedBy === state.user.id && progress.hasNonroutineDraft && !flight.reportFinalizedAt;
    const canFinalize = releaseBatch?.submittedBy === state.user.id && progress.ready && !progress.hasNonroutineDraft && !flight.reportFinalizedAt;
    return `<section class="execute-main-work">
      <div class="execute-role-roster">${roles.map(role => {
        const submitted = role === "放行" ? Boolean(releaseBatch) : submittedRoutineRoles.has(role);
        return `<div class="execute-role-row ${submitted ? `submitted ${role === "放行" ? "release" : "routine"}` : ""}"><strong>${escapeHtml(role)}</strong><span>${personNamesHtml(peopleByRole.get(role) || [], role !== "放行")}</span></div>`;
      }).join("")}</div>
      <div class="execute-main-actions">
        ${canRoutine ? `<button class="btn secondary" type="button" data-maint-report="${escapeHtml(flight.id)}" data-report-type="routine">例行报工</button>` : ""}
        ${canNonroutine ? `<button class="btn secondary" type="button" data-maint-report="${escapeHtml(flight.id)}" data-report-type="nonroutine">非例行报工</button>` : ""}
        ${canCreateNonroutine ? `<button class="btn secondary" type="button" data-maint-report="${escapeHtml(flight.id)}" data-report-type="nonroutine-create">新增非例行报工</button>` : ""}
        ${release?.status === "已派工" && !releaseBatch ? `<button class="btn secondary" type="button" data-maint-release-confirm="${escapeHtml(release.id)}" data-maint-flight-id="${escapeHtml(flight.id)}">放行报工</button>` : releaseBatch ? `<span class="status-badge released">放行已提报</span>` : ""}
        ${finalizeBlockedByDraft ? `<button class="btn secondary" type="button" disabled title="存在未提交的非例行草稿，请先提交或删除草稿">报工确认</button><span class="execute-finalize-blocker">请先提交或删除非例行草稿</span>` : ""}
        ${canFinalize ? `<button class="btn" type="button" data-maint-report="${escapeHtml(flight.id)}" data-report-type="finalize">报工确认</button>` : ""}
      </div>
    </section>`;
  };
  const flightCardHtml = group => { const { flight } = group; const subtaskCount = (flight.subtasks || []).length; const draftCount = flight.nonroutineDraft?.items?.length || 0; const expanded = state.maintenanceExecuteOpenFlightId === flight.id; return `<article class="maintenance-card execute-flight-card ${expanded ? "expanded" : "collapsed"}">
      <button class="execute-flight-toggle" type="button" data-maint-execute-toggle="${escapeHtml(flight.id)}" aria-expanded="${expanded ? "true" : "false"}">
        <span class="maintenance-flight-identity">
          <strong><span class="maintenance-aircraft-no">${escapeHtml(flight.aircraftNo || "-")}</span><span class="maintenance-flight-separator"> · </span><span class="maintenance-flight-no">${escapeHtml(flight.flightNo || "-")}</span><span class="maintenance-flight-separator"> · </span><span class="maintenance-aircraft-type">${escapeHtml(flight.aircraftType || "-")}</span>${maintenanceFlightMonthDay(flight.date) ? `<span class="maintenance-flight-date"> · ${escapeHtml(maintenanceFlightMonthDay(flight.date))}</span>` : ""}</strong>
          <div class="maintenance-key-tags"><span class="maintenance-stand-tag">机位 ${escapeHtml(flight.stand || "-")}</span>${maintenanceOpportunityTag(flight)}<span class="maintenance-time-tag">落地 ${escapeHtml(flight.plannedArrival || "-")}</span><span class="maintenance-time-tag">起飞 ${escapeHtml(flight.plannedDeparture || "-")}</span></div>
        </span>
        <span class="execute-flight-head-meta">${personalCompleteHtml(flight)}${statusHtml(flight)}<span class="execute-subtask-count ${subtaskCount > 0 ? "has-items" : ""}">非例行 ${subtaskCount} 项</span>${draftCount ? `<span class="execute-subtask-count draft-count">草稿 ${draftCount} 项</span>` : ""}</span>
      </button>
      ${expanded ? `<div class="execute-flight-body">${mainWorkHtml(group)}${subtaskCount || draftCount ? `<div class="execute-subtask-heading">非例行${draftCount ? ` · 草稿 ${draftCount} 项` : ""}</div><div class="execute-nonroutine-list">${nonroutineHtml(flight)}</div>` : ""}</div>` : ""}
    </article>`; };
  const today = maintenanceLocalDateValue();
  const dateGroups = [];
  groups.forEach(group => {
    const date = group.flight.date || "";
    const current = dateGroups[dateGroups.length - 1];
    if (current?.date === date) current.items.push(group);
    else dateGroups.push({ date, items: [group] });
  });
  const listHtml = dateGroups.map(dateGroup => {
    if (dateGroup.date === today) return dateGroup.items.map(flightCardHtml).join("");
    const dateKey = executeDateKey(dateGroup.date);
    const open = state.maintenanceExecuteOpenDate === dateKey;
    const label = dateGroup.date || "未设置日期";
    return `<section class="execute-date-group ${open ? "open" : "collapsed"}">
      <button class="execute-date-toggle" type="button" data-maint-execute-date="${escapeHtml(dateKey)}" aria-expanded="${open ? "true" : "false"}">
        <span><strong>${escapeHtml(label)}</strong><small>${dateGroup.items.length} 项</small></span><span class="execute-date-toggle-icon" aria-hidden="true">${open ? "−" : "＋"}</span>
      </button>
      ${open ? `<div class="execute-date-items">${dateGroup.items.map(flightCardHtml).join("")}</div>` : ""}
    </section>`;
  }).join("");
  const timeAscending = state.maintenanceExecuteTimeSort === "asc";
  return `<section class="maintenance-panel maintenance-execute-panel">
    <div class="execute-list-tools"><button class="execute-time-sort" type="button" data-maint-execute-time-sort title="切换计划时间排序" aria-label="计划时间${timeAscending ? "正序" : "倒序"}">时间 <span aria-hidden="true">${timeAscending ? "↑" : "↓"}</span></button></div>
    <div class="maintenance-list execute-list">${listHtml || '<section class="data-panel execute-empty"><div class="status-line">暂无派给你的维修任务。</div></section>'}</div>
    ${state.maintenanceNextCursor ? '<div class="maintenance-list-more"><button class="btn secondary" type="button" data-maint-load-more>继续加载</button></div>' : ""}
  </section>`;
}

function renderMaintenanceHours() {
  const rules = state.maintenanceRules || [];
  const ruleByKey = new Map(rules.map(rule => [`${rule.rule_type}:${rule.name}`, rule]));
  const standardRules = maintenanceOpportunityOptions.map(name => ruleByKey.get(`workType:${name}`)).filter(Boolean);
  const nonroutineRules = maintenanceSubtaskRoleOptions.map(name => ruleByKey.get(`roleRatio:${name}`)).filter(Boolean);
  const fieldHtml = (rule, unit, step = "0.1") => `<label><span>${escapeHtml(rule.role || rule.name)}</span><span class="maintenance-rule-control"><input type="number" min="0" step="${step}" inputmode="decimal" data-maint-rule="${escapeHtml(rule.id)}" data-rule-type="${escapeHtml(rule.rule_type)}" data-rule-name="${escapeHtml(rule.name)}" ${rule.opportunity ? `data-rule-opportunity="${escapeHtml(rule.opportunity)}" data-rule-role="${escapeHtml(rule.role)}"` : ""} value="${escapeHtml(rule.value)}"><small>${escapeHtml(unit)}</small></span></label>`;
  const simpleGroup = (key, title, groupRules, unit) => `<details class="maintenance-rule-group" data-maint-rule-group="${escapeHtml(key)}" ${state.maintenanceRuleGroupsOpen.has(key) ? "open" : ""}>
    <summary><span><strong>${escapeHtml(title)}</strong><small>${groupRules.length} 项</small></span></summary>
    <div class="maintenance-rule-fields">${groupRules.map(rule => fieldHtml(rule, unit)).join("") || '<div class="status-line">暂无可配置规则。</div>'}</div>
  </details>`;
  const routineCategories = maintenanceOpportunityOptions.filter(opportunity => opportunity !== "停场");
  const routineCategoryHtml = routineCategories.map(opportunity => {
    const roles = maintenanceRolesForOpportunity(opportunity).filter(role => role !== "放行");
    const categoryRules = roles.map(role => rules.find(rule => rule.rule_type === "routineRatio" && rule.opportunity === opportunity && rule.role === role)).filter(Boolean);
    const total = categoryRules.reduce((sum, rule) => sum + Number(rule.value || 0), 0);
    const categoryKey = `routine:${opportunity}`;
    return `<details class="maintenance-rule-category" data-maint-rule-group="${escapeHtml(categoryKey)}" ${state.maintenanceRuleGroupsOpen.has(categoryKey) ? "open" : ""}>
      <summary><span><strong>${escapeHtml(opportunity)}</strong><small>${categoryRules.length} 项</small></span><span class="maintenance-rule-total">合计 ${maintenanceRatioLabel(total)}</span></summary>
      <div class="maintenance-rule-fields">${categoryRules.map(rule => fieldHtml(rule, "比例", "0.001")).join("") || '<div class="status-line">暂无可配置规则。</div>'}</div>
    </details>`;
  }).join("");
  const routineGroup = `<details class="maintenance-rule-group" data-maint-rule-group="routineRatio" ${state.maintenanceRuleGroupsOpen.has("routineRatio") ? "open" : ""}>
    <summary><span><strong>例行工种分配比例</strong><small>${routineCategories.length} 类</small></span></summary>
    <div class="maintenance-rule-category-list">${routineCategoryHtml}</div>
  </details>`;
  const groupHtml = `${simpleGroup("workType", "维修机会标准工时", standardRules, "小时")}${routineGroup}${simpleGroup("nonroutineRatio", "非例行工种分配比例", nonroutineRules, "比例")}`;
  return `<section class="data-panel maintenance-panel maintenance-rule-settings">
    <div class="panel-title"><div><strong>工时规则</strong><span>维护标准工时与人员分配比例。</span></div></div>
    <div class="maintenance-rule-groups">${groupHtml}</div>
    <div class="actions maintenance-rule-save"><button class="btn" type="button" data-maint-save-rules>保存工时规则</button></div>
  </section>`;
}

function maintenanceHoursLabel(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function maintenanceRatioLabel(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function maintenanceDataComparisonCard(kind, comparison = {}) {
  const labels = {
    team: ["班组贡献占比", "暂无班组数据", "当前账号尚未配置有效班组。"],
    workshop: ["车间个人排名", "不在车间统计范围", "车间统计仅包含一组、二组、三组和四组。"],
    teamRanking: ["所在班组排名", "不在班组排名范围", "班组排名仅包含一组、二组、三组和四组。"]
  };
  const [title, empty, explanation] = labels[kind] || labels.workshop;
  if (!comparison.available) {
    return `<article class="maintenance-comparison-card"><span class="maintenance-card-kicker">${title}</span><strong class="maintenance-comparison-empty">${empty}</strong><p>${explanation}</p></article>`;
  }
  const gap = comparison.isHighest ? "当前最高" : `距离上一名 ${maintenanceHoursLabel(comparison.gapHours)} 小时`;
  if (kind === "team") {
    return `<article class="maintenance-comparison-card"><span class="maintenance-card-kicker">班组贡献占比</span><div class="maintenance-comparison-main"><strong>${maintenanceHoursLabel(comparison.contributionPercent)}<small>%</small></strong><span>${escapeHtml(comparison.team || "班组")}</span></div><p>超过 <b>${maintenanceHoursLabel(comparison.exceededPercent)}%</b> 班组成员</p><p>${gap}</p></article>`;
  }
  if (kind === "teamRanking") {
    return `<article class="maintenance-comparison-card"><span class="maintenance-card-kicker">所在班组排名</span><div class="maintenance-comparison-main maintenance-rank-main"><strong><small>第</small><b>${escapeHtml(comparison.rank || "-")}</b><small>名</small></strong><span>/ ${escapeHtml(comparison.teamCount || 4)} 个班组</span></div><p>${escapeHtml(comparison.team || "班组")} · <b>${maintenanceHoursLabel(comparison.totalHours)} 小时</b></p><p>${gap}</p></article>`;
  }
  return `<article class="maintenance-comparison-card"><span class="maintenance-card-kicker">车间个人排名</span><div class="maintenance-comparison-main maintenance-rank-main"><strong><small>第</small><b>${escapeHtml(comparison.rank || "-")}</b><small>名</small></strong><span>/ ${escapeHtml(comparison.memberCount || 0)} 人</span></div><p>超过 <b>${maintenanceHoursLabel(comparison.exceededPercent)}%</b> 车间成员</p><p>${gap}</p></article>`;
}

function maintenanceTrendSvg(points = []) {
  if (!points.length) return '<div class="maintenance-chart-empty">所选范围暂无工时数据。</div>';
  const width = 760;
  const height = 282;
  const left = 48;
  const right = 24;
  const top = 28;
  const bottom = 48;
  const chartWidth = width - left - right;
  const pointSpan = points.length <= 1 ? 0 : Math.min(chartWidth, Math.max(180, (points.length - 1) * 70));
  const pointLeft = left + (chartWidth - pointSpan) / 2;
  const chartHeight = height - top - bottom;
  const max = Math.max(1, ...points.map(item => Number(item.total || 0) + Number(item.pendingTotal || 0)));
  const x = index => points.length === 1 ? left + chartWidth / 2 : pointLeft + index * pointSpan / (points.length - 1);
  const y = value => top + chartHeight - Number(value || 0) / max * chartHeight;
  const line = points.map((item, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(item.total).toFixed(1)}`).join(" ");
  const pendingLine = points.map((item, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(Number(item.total || 0) + Number(item.pendingTotal || 0)).toFixed(1)}`).join(" ");
  const hasPending = points.some(item => Number(item.pendingTotal || 0) > 0);
  const grid = [0, .25, .5, .75, 1].map(step => {
    const gy = top + chartHeight * (1 - step);
    return `<line x1="${left}" y1="${gy}" x2="${width - right}" y2="${gy}" class="maintenance-chart-grid"/><text x="${left - 9}" y="${gy + 4}" text-anchor="end" class="maintenance-chart-axis">${maintenanceHoursLabel(max * step)}</text>`;
  }).join("");
  const labelStep = Math.max(1, Math.ceil(points.length / 7));
  const marks = points.map((item, index) => {
    const px = x(index);
    const barWidth = Math.min(15, Math.max(8, chartWidth / Math.max(points.length, 1) / 5));
    const routineY = y(item.routine);
    const nonroutineY = y(item.nonroutine);
    const pendingRoutineY = y(Number(item.routine || 0) + Number(item.pendingRoutine || 0));
    const pendingNonroutineY = y(Number(item.nonroutine || 0) + Number(item.pendingNonroutine || 0));
    const pendingTotal = Number(item.pendingTotal || 0);
    return `<g>
      ${Number(item.routine || 0) ? `<rect class="maintenance-chart-bar routine" tabindex="0" role="button" aria-label="${escapeHtml(item.date)} 已确认例行 ${maintenanceHoursLabel(item.routine)} 小时" data-maint-personal-detail data-detail-status="confirmed" data-detail-date="${escapeHtml(item.date)}" data-detail-type="routine" x="${px - barWidth - 2}" y="${routineY}" width="${barWidth}" height="${top + chartHeight - routineY}" rx="2"/>` : ""}
      ${Number(item.pendingRoutine || 0) ? `<rect class="maintenance-chart-bar routine pending" tabindex="0" role="button" aria-label="${escapeHtml(item.date)} 待复核例行 ${maintenanceHoursLabel(item.pendingRoutine)} 小时" data-maint-personal-detail data-detail-status="pending" data-detail-date="${escapeHtml(item.date)}" data-detail-type="routine" x="${px - barWidth - 2}" y="${pendingRoutineY}" width="${barWidth}" height="${Math.max(0, routineY - pendingRoutineY)}" rx="2"/>` : ""}
      ${Number(item.nonroutine || 0) ? `<rect class="maintenance-chart-bar nonroutine" tabindex="0" role="button" aria-label="${escapeHtml(item.date)} 已确认非例行 ${maintenanceHoursLabel(item.nonroutine)} 小时" data-maint-personal-detail data-detail-status="confirmed" data-detail-date="${escapeHtml(item.date)}" data-detail-type="nonroutine" x="${px + 2}" y="${nonroutineY}" width="${barWidth}" height="${top + chartHeight - nonroutineY}" rx="2"/>` : ""}
      ${Number(item.pendingNonroutine || 0) ? `<rect class="maintenance-chart-bar nonroutine pending" tabindex="0" role="button" aria-label="${escapeHtml(item.date)} 待复核非例行 ${maintenanceHoursLabel(item.pendingNonroutine)} 小时" data-maint-personal-detail data-detail-status="pending" data-detail-date="${escapeHtml(item.date)}" data-detail-type="nonroutine" x="${px + 2}" y="${pendingNonroutineY}" width="${barWidth}" height="${Math.max(0, nonroutineY - pendingNonroutineY)}" rx="2"/>` : ""}
      ${Number(item.total || 0) ? `<circle class="maintenance-chart-point" tabindex="0" role="button" aria-label="${escapeHtml(item.date)} 已确认总工时 ${maintenanceHoursLabel(item.total)} 小时" data-maint-personal-detail data-detail-status="confirmed" data-detail-date="${escapeHtml(item.date)}" data-detail-type="all" cx="${px}" cy="${y(item.total)}" r="5"/>` : ""}
      ${pendingTotal ? `<circle class="maintenance-chart-point pending" tabindex="0" role="button" aria-label="${escapeHtml(item.date)} 待复核总工时 ${maintenanceHoursLabel(pendingTotal)} 小时" data-maint-personal-detail data-detail-status="pending" data-detail-date="${escapeHtml(item.date)}" data-detail-type="all" cx="${px}" cy="${y(Number(item.total || 0) + pendingTotal)}" r="4"/>` : ""}
      ${Number(item.total || 0) ? `<text x="${px}" y="${y(item.total) - 10}" text-anchor="middle" class="maintenance-chart-value">${maintenanceHoursLabel(item.total)}</text>` : ""}
      ${index % labelStep === 0 || index === points.length - 1 ? `<text x="${px}" y="${height - 18}" text-anchor="middle" class="maintenance-chart-axis">${escapeHtml(item.date.slice(5))}</text>` : ""}
    </g>`;
  }).join("");
  return `<div class="maintenance-trend-scroll"><svg class="maintenance-trend-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-label="每日工时趋势">${grid}${hasPending ? `<path d="${pendingLine}" class="maintenance-chart-line pending"/>` : ""}<path d="${line}" class="maintenance-chart-line"/>${marks}</svg></div>`;
}

function maintenanceCompositionView(composition = {}, period = "day", date = "") {
  const colors = ["#0F6B7D", "#38A169", "#3B82F6", "#8B5CF6", "#F59E0B", "#14B8A6", "#64748B", "#EC4899", "#84CC16", "#6366F1", "#F97316"];
  const items = composition.items || [];
  if (!items.length) return '<div class="maintenance-chart-empty">当前周期暂无工时数据。</div>';
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const rings = items.map((item, index) => {
    const length = circumference * Number(item.percent || 0) / 100;
    const circle = `<circle class="maintenance-donut-segment" tabindex="0" role="button" data-maint-personal-detail data-detail-status="confirmed" data-detail-period="${period}" data-detail-date="${period === "day" ? escapeHtml(date) : ""}" data-detail-category="${escapeHtml(item.category)}" cx="70" cy="70" r="${radius}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="22" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}"/>`;
    offset += length;
    return circle;
  }).join("");
  return `<div class="maintenance-composition-layout"><div class="maintenance-donut-wrap"><svg viewBox="0 0 140 140" aria-label="工时构成"><circle cx="70" cy="70" r="${radius}" fill="none" stroke="#EDF1F5" stroke-width="22"/>${rings}<text x="70" y="67" text-anchor="middle" class="maintenance-donut-total">${maintenanceHoursLabel(composition.total)}</text><text x="70" y="85" text-anchor="middle" class="maintenance-donut-unit">小时</text></svg>${Number(composition.pendingTotal || 0) ? `<span class="maintenance-pending-summary">+ ${maintenanceHoursLabel(composition.pendingTotal)} 小时待复核</span>` : ""}</div><div class="maintenance-composition-legend">${items.map((item, index) => `<div class="maintenance-composition-item"><button type="button" data-maint-personal-detail data-detail-status="confirmed" data-detail-period="${period}" data-detail-date="${period === "day" ? escapeHtml(date) : ""}" data-detail-category="${escapeHtml(item.category)}"><i style="background:${colors[index % colors.length]}"></i><strong>${escapeHtml(item.category)}</strong><span>${maintenanceHoursLabel(item.hours)} 小时</span><small>${maintenanceHoursLabel(item.percent)}%</small></button>${Number(item.pendingHours || 0) ? `<button class="maintenance-composition-pending" type="button" data-maint-personal-detail data-detail-status="pending" data-detail-period="${period}" data-detail-date="${period === "day" ? escapeHtml(date) : ""}" data-detail-category="${escapeHtml(item.category)}">+ ${maintenanceHoursLabel(item.pendingHours)} 小时待复核</button>` : ""}</div>`).join("")}</div></div>`;
}

function renderMaintenanceData() {
  const personal = state.maintenancePersonalStats || { metrics: {}, period: {}, trend: [], composition: {}, teamComparison: {}, workshopComparison: {}, teamRanking: {} };
  const view = state.maintenanceDataView || "personal";
  const monthText = String(personal.period?.month || state.maintenanceMonth || "").replace("-", "年") + "月";
  const toolbar = `<div class="maintenance-data-toolbar"><div class="maintenance-data-subtabs" role="tablist">${[["personal", "个人"], ["team", "班组"], ["workshop", "车间"]].map(([key, label]) => `<button type="button" role="tab" aria-selected="${view === key}" class="${view === key ? "active" : ""}" data-maint-data-view="${key}">${label}</button>`).join("")}</div><label class="maintenance-data-month"><span>统计月份</span><input id="maintenanceDataMonth" type="month" value="${escapeHtml(state.maintenanceMonth || "")}"></label></div>`;
  if (view !== "personal") return `<section class="maintenance-data-dashboard">${toolbar}<div class="maintenance-data-placeholder"><strong>${view === "team" ? "班组数据" : "车间数据"}</strong><span>页面结构已预留，后续继续设计。</span></div></section>`;
  const metrics = personal.metrics || {};
  const compositionPeriod = state.maintenanceCompositionPeriod === "month" ? "month" : "day";
  const chartView = state.maintenanceDataChartView === "trend" ? "trend" : "composition";
  const pendingHours = (value, detail = {}) => Number(value || 0) ? `<button class="personal-metric-pending actionable" type="button" data-maint-personal-detail data-detail-status="pending" data-detail-type="all"${detail.date ? ` data-detail-date="${escapeHtml(detail.date)}"` : ""}${detail.period ? ` data-detail-period="${escapeHtml(detail.period)}"` : ""}>+ ${maintenanceHoursLabel(value)} 小时待复核</button>` : "";
  const pendingSorties = value => Number(value || 0) ? `<button class="personal-metric-pending actionable" type="button" data-maint-personal-detail data-detail-status="pending" data-detail-type="sortie">+ ${maintenanceHoursLabel(value)} 架次待复核</button>` : "";
  const chartTabs = `<div class="maintenance-insight-tabs" role="tablist">${[["composition", "工时构成"], ["trend", "工时趋势"]].map(([key, label]) => `<button type="button" role="tab" aria-selected="${chartView === key}" class="${chartView === key ? "active" : ""}" data-maint-data-chart="${key}">${label}</button>`).join("")}</div>`;
  const chartBody = chartView === "composition"
    ? `<div class="maintenance-chart-head"><div><span>${compositionPeriod === "day" ? "真实今日" : escapeHtml(monthText)}</span></div><div class="maintenance-segmented">${[["day", "当日"], ["month", "当月"]].map(([key, label]) => `<button type="button" class="${compositionPeriod === key ? "active" : ""}" data-maint-composition-period="${key}">${label}</button>`).join("")}</div></div>${maintenanceCompositionView(personal.composition?.[compositionPeriod], compositionPeriod, personal.period?.today || "")}`
    : `<div class="maintenance-chart-head"><div><span class="maintenance-chart-legend"><i class="total"></i>已确认总工时<i class="routine"></i>例行<i class="nonroutine"></i>非例行<i class="pending"></i>待复核附加</span></div><div class="maintenance-segmented">${[["half", "半个月"], ["month", "整月"]].map(([key, label]) => `<button type="button" class="${state.maintenanceDataRange === key ? "active" : ""}" data-maint-data-range="${key}">${label}</button>`).join("")}</div></div>${maintenanceTrendSvg(personal.trend || [])}`;
  return `<section class="maintenance-data-dashboard">${toolbar}
    <section class="maintenance-personal-metrics">
      <article class="personal-metric-card"><span>今日工时</span><button class="personal-metric-main-action" type="button" data-maint-personal-detail data-detail-status="confirmed" data-detail-type="all" data-detail-date="${escapeHtml(personal.period?.today || "")}"><strong>${maintenanceHoursLabel(metrics.todayHours)}<small>小时</small></strong><em>${escapeHtml(personal.period?.today || "")}</em></button>${pendingHours(metrics.pendingTodayHours, { date: personal.period?.today || "" })}</article>
      <article class="personal-metric-card"><span>本月工时</span><button class="personal-metric-main-action" type="button" data-maint-personal-detail data-detail-status="confirmed" data-detail-type="all" data-detail-period="month"><strong>${maintenanceHoursLabel(metrics.monthHours)}<small>小时</small></strong><em>${escapeHtml(monthText)}</em></button>${pendingHours(metrics.pendingMonthHours, { period: "month" })}</article>
      <article class="personal-metric-card"><span>月度放行架次</span><button class="personal-metric-main-action" type="button" data-maint-personal-detail data-detail-status="confirmed" data-detail-type="sortie"><strong>${escapeHtml(metrics.monthSorties || 0)}<small>架次</small></strong><em>${escapeHtml(monthText)}</em></button>${pendingSorties(metrics.pendingMonthSorties)}</article>
    </section>
    <section class="maintenance-comparison-grid">${maintenanceDataComparisonCard("team", personal.teamComparison)}${maintenanceDataComparisonCard("workshop", personal.workshopComparison)}${maintenanceDataComparisonCard("teamRanking", personal.teamRanking)}</section>
    <section class="maintenance-chart-card maintenance-insights-card">${chartTabs}${chartBody}</section>
  </section>`;
}

let maintenanceDataDetailScrollLock = null;

function lockMaintenanceDataDetailBackground() {
  if (maintenanceDataDetailScrollLock) return;
  const body = document.body;
  const root = document.documentElement;
  const scrollY = window.scrollY;
  maintenanceDataDetailScrollLock = {
    scrollY,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyWidth: body.style.width,
    bodyOverflow: body.style.overflow,
    rootOverflow: root.style.overflow
  };
  root.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.width = "100%";
  body.style.overflow = "hidden";
}

function unlockMaintenanceDataDetailBackground() {
  const lock = maintenanceDataDetailScrollLock;
  if (!lock) return;
  const body = document.body;
  const root = document.documentElement;
  body.style.position = lock.bodyPosition;
  body.style.top = lock.bodyTop;
  body.style.width = lock.bodyWidth;
  body.style.overflow = lock.bodyOverflow;
  root.style.overflow = lock.rootOverflow;
  maintenanceDataDetailScrollLock = null;
  window.scrollTo(0, lock.scrollY);
}

function ensureMaintenanceDataDetailDialog() {
  let dialog = $("#maintenanceDataDetailDialog");
  if (!dialog) {
    document.body.insertAdjacentHTML("beforeend", `<dialog id="maintenanceDataDetailDialog" class="maintenance-data-detail-dialog"><div class="dialog-body" id="maintenanceDataDetailDialogBody"></div></dialog>`);
    dialog = $("#maintenanceDataDetailDialog");
    dialog.addEventListener("close", unlockMaintenanceDataDetailBackground);
  }
  return dialog;
}

function maintenancePersonalHourGroups(rows = []) {
  const groups = new Map();
  rows.forEach((row, index) => {
    const key = row.flightId ? `flight:${row.flightId}` : `row:${row.id || index}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        date: row.date || "",
        flightNo: row.flightNo || "-",
        aircraftNo: row.aircraftNo || "-",
        opportunity: row.opportunity || "其他",
        hours: 0,
        types: new Set(),
        items: []
      };
      groups.set(key, group);
    }
    group.hours += Number(row.hours || 0);
    group.types.add(row.type === "nonroutine" ? "nonroutine" : "routine");
    group.items.push(row);
  });
  return Array.from(groups.values()).map(group => ({ ...group, hours: Number(group.hours.toFixed(2)) }));
}

function maintenancePersonalHourItemHtml(row) {
  const type = row.type === "nonroutine" ? "nonroutine" : "routine";
  const primary = type === "nonroutine" ? (row.taskName || "非例行") : (row.role || row.category || "例行");
  const metadata = type === "nonroutine"
    ? [row.role, row.category].filter((value, index, values) => value && value !== primary && values.indexOf(value) === index)
    : [row.category].filter(value => value && value !== primary);
  return `<div class="maintenance-detail-work-item">
    <div><strong>${escapeHtml(primary)}</strong>${metadata.length ? `<span>${metadata.map(escapeHtml).join(" · ")}</span>` : ""}</div>
    <div><b>${maintenanceHoursLabel(row.hours)} 小时</b><em class="maintenance-detail-status ${row.status === "已确认" ? "confirmed" : "pending"}">${escapeHtml(row.status)}</em></div>
  </div>`;
}

function maintenancePersonalHourGroupHtml(group) {
  const kindBadges = Array.from(group.types).map(type => `<i class="maintenance-detail-kind ${type}">${type === "nonroutine" ? "非例行" : "例行"}</i>`).join("");
  return `<article class="maintenance-hour-detail-group">
    <div><strong>${escapeHtml(group.date)} · ${escapeHtml(group.flightNo)} · ${escapeHtml(group.aircraftNo)}</strong><span class="maintenance-detail-task-line">${kindBadges}<span>${escapeHtml(group.opportunity)}</span></span></div>
    <div class="maintenance-detail-group-total"><span>合计</span><b>${maintenanceHoursLabel(group.hours)} 小时</b></div>
    <div class="maintenance-detail-work-items">${group.items.map(maintenancePersonalHourItemHtml).join("")}</div>
  </article>`;
}

async function openMaintenanceDataDetails(trigger) {
  const dialog = ensureMaintenanceDataDetailDialog();
  const body = $("#maintenanceDataDetailDialogBody");
  const params = {
    month: state.maintenanceMonth || "",
    type: trigger.dataset.detailType || "all",
    status: trigger.dataset.detailStatus || "confirmed"
  };
  if (trigger.dataset.detailDate) params.date = trigger.dataset.detailDate;
  if (trigger.dataset.detailCategory) params.category = trigger.dataset.detailCategory;
  if (trigger.dataset.detailPeriod) params.period = trigger.dataset.detailPeriod;
  body.innerHTML = `<div class="dialog-head"><h2>数据明细</h2><button class="icon-btn" data-close="maintenanceDataDetailDialog" type="button">×</button></div><div class="maintenance-detail-loading">正在读取...</div>`;
  lockMaintenanceDataDetailBackground();
  dialog.showModal();
  try {
    const result = await maintenanceService.getPersonalDetails(params);
    const rows = result.rows || [];
    const detailRowsHtml = result.unit === "架次"
      ? rows.map(row => `<article><div><strong>${escapeHtml(row.date)}</strong><span>${escapeHtml(row.flightNo)} · ${escapeHtml(row.aircraftNo)} · ${escapeHtml(row.aircraftType || "-")}</span></div><div><span>${escapeHtml(row.opportunity)}</span><b>1 架次</b><em class="maintenance-detail-status ${row.status === "已确认" ? "confirmed" : "pending"}">${escapeHtml(row.status)}</em></div></article>`).join("")
      : maintenancePersonalHourGroups(rows).map(maintenancePersonalHourGroupHtml).join("");
    body.innerHTML = `<div class="dialog-head"><h2>${escapeHtml(result.title || "数据明细")}</h2><button class="icon-btn" data-close="maintenanceDataDetailDialog" type="button">×</button></div>
      ${result.unit === "小时" ? `<div class="maintenance-detail-summary">合计 <strong>${maintenanceHoursLabel(result.total)} 小时</strong></div>` : `<div class="maintenance-detail-summary">合计 <strong>${rows.length} 架次</strong></div>`}
      <div class="maintenance-personal-detail-list">${detailRowsHtml || '<div class="maintenance-chart-empty">没有对应记录。</div>'}</div>`;
  } catch (error) {
    body.innerHTML = `<div class="dialog-head"><h2>数据明细</h2><button class="icon-btn" data-close="maintenanceDataDetailDialog" type="button">×</button></div><div class="status-line error">${escapeHtml(error.message)}</div>`;
  }
}

function renderMaintenance() {
  const panel = $("#maintenancePanel");
  if (!panel) return;
  if (!canView("maintenancePage")) {
    panel.innerHTML = `<section class="data-panel"><div class="status-line">当前账号未授权维修管控模块。</div></section>`;
    return;
  }
  const tabs = maintenanceAllowedTabs();
  if (!tabs.some(([key]) => key === state.maintenanceTab)) state.maintenanceTab = tabs[0]?.[0] || "data";
  const body = { dispatch: renderMaintenanceDispatch, execute: renderMaintenanceExecute, hours: renderMaintenanceHours, data: renderMaintenanceData }[state.maintenanceTab]?.() || "";
  panel.innerHTML = `<div class="maintenance-tabs">${tabs.map(([key, label]) => `<button class="chip ${state.maintenanceTab === key ? "active" : ""}" type="button" data-maint-tab="${key}">${label}</button>`).join("")}</div>${body}`;
}

function syncPeopleScopedState() {
  const teams = new Set(["全部", ...normalizePeople(state.settings.people || []).map(person => person.team).filter(Boolean)]);
  if (!teams.has(state.statsTeam)) state.statsTeam = "全部";
}

async function loadActivePageData({ force = true } = {}) {
  const loaded = state.loadedData instanceof Set ? state.loadedData : (state.loadedData = new Set());
  const page = state.activePage;
  const recordPage = ["homePage", "infoPage"].includes(page);
  if (recordPage && (force || !loaded.has("records"))) {
    state.records = await recordService.list();
    state.user = authService.withSettings(state.user);
    loaded.add("records");
    loaded.add("settings");
  } else if (force || !loaded.has("settings")) {
    state.settings = await settingsService.get();
    state.user = authService.withSettings(state.user);
    loaded.add("settings");
  }
  if (page === "fixedPage" && (force || !loaded.has("fixedProjects"))) {
    state.fixedProjects = await fixedProjectService.list();
    loaded.add("fixedProjects");
  }
  if (page === "settingsPage" && (force || !loaded.has("users"))) {
    state.users = await userService.list();
    loaded.add("users");
  }
  if (page === "maintenancePage" && (force || !loaded.has(`maintenance:${state.maintenanceTab}`))) {
    await maintenanceService.load();
    loaded.add(`maintenance:${state.maintenanceTab}`);
  }
}

function renderActivePage() {
  renderShell();
  renderEntryOptions();
  if (["homePage", "infoPage"].includes(state.activePage)) {
    renderHome();
    renderRecords();
    renderStats();
  } else if (state.activePage === "settingsPage") {
    renderSettings();
  } else if (state.activePage === "fixedPage") {
    renderFixedProjects();
  } else if (state.activePage === "maintenancePage") {
    renderMaintenance();
  }
}

async function renderAll(options = {}) {
  if (!isLoggedIn()) {
    renderShell();
    return;
  }
  clearAllDeferredReclassify();
  await loadActivePageData(options);
  syncPeopleScopedState();
  renderActivePage();
  startMaintenanceSync();
}

const pullRefreshGesture = {
  tracking: false,
  refreshing: false,
  startX: 0,
  startY: 0,
  distance: 0,
  settleTimer: null
};
const PULL_REFRESH_THRESHOLD = 72;
const PULL_REFRESH_MAX_OFFSET = 96;
const PULL_REFRESH_HOLD_OFFSET = 48;

function pullRefreshScrollTop() {
  return Math.max(0, window.scrollY || document.scrollingElement?.scrollTop || 0);
}

function pullRefreshBlocked(target) {
  if (!isLoggedIn() || !document.body.classList.contains("app-ready")) return true;
  if (document.body.classList.contains("pull-refresh-settling")) return true;
  if (document.querySelector("dialog[open]")) return true;
  if (!(target instanceof Element)) return false;
  return !!target.closest("input,textarea,select,button,a,[contenteditable='true'],[role='textbox'],.rich-editor,.viewer-content");
}

function setPullRefreshVisual(offset, text = "下拉刷新") {
  const safeOffset = Math.max(0, Math.min(PULL_REFRESH_MAX_OFFSET, Number(offset) || 0));
  document.body.style.setProperty("--pull-refresh-offset", `${safeOffset}px`);
  const indicator = $("#pullRefreshIndicator");
  const label = $("#pullRefreshText");
  if (indicator) indicator.setAttribute("aria-hidden", safeOffset > 0 || pullRefreshGesture.refreshing ? "false" : "true");
  if (label) label.textContent = text;
}

function settlePullRefresh(delay = 0) {
  window.clearTimeout(pullRefreshGesture.settleTimer);
  pullRefreshGesture.tracking = false;
  pullRefreshGesture.distance = 0;
  document.body.classList.remove("pull-refresh-tracking", "pull-refresh-ready", "pull-refresh-refreshing");
  document.body.classList.add("pull-refresh-settling");
  pullRefreshGesture.settleTimer = window.setTimeout(() => {
    setPullRefreshVisual(0);
    window.setTimeout(() => {
      document.body.classList.remove("pull-refresh-settling");
      $("#pullRefreshIndicator")?.setAttribute("aria-hidden", "true");
    }, 230);
  }, delay);
}

async function performPullRefresh() {
  if (pullRefreshGesture.refreshing) return;
  pullRefreshGesture.refreshing = true;
  pullRefreshGesture.tracking = false;
  document.body.classList.remove("pull-refresh-tracking", "pull-refresh-ready");
  document.body.classList.add("pull-refresh-refreshing");
  setPullRefreshVisual(PULL_REFRESH_HOLD_OFFSET, "正在刷新");
  try {
    await renderAll({ force: true });
    setPullRefreshVisual(PULL_REFRESH_HOLD_OFFSET, "刷新完成");
    settlePullRefresh(420);
  } catch (error) {
    setPullRefreshVisual(PULL_REFRESH_HOLD_OFFSET, "刷新失败");
    settlePullRefresh(720);
    window.setTimeout(() => alert(`刷新失败：${error.message}`), 0);
  } finally {
    pullRefreshGesture.refreshing = false;
  }
}

function handlePullRefreshStart(event) {
  if (pullRefreshGesture.refreshing || event.touches.length !== 1 || pullRefreshScrollTop() > 0 || pullRefreshBlocked(event.target)) return;
  const touch = event.touches[0];
  pullRefreshGesture.tracking = true;
  pullRefreshGesture.startX = touch.clientX;
  pullRefreshGesture.startY = touch.clientY;
  pullRefreshGesture.distance = 0;
}

function handlePullRefreshMove(event) {
  if (!pullRefreshGesture.tracking || pullRefreshGesture.refreshing || event.touches.length !== 1) return;
  const touch = event.touches[0];
  const deltaX = touch.clientX - pullRefreshGesture.startX;
  const deltaY = touch.clientY - pullRefreshGesture.startY;
  if (deltaY <= 0 || Math.abs(deltaX) >= Math.abs(deltaY) || pullRefreshScrollTop() > 0) {
    settlePullRefresh();
    return;
  }
  if (event.cancelable) event.preventDefault();
  pullRefreshGesture.distance = deltaY;
  const ready = deltaY >= PULL_REFRESH_THRESHOLD;
  document.body.classList.add("pull-refresh-tracking");
  document.body.classList.toggle("pull-refresh-ready", ready);
  setPullRefreshVisual(Math.min(PULL_REFRESH_MAX_OFFSET, deltaY), ready ? "松开刷新" : "下拉刷新");
}

function handlePullRefreshEnd() {
  if (!pullRefreshGesture.tracking || pullRefreshGesture.refreshing) return;
  if (pullRefreshGesture.distance >= PULL_REFRESH_THRESHOLD) performPullRefresh();
  else settlePullRefresh();
}

document.addEventListener("touchstart", handlePullRefreshStart, { passive: true });
document.addEventListener("touchmove", handlePullRefreshMove, { passive: false });
document.addEventListener("touchend", handlePullRefreshEnd, { passive: true });
document.addEventListener("touchcancel", () => {
  if (pullRefreshGesture.tracking && !pullRefreshGesture.refreshing) settlePullRefresh();
}, { passive: true });

async function showPage(page) {
  state.activePage = canView(page) ? page : "homePage";
  await renderAll({ force: false });
}

async function showSubpage(subpage) {
  if (!canViewSubpage(subpage)) subpage = "infoListSubpage";
  state.activeSubpage = subpage;
  await renderAll({ force: false });
}

function openInfoFromHome(filter) {
  clearAllDeferredReclassify();
  state.activePage = canView("infoPage") ? "infoPage" : "homePage";
  state.activeSubpage = "infoListSubpage";
  state.statusFilter = filter || "全部";
  state.activeMonth = "全部";
  state.selectedCategories.clear();
  state.page = 1;
  const search = $("#searchInput");
  if (search) search.value = "";
  renderShell();
  renderRecords();
  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
}

function resetRecordForm() {
  $("#entryForm").reset();
  $("#entryId").value = "";
  state.recordFiles.length = 0;
  renderPending(state.recordFiles, $("#recordPending"));
  renderExistingRecordAttachments(null);
  setRecipientSelection(normalizePeople(state.settings.people || []).map(person => person.id));
  renderEntryOptions();
  $("#entryDate").value = inputDateValue();
}

function openRecordForm(record) {
  resetRecordForm();
  $("#entryTitleText").textContent = record ? "修改信息" : "发布信息";
  if (record) {
    $("#entryId").value = record.id;
    $("#entryDate").value = inputDateValue(record.date);
    $("#entryCategory").value = record.category;
    $("#entryTitle").value = record.title;
    $("#entryOriginal").value = record.original;
    $("#entryPriority").value = record.priority || "普通";
    const ids = new Set((record.recipients || []).map(person => person.id));
    setRecipientSelection(Array.from(ids));
    renderExistingRecordAttachments(record);
  }
  $("#entryDialog").showModal();
}

function resetFixedForm() {
  $("#fixedForm").reset();
  $("#fixedId").value = "";
  $("#fixedContent").innerHTML = "";
  state.fixedFiles.length = 0;
  renderPending(state.fixedFiles, $("#fixedPending"));
}

function openFixedForm(project) {
  resetFixedForm();
  $("#fixedDialogTitle").textContent = project ? "修改固化项目" : "新增固化项目";
  $("#fixedId").value = project?.id || "";
  $("#fixedAta").value = project?.ata || "00";
  $("#fixedTitle").value = project?.title || "";
  $("#fixedContent").innerHTML = sanitizeRichHtml(project?.contentHtml || "");
  $("#fixedReferences").value = project?.references || "";
  $("#fixedDialog").showModal();
}

function renderPending(files, container) {
  container.innerHTML = files.map((file, index) => `<div class="pending-file"><span class="pending-file-name">${escapeHtml(file.name)}</span><span>${Math.max(1, Math.round(file.size / 1024))} KB</span><button class="link-btn" type="button" data-remove-pending="${index}">移除</button></div>`).join("");
}

function setupDrop(zone, input, files, list) {
  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    files.push(...Array.from(input.files || []));
    input.value = "";
    renderPending(files, list);
  });
  ["dragenter", "dragover"].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove("dragging"); }));
  zone.addEventListener("drop", event => {
    files.push(...Array.from(event.dataTransfer?.files || []));
    renderPending(files, list);
  });
  list.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-pending]");
    if (!button) return;
    files.splice(Number(button.dataset.removePending), 1);
    renderPending(files, list);
  });
}

function readFileAsDataUrl(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

async function fileToAttachment(file, ownerType, ownerId) {
  return { name: file.name, type: file.type || "application/octet-stream", size: file.size, ownerType, ownerId, file };
}

async function attachmentsFrom(files, ownerType, ownerId) {
  return Promise.all(files.map(file => fileToAttachment(file, ownerType, ownerId)));
}

async function uploadFiles(ownerType, ownerId, files, onProgress = null) {
  if (!files.length) return [];
  const apiType = ownerType === "fixedProject" ? "fixed-projects" : "records";
  const uploaded = [];
  for (const [index, file] of files.entries()) {
    onProgress?.(`正在上传附件 ${index + 1}/${files.length}`);
    try {
      let presigned = null;
      try {
        presigned = await apiRequest(`/${apiType}/${encodeURIComponent(ownerId)}/attachments/presign`, {
          method: "POST",
          body: { name: file.name, type: file.type || "application/octet-stream", size: file.size }
        });
      } catch (error) {
        if (error.status !== 409) throw error;
      }
      if (presigned?.uploadUrl) {
        const put = await fetch(presigned.uploadUrl, {
          method: "PUT",
          headers: presigned.headers || { "Content-Type": file.type || "application/octet-stream" },
          body: file
        });
        if (!put.ok) throw new Error(`COS 上传失败（${put.status}）`);
        const completed = await apiRequest(`/${apiType}/${encodeURIComponent(ownerId)}/attachments/complete`, {
          method: "POST",
          body: {
            attachmentId: presigned.attachmentId,
            objectKey: presigned.objectKey,
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size
          }
        });
        if (completed.attachment) uploaded.push(completed.attachment);
      } else {
        const form = new FormData();
        form.append("file", file, file.name);
        const data = await apiRequest(`/${apiType}/${encodeURIComponent(ownerId)}/attachments`, { method: "POST", body: form });
        uploaded.push(...(data.attachments || []));
      }
    } catch (error) {
      throw new Error(`${file.name}：${error.message}`);
    }
  }
  return uploaded;
}

function collectQueuedFiles(queue, input) {
  const files = Array.from(input?.files || []);
  if (files.length) {
    queue.push(...files);
    input.value = "";
  }
  return queue;
}

function allAttachmentOwners() {
  return [...state.records, ...state.fixedProjects];
}

function findAttachment(id, ownerType = "", ownerId = "") {
  const owners = ownerId ? allAttachmentOwners().filter(owner => owner.id === ownerId) : allAttachmentOwners();
  for (const owner of owners) {
    const file = (owner.attachments || []).find(item => item.id === id || item.attachmentId === id || item.name === id);
    if (file) return file;
  }
  return null;
}

async function attachmentSource(file) {
  if (!file) return "";
  if (file.storage === "cos" && (file.id || file.attachmentId)) {
    const attachmentId = file.id || file.attachmentId;
    const access = await apiRequest(`/attachments/${encodeURIComponent(attachmentId)}/access`);
    return apiUrl(access.url || "");
  }
  return apiUrl(file.url || file.dataUrl || "");
}

async function attachmentBlob(file, sourceOverride = "") {
  if (!file) return "";
  const source = sourceOverride || await attachmentSource(file);
  if (source && source.startsWith("data:")) {
    try {
      return await (await fetch(source)).blob();
    } catch {
      return null;
    }
  }
  if (source) {
    try {
      const targetOrigin = new URL(source, location.href).origin;
      const response = await fetch(source, { credentials: targetOrigin === location.origin ? "include" : "omit" });
      if (!response.ok) return null;
      return await response.blob();
    } catch {
      return null;
    }
  }
  return null;
}

function decodeAttachmentText(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {}
  try {
    return new TextDecoder("gb18030", { fatal: true }).decode(bytes);
  } catch {
    return "";
  }
}

function isImageAttachment(file, name = "") {
  return String(file?.type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name || file?.name || "");
}

function attachmentExt(file, name = "") {
  const target = String(name || file?.name || "").toLowerCase();
  return (target.match(/\.([a-z0-9]+)$/) || ["", ""])[1];
}

function isPdfAttachment(file, name = "") {
  return String(file?.type || "") === "application/pdf" || attachmentExt(file, name) === "pdf";
}

function isVideoAttachment(file, name = "") {
  return String(file?.type || "").startsWith("video/") || ["mp4", "mov", "webm", "m4v", "ogg"].includes(attachmentExt(file, name));
}

function isAudioAttachment(file, name = "") {
  return String(file?.type || "").startsWith("audio/") || ["mp3", "wav", "m4a", "aac", "oga", "ogg"].includes(attachmentExt(file, name));
}

function isTextAttachment(file, name = "") {
  return String(file?.type || "").startsWith("text/") || ["txt", "csv", "log", "md"].includes(attachmentExt(file, name));
}

function fileSizeText(size = 0) {
  if (!size) return "未知大小";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

function mimeFromPath(path = "") {
  const ext = path.toLowerCase().split(".").pop();
  return {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml"
  }[ext] || "application/octet-stream";
}

function downloadLink(src, file) {
  return src && src !== "#" ? `<p><a class="link-btn" href="${escapeHtml(src)}" download="${escapeHtml(file?.name || "附件")}" target="_blank">下载 / 外部打开</a></p>` : "";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setViewerDownload(src, name) {
  state.viewerDownloadUrl = src && src !== "#" ? src : "";
  state.viewerDownloadName = name || "附件";
  const link = $("#viewerDownload");
  if (!link) return;
  if (state.viewerDownloadUrl) {
    link.href = state.viewerDownloadUrl;
    link.download = state.viewerDownloadName;
    link.hidden = false;
  } else {
    link.removeAttribute("href");
    link.hidden = true;
  }
}

function applyViewerZoom() {
  const scale = $("#viewerScale");
  const label = $("#viewerZoomReset");
  const zoomButtons = [$("#viewerZoomOut"), $("#viewerZoomIn"), $("#viewerZoomReset")];
  const isNativePdf = state.viewerMode === "pdf-native";
  zoomButtons.forEach(button => {
    if (button) button.hidden = isNativePdf;
  });
  if (isNativePdf) {
    if (scale) {
      scale.style.transform = "none";
      scale.style.width = "100%";
      scale.style.height = "100%";
    }
    if (label) {
      label.hidden = false;
      label.disabled = true;
      label.textContent = "PDF";
    }
    return;
  }
  if (label) label.disabled = false;
  if (scale) {
    scale.style.transform = `scale(${state.viewerZoom})`;
    if (state.viewerMode === "image-fit") {
      scale.style.width = "100%";
      scale.style.height = "100%";
    } else {
      scale.style.width = `${100 / state.viewerZoom}%`;
      scale.style.height = "";
    }
  }
  if (label) label.textContent = `${Math.round(state.viewerZoom * 100)}%`;
}

function setViewerPreview(html, options = {}) {
  state.viewerMode = options.mode || "";
  const modeClass = state.viewerMode === "pdf-native" ? " pdf-native-scale" : state.viewerMode === "image-fit" ? " image-fit-scale" : "";
  $("#viewerContent").innerHTML = `<div id="viewerScale" class="preview-scale${modeClass}">${html}</div>`;
  applyViewerZoom();
}

function changeViewerZoom(delta) {
  state.viewerZoom = clamp(Math.round((state.viewerZoom + delta) * 100) / 100, 0.5, 2);
  applyViewerZoom();
}

function resetViewerZoom() {
  state.viewerZoom = 1;
  applyViewerZoom();
}

function resetViewerDialog() {
  $("#viewerContent").innerHTML = "";
  state.viewerMode = "";
  setViewerDownload("", "");
  resetViewerZoom();
}

function closeDialog(dialog) {
  if (!dialog?.open) return;
  if (dialog.id === "maintenanceReleaseConfirmDialog" && state.maintenanceReleaseConfirmSubmitting) return;
  if (dialog.id === "viewerDialog") resetViewerDialog();
  if (dialog.id === "maintenanceDispatchDialog") state.maintenanceDispatchDraft = null;
  if (dialog.id === "maintenanceReviewDialog") state.maintenanceReviewDraft = null;
  if (dialog.id === "maintenanceArchiveDeleteDialog") state.maintenanceArchiveDeleteDraft = null;
  if (dialog.id === "maintenanceReleaseConfirmDialog") resetMaintenanceReleaseConfirmDialog();
  dialog.close();
}

function renderPreviewFallback(file, src, message = "该文件暂不支持页面内预览。") {
  return `<div class="preview-fallback"><strong>${escapeHtml(file?.name || "附件")}</strong><p>${escapeHtml(message)}</p><p>类型：${escapeHtml(file?.type || "未知")} · 大小：${escapeHtml(fileSizeText(file?.size || 0))}</p>${downloadLink(src, file)}</div>`;
}

function renderSheetPreview(rows) {
  const visibleRows = rows.slice(0, 200);
  const maxCols = Math.min(30, Math.max(1, ...visibleRows.map(row => row.length)));
  const htmlRows = visibleRows.map(row => `<tr>${Array.from({ length: maxCols }, (_, index) => `<td>${escapeHtml(row[index] ?? "")}</td>`).join("")}</tr>`).join("");
  const note = rows.length > visibleRows.length ? `<div class="status-line">仅预览前 ${visibleRows.length} 行。</div>` : "";
  return `<div class="preview-table-wrap"><table class="preview-table">${htmlRows}</table></div>${note}`;
}

function renderWorkbookPreview(sheets) {
  const safeSheets = sheets.length ? sheets : [{ name: "Sheet1", rows: [] }];
  const tabs = safeSheets.map((sheet, index) => `<button class="sheet-tab ${index === 0 ? "active" : ""}" type="button" data-sheet-tab="${index}">${escapeHtml(sheet.name || `Sheet${index + 1}`)}</button>`).join("");
  const panels = safeSheets.map((sheet, index) => `<div class="sheet-panel" data-sheet-panel="${index}" ${index === 0 ? "" : "hidden"}>${renderSheetPreview(sheet.rows || [])}</div>`).join("");
  return `<div class="sheet-preview"><div class="sheet-tabs">${tabs}</div>${panels}</div>`;
}

function relsMap(xmlText) {
  if (!xmlText) return {};
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  return Array.from(xml.getElementsByTagName("Relationship")).reduce((map, item) => {
    map[item.getAttribute("Id")] = item.getAttribute("Target") || "";
    return map;
  }, {});
}

function normalizeZipPath(path = "") {
  const parts = [];
  path.split("/").forEach(part => {
    if (!part || part === ".") return;
    if (part === "..") parts.pop();
    else parts.push(part);
  });
  return parts.join("/");
}

async function renderDocxPreview(blob, file, src) {
  const files = await readZipEntries(await blob.arrayBuffer()), decoder = new TextDecoder();
  const documentFile = files["word/document.xml"];
  if (!documentFile) throw new Error("未找到 Word 正文");
  const rels = relsMap(files["word/_rels/document.xml.rels"] ? decoder.decode(files["word/_rels/document.xml.rels"]) : "");
  const mediaHtml = rid => {
    const target = rels[rid];
    if (!target) return "";
    const path = normalizeZipPath(target.startsWith("/") ? target.slice(1) : `word/${target}`);
    const bytes = files[path];
    if (!bytes) return "";
    const mime = mimeFromPath(path);
    if (!mime.startsWith("image/")) return "";
    return `<img class="preview-doc-image" src="data:${mime};base64,${bytesToBase64(bytes)}" alt="Word 图片">`;
  };
  const xml = new DOMParser().parseFromString(decoder.decode(documentFile), "application/xml");
  const paragraphs = Array.from(xml.getElementsByTagName("w:p"));
  const html = paragraphs.map(paragraph => {
    const text = Array.from(paragraph.getElementsByTagName("w:t")).map(node => node.textContent || "").join("");
    const blips = Array.from(paragraph.getElementsByTagName("a:blip"));
    const images = blips.map(node => mediaHtml(node.getAttribute("r:embed") || node.getAttribute("r:link"))).filter(Boolean).join("");
    return (text.trim() || images) ? `<p>${escapeHtml(text)}</p>${images}` : "";
  }).filter(Boolean).join("");
  return `<div class="preview-doc"><div class="status-line">当前为基础预览，完整格式请下载或外部打开。</div>${html || "<p>未识别到正文内容。</p>"}${downloadLink(src, file)}</div>`;
}

async function renderAttachmentPreview(file, src) {
  const name = file?.name || "附件";
  const hasSource = !!src && src !== "#";
  if (isImageAttachment(file, name) && hasSource) return `<img class="image-fit-preview" src="${escapeHtml(src)}" alt="${escapeHtml(name)}">`;
  if (isPdfAttachment(file, name) && hasSource) {
    return `<div class="pdf-native-preview"><iframe class="pdf-native-frame" src="${escapeHtml(src)}" title="${escapeHtml(name)}"></iframe><div class="pdf-mobile-actions"><strong>PDF 附件</strong><p>如需放大查看细节，点击“打开查看”。</p><a class="btn secondary" href="${escapeHtml(src)}" target="_blank" rel="noopener">打开查看</a></div></div>`;
  }
  if (isVideoAttachment(file, name) && hasSource) return `<video src="${escapeHtml(src)}" controls></video>`;
  if (isAudioAttachment(file, name) && hasSource) return `<audio src="${escapeHtml(src)}" controls></audio>${downloadLink(src, file)}`;
  if (attachmentExt(file, name) === "doc") return renderPreviewFallback(file, src, "doc 格式暂不支持页面内预览，请下载或另存为 docx 后预览。");
  if (attachmentExt(file, name) === "xls") return renderPreviewFallback(file, src, "xls 格式暂不支持页面内预览，请下载或另存为 xlsx 后预览。");
  const blob = await attachmentBlob(file, src);
  if (blob && isTextAttachment(file, name)) {
    const text = decodeAttachmentText(await blob.arrayBuffer());
    if (!text) return renderPreviewFallback(file, src, "无法识别附件文字编码，请下载原文件查看。");
    return `<pre class="preview-text">${escapeHtml(text)}</pre>`;
  }
  if (blob && attachmentExt(file, name) === "xlsx") {
    try {
      return renderWorkbookPreview(await parseXlsxWorkbook(blob));
    } catch (error) {
      return renderPreviewFallback(file, src, `Excel 预览失败：${error.message}`);
    }
  }
  if (blob && attachmentExt(file, name) === "docx") {
    try {
      return await renderDocxPreview(blob, file, src);
    } catch (error) {
      return renderPreviewFallback(file, src, `Word 预览失败：${error.message}`);
    }
  }
  return renderPreviewFallback(file, src);
}

function entryPayload(existing) {
  const selectedRecipients = selectedRecipientIds();
  const date = $("#entryDate").value || inputDateValue();
  return {
    date,
    category: $("#entryCategory").value,
    title: $("#entryTitle").value.trim(),
    original: $("#entryOriginal").value.trim(),
    publisher: existing?.publisher || state.user.name,
    recipients: selectedRecipients.length ? normalizeRecipients(selectedRecipients) : [],
    deadline: calculateDeadline(date),
    priority: $("#entryPriority").value,
    pinned: false,
    remindEnabled: true,
    allowEdit: true,
    allowWithdraw: false,
    publisherId: existing?.publisherId || state.user.id,
    createdBy: existing?.createdBy || state.user.id,
    updatedBy: state.user.id,
    publishStatus: existing?.publishStatus || "已发布",
    attachments: existing?.attachments || []
  };
}

function feedbackRows(record) {
  return (record.recipients || []).map(person => {
    const receipt = state.receipts.find(item => item.recordId === record.id && item.userId === person.id);
    const status = receipt?.readAt ? (receipt.isOverdue ? "超期已读" : "已读") : (isPast(record.deadline) ? "已超期" : "未读");
    return { person, receipt, status };
  });
}

function openFeedback(record) {
  $("#feedbackTitle").textContent = `反馈明细：${record.title}`;
  const rows = feedbackRows(record);
  const statusOptions = ["未读", "已读", "已超期", "超期已读"];
  if (state.user.role === "admin" && record.publishStatus !== "作废") {
    $("#feedbackBody").innerHTML = `<div class="feedback-tools"><button class="btn secondary" type="button" data-feedback-select-all>全选</button><button class="btn secondary" type="button" data-feedback-clear>取消选择</button><select id="feedbackBulkStatus">${statusOptions.map(status => `<option>${status}</option>`).join("")}</select><button class="btn" type="button" data-feedback-bulk>批量修改</button></div><div class="feedback-table feedback-admin"><div class="feedback-row head"><span>选择</span><span>姓名</span><span>部门/班组</span><span>状态</span><span>阅读时间</span><span>提醒</span></div>${rows.map(row => `<div class="feedback-row"><span><input type="checkbox" data-feedback-user="${escapeHtml(row.person.id)}"></span><span>${escapeHtml(row.person.name)}</span><span>${escapeHtml(row.person.department)} / ${escapeHtml(row.person.team)}</span><span><select data-feedback-status="${escapeHtml(row.person.id)}">${statusOptions.map(status => `<option value="${status}" ${status === row.status ? "selected" : ""}>${status}</option>`).join("")}</select></span><span>${escapeHtml(row.receipt?.readAt ? formatDisplayDate(row.receipt.readAt) : "-")}</span><span>${escapeHtml(row.receipt?.remindCount || 0)}</span></div>`).join("")}</div>`;
  } else {
    $("#feedbackBody").innerHTML = `<div class="feedback-table"><div class="feedback-row head"><span>姓名</span><span>部门/班组</span><span>状态</span><span>阅读时间</span><span>提醒</span></div>${rows.map(row => `<div class="feedback-row"><span>${escapeHtml(row.person.name)}</span><span>${escapeHtml(row.person.department)} / ${escapeHtml(row.person.team)}</span><span>${escapeHtml(row.status)}</span><span>${escapeHtml(row.receipt?.readAt ? formatDisplayDate(row.receipt.readAt) : "-")}</span><span>${escapeHtml(row.receipt?.remindCount || 0)}</span></div>`).join("")}</div>`;
  }
  const dialog = $("#feedbackDialog");
  dialog.dataset.recordId = record.id;
  if (!dialog.open) dialog.showModal();
}

function exportFeedback(record) {
  const lines = ["姓名,部门,班组,状态,阅读时间,提醒次数"].concat(feedbackRows(record).map(row => [row.person.name, row.person.department, row.person.team, row.status, row.receipt?.readAt || "", row.receipt?.remindCount || 0].map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${record.title}-反馈记录.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function statsOptions() {
  return { search: state.statsSearch, team: state.statsTeam, startDate: state.statsStartDate, endDate: state.statsEndDate };
}

function statsFilterText(options = statsOptions()) {
  const dates = options.startDate || options.endDate ? `${options.startDate || "最早"} 至 ${options.endDate || "最新"}` : "全部日期";
  const team = options.team && options.team !== "全部" ? `班组：${options.team}` : "全部班组";
  const search = options.search ? `搜索：${options.search}` : "全部人员";
  return `${dates} · ${team} · ${search}`;
}

function exportStatsCsv() {
  const csv = statsService.exportStatsCsv(state.records, state.receipts, statsOptions());
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `信息阅读统计-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportStatsExcel() {
  const tables = statsService.exportTables(state.records, state.receipts, statsOptions());
  const blob = buildXlsxWorkbook(tables);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `信息阅读统计-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function xmlEscape(value) {
  return String(value ?? "").replace(/[<>&'"]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[char]));
}

function columnName(index) {
  let name = "";
  let number = index + 1;
  while (number > 0) {
    const mod = (number - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    number = Math.floor((number - mod) / 26);
  }
  return name;
}

function worksheetXml(rows) {
  const sheetData = rows.map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => {
      const ref = `${columnName(colIndex)}${rowIndex + 1}`;
      if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${sheetData}</sheetData></worksheet>`;
}

function workbookXml(tables) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tables.map((table, index) => `<sheet name="${xmlEscape(table.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`;
}

function workbookRelsXml(tables) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}</Relationships>`;
}

function contentTypesXml(tables) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${tables.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function crc32(bytes) {
  const table = crc32.table || (crc32.table = Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    return crc >>> 0;
  }));
  let crc = 0xffffffff;
  bytes.forEach(byte => { crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8); });
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  parts.forEach(part => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const locals = [], centrals = [];
  let offset = 0;
  files.forEach(file => {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, 0);
    writeUint16(local, 8, 0);
    writeUint16(local, 10, 0);
    writeUint16(local, 12, 0);
    writeUint32(local, 14, crc);
    writeUint32(local, 18, data.length);
    writeUint32(local, 22, data.length);
    writeUint16(local, 26, name.length);
    writeUint16(local, 28, 0);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);
    const central = new Uint8Array(46 + name.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, 0);
    writeUint16(central, 10, 0);
    writeUint16(central, 12, 0);
    writeUint16(central, 14, 0);
    writeUint32(central, 16, crc);
    writeUint32(central, 20, data.length);
    writeUint32(central, 24, data.length);
    writeUint16(central, 28, name.length);
    writeUint16(central, 30, 0);
    writeUint16(central, 32, 0);
    writeUint16(central, 34, 0);
    writeUint16(central, 36, 0);
    writeUint32(central, 38, 0);
    writeUint32(central, 42, offset);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  });
  const centralStart = offset;
  const centralBytes = concatBytes(centrals);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, files.length);
  writeUint16(end, 10, files.length);
  writeUint32(end, 12, centralBytes.length);
  writeUint32(end, 16, centralStart);
  writeUint16(end, 20, 0);
  return concatBytes([...locals, centralBytes, end]);
}

function buildXlsxWorkbook(tables) {
  const files = [
    { name: "[Content_Types].xml", content: contentTypesXml(tables) },
    { name: "_rels/.rels", content: rootRelsXml() },
    { name: "xl/workbook.xml", content: workbookXml(tables) },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(tables) },
    ...tables.map((table, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: worksheetXml(table.rows) }))
  ];
  return new Blob([zipStore(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function printFixed(project) {
  $("#printArea").innerHTML = `<h1>ATA ${escapeHtml(project.ata)} ${escapeHtml(project.title)}</h1><div class="rich-view">${sanitizeRichHtml(project.contentHtml || "")}</div>${project.references ? `<h2>参考资料</h2><div class="references">${escapeHtml(project.references)}</div>` : ""}${project.attachments?.length ? `<h2>附件</h2><ul>${project.attachments.map(file => `<li>${escapeHtml(file.name)}</li>`).join("")}</ul>` : ""}`;
  $("#printArea").hidden = false;
  window.print();
  $("#printArea").hidden = true;
}

async function saveSettingsFromForm() {
  const categories = $("#settingsCategories").value.split(/\n+/).map(item => item.trim()).filter(Boolean);
  state.settings = await settingsService.save({ ...state.settings, categories, overdueDays: Number($("#settingsOverdueDays").value) || 3, reminderDays: Number($("#settingsReminderDays").value) || 1 });
  alert("设置已保存。人员信息由登录用户管理自动同步。");
  await renderAll();
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index], next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ",") { row.push(cell); cell = ""; continue; }
    if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    if (char !== "\r") cell += char;
  }
  row.push(cell);
  if (row.some(value => String(value).trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function excelSerialToDate(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 20000 || number > 80000) return "";
  const utc = Math.round((number - 25569) * 86400 * 1000);
  const date = new Date(utc);
  const pad = item => String(item).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function normalizeBatchDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const serialDate = excelSerialToDate(raw);
  if (serialDate) return serialDate;
  const parsed = parseDate(raw);
  return parsed ? formatDisplayDateOnly(parsed) : raw;
}

function batchRowsFromRows(rows) {
  const filtered = rows.map(row => row.map(cell => String(cell ?? "").trim())).filter(row => row.some(Boolean));
  if (!filtered.length) return { rows: [], skipped: 0 };
  const headers = filtered[0].map(normalizeHeader);
  const indexOf = names => headers.findIndex(header => names.includes(header));
  const dateIndex = indexOf(["日期", "时间", "发布时间"]);
  const categoryIndex = indexOf(["类别", "分类"]);
  const titleIndex = indexOf(["标题", "题目"]);
  const originalIndex = indexOf(["原文", "内容", "正文"]);
  const publisherIndex = indexOf(["发布者", "发布人"]);
  const hasHeader = [dateIndex, categoryIndex, titleIndex, originalIndex].every(index => index >= 0);
  const dataRows = hasHeader ? filtered.slice(1) : filtered;
  let skipped = 0;
  const parsedRows = dataRows.map(row => {
    const draft = hasHeader ? {
      date: row[dateIndex],
      category: row[categoryIndex],
      title: row[titleIndex],
      original: row[originalIndex],
      publisher: publisherIndex >= 0 ? row[publisherIndex] : ""
    } : {
      date: row[0],
      category: row[1],
      title: row[2],
      original: row[3],
      publisher: row[4]
    };
    const item = {
      date: normalizeBatchDate(draft.date),
      category: String(draft.category || "").trim(),
      title: String(draft.title || "").trim(),
      original: String(draft.original || "").trim(),
      publisher: String(draft.publisher || "").trim() || state.user.name
    };
    if (!item.date || !item.category || !item.title || !item.original) {
      skipped++;
      return null;
    }
    return item;
  }).filter(Boolean);
  return { rows: parsedRows, skipped };
}

async function batchRowsFromFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls") && !name.endsWith(".xlsx")) throw new Error("xls 格式请先另存为 xlsx 或 CSV");
  if (name.endsWith(".xlsx")) return batchRowsFromRows(await parseXlsx(file));
  return batchRowsFromRows(parseCsv(await file.text()));
}

function maintenanceRowsFromRows(rows) {
  const filtered = rows.map(row => row.map(cell => String(cell ?? "").trim())).filter(row => row.some(Boolean));
  if (!filtered.length) return { rows: [], skipped: 0 };
  const headers = filtered[0].map(normalizeHeader);
  const indexOf = names => headers.findIndex(header => names.includes(header));
  const map = {
    date: indexOf(["日期", "航班日期", "计划日期"]),
    flightNo: indexOf(["航班号"]),
    aircraftNo: indexOf(["机号"]),
    aircraftType: indexOf(["机型"]),
    stand: indexOf(["机位"]),
    plannedArrival: indexOf(["计划落地时间", "落地时间"]),
    plannedDeparture: indexOf(["计划起飞时间", "起飞时间"]),
    workKind: indexOf(["维修机会", "工作类型", "工作种类"]),
    cardNo: indexOf(["工卡编号", "工卡号"]),
    cardName: indexOf(["工卡名称", "工作标题"]),
    standardHours: indexOf(["标准工时"]),
    status: indexOf(["状态"]),
    remark: indexOf(["备注"])
  };
  const hasHeader = map.date >= 0 || map.flightNo >= 0 || map.cardName >= 0;
  const missingHeaders = [["date", "日期"], ["flightNo", "航班号"], ["aircraftNo", "机号"]]
    .filter(([key]) => map[key] < 0).map(([, label]) => label);
  if (hasHeader && missingHeaders.length) {
    throw new Error(`航班计划缺少列：${missingHeaders.join("、")}。请核对表头，未导入任何数据。`);
  }
  if (!hasHeader && !maintenanceImportDate(filtered[0][0])) {
    throw new Error("未识别到航班计划表头或有效日期。请使用包含日期、航班号、机号的导入格式，不能按固定列顺序导入此文件。");
  }
  let skipped = 0;
  const sourceRows = hasHeader ? filtered.slice(1) : filtered;
  const parsed = sourceRows.map((row, index) => {
    const item = hasHeader ? Object.fromEntries(Object.entries(map).map(([key, index]) => [key, index >= 0 ? row[index] : ""])) : {
      date: row[0], flightNo: row[1], aircraftNo: row[2], aircraftType: row[3], stand: row[4],
      plannedArrival: row[5], plannedDeparture: row[6], workKind: row[7], cardNo: row[8],
      cardName: row[9], standardHours: row[10], status: row[11], remark: row[12]
    };
    const date = maintenanceImportDate(item.date);
    if (!date || !item.flightNo || !item.aircraftNo) {
      throw new Error(`第 ${index + (hasHeader ? 2 : 1)} 行日期、航班号或机号无效，请核对列对应关系。未导入任何数据。`);
    }
    return { ...item, date, standardHours: Number(item.standardHours || 0) || 0 };
  }).filter(Boolean);
  return { rows: parsed, skipped };
}

function maintenanceImportDate(value) {
  const raw = excelSerialToDate(value) || String(value || "").trim();
  const match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match) return "";
  const date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : "";
}

async function maintenanceRowsFromFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls") && !name.endsWith(".xlsx")) throw new Error("xls 格式请先另存为 xlsx 或 CSV");
  if (name.endsWith(".xlsx")) return maintenanceRowsFromRows(await parseXlsx(file));
  return maintenanceRowsFromRows(parseCsv(await file.text()));
}

async function refreshMaintenance() {
  await maintenanceService.load();
  renderMaintenance();
}

function maintenanceHasOpenEditor() {
  return Boolean(state.maintenanceDispatchDraft || state.maintenanceReviewDraft || state.maintenanceArchiveDeleteDraft || state.maintenanceWorkReportDraft || state.maintenanceReleaseConfirmSubmitting || ["maintenanceTaskDialog", "maintenanceDispatchDialog", "maintenanceReviewDialog", "maintenanceArchiveDeleteDialog", "maintenanceWorkReportDialog", "maintenanceReleaseConfirmDialog"].some(id => $( `#${id}` )?.open));
}

async function refreshMaintenanceFromSync(version = 0) {
  const nextVersion = Number(version || 0);
  if (nextVersion && nextVersion <= Number(state.maintenanceSyncVersion || 0)) return;
  if (nextVersion) state.maintenanceSyncVersion = nextVersion;
  if (maintenanceHasOpenEditor()) {
    state.maintenanceRefreshPending = true;
    return;
  }
  if (state.activePage !== "maintenancePage") {
    if (state.loadedData instanceof Set) {
      for (const key of state.loadedData) if (key.startsWith("maintenance:")) state.loadedData.delete(key);
    }
    return;
  }
  state.maintenanceRefreshPending = false;
  await refreshMaintenance();
}

function flushMaintenancePendingRefresh() {
  if (!state.maintenanceRefreshPending || maintenanceHasOpenEditor()) return;
  state.maintenanceRefreshPending = false;
  refreshMaintenance().catch(() => {});
}

function stopMaintenanceSync() {
  if (state.maintenanceSyncTimer) clearInterval(state.maintenanceSyncTimer);
  state.maintenanceSyncTimer = null;
  if (state.maintenanceReconnectTimer) clearTimeout(state.maintenanceReconnectTimer);
  state.maintenanceReconnectTimer = null;
  state.maintenanceEventSource?.close();
  state.maintenanceEventSource = null;
  state.maintenanceSseConnected = false;
}

function startMaintenancePolling() {
  if (state.maintenanceSyncTimer) return;
  state.maintenanceSyncTimer = setInterval(async () => {
    try {
      const data = await maintenanceService.version();
      await refreshMaintenanceFromSync(data.version);
    } catch {}
  }, 15000);
}

function stopMaintenancePolling() {
  if (state.maintenanceSyncTimer) clearInterval(state.maintenanceSyncTimer);
  state.maintenanceSyncTimer = null;
}

function startMaintenanceSync() {
  if (!isLoggedIn() || !canView("maintenancePage")) {
    stopMaintenanceSync();
    return;
  }
  if (typeof EventSource === "undefined") {
    startMaintenancePolling();
    return;
  }
  if (state.maintenanceEventSource) return;
  const source = new EventSource(`${API_BASE_URL}/maintenance/events`);
  source.onopen = () => {
    state.maintenanceSseConnected = true;
    stopMaintenancePolling();
  };
  source.addEventListener("maintenance", event => {
    try {
      const data = JSON.parse(event.data || "{}");
      state.maintenanceSseConnected = true;
      stopMaintenancePolling();
      refreshMaintenanceFromSync(data.version).catch(() => {});
    } catch {}
  });
  source.onerror = () => {
    source.close();
    if (state.maintenanceEventSource === source) state.maintenanceEventSource = null;
    state.maintenanceSseConnected = false;
    startMaintenancePolling();
    if (state.maintenanceReconnectTimer) clearTimeout(state.maintenanceReconnectTimer);
    state.maintenanceReconnectTimer = setTimeout(() => {
      state.maintenanceReconnectTimer = null;
      startMaintenanceSync();
    }, 3000);
  };
  state.maintenanceEventSource = source;
}

function ensureMaintenanceDialogs() {
  if (!$("#maintenanceTaskDialog")) {
    document.body.insertAdjacentHTML("beforeend", `<dialog id="maintenanceTaskDialog"><div id="maintenanceTaskDialogBody" class="dialog-body"></div></dialog>`);
  }
  if (!$("#maintenanceDispatchDialog")) {
    document.body.insertAdjacentHTML("beforeend", `<dialog id="maintenanceDispatchDialog"><div id="maintenanceDispatchDialogBody" class="dialog-body"></div></dialog>`);
    $("#maintenanceDispatchDialog").addEventListener("close", () => { state.maintenanceDispatchDraft = null; flushMaintenancePendingRefresh(); });
  }
  if (!$("#maintenanceReviewDialog")) {
    document.body.insertAdjacentHTML("beforeend", `<dialog id="maintenanceReviewDialog" class="maintenance-review-dialog"><div id="maintenanceReviewDialogBody" class="dialog-body"></div></dialog>`);
    $("#maintenanceReviewDialog").addEventListener("close", () => { state.maintenanceReviewDraft = null; flushMaintenancePendingRefresh(); });
  }
  if (!$("#maintenanceArchiveDeleteDialog")) {
    document.body.insertAdjacentHTML("beforeend", `<dialog id="maintenanceArchiveDeleteDialog" class="maintenance-archive-delete-dialog"><div id="maintenanceArchiveDeleteDialogBody" class="dialog-body"></div></dialog>`);
    $("#maintenanceArchiveDeleteDialog").addEventListener("close", () => { state.maintenanceArchiveDeleteDraft = null; flushMaintenancePendingRefresh(); });
  }
  if (!$("#maintenanceWorkReportDialog")) {
    document.body.insertAdjacentHTML("beforeend", `<dialog id="maintenanceWorkReportDialog" class="maintenance-work-report-dialog"><div id="maintenanceWorkReportDialogBody" class="dialog-body"></div></dialog>`);
    $("#maintenanceWorkReportDialog").addEventListener("close", () => { state.maintenanceWorkReportDraft = null; flushMaintenancePendingRefresh(); });
  }
  if (!$("#maintenanceReleaseConfirmDialog")) {
    document.body.insertAdjacentHTML("beforeend", `<dialog id="maintenanceReleaseConfirmDialog" class="maintenance-release-confirm-dialog"><div class="dialog-body maintenance-release-confirm-body" tabindex="-1"><div class="dialog-head"><h2>放行确认</h2><button class="icon-btn" data-close="maintenanceReleaseConfirmDialog" type="button" aria-label="关闭">×</button></div><div class="maintenance-release-flight-summary" data-maint-release-summary></div><p>确认已放行，上报架次？</p><div class="form-actions maintenance-release-confirm-actions"><button class="btn secondary" type="button" data-maint-release-no>否</button><button class="btn" type="button" data-maint-release-yes>是</button></div></div></dialog>`);
    const dialog = $("#maintenanceReleaseConfirmDialog");
    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      if (state.maintenanceReleaseConfirmSubmitting) return;
      closeDialog(dialog);
    });
    dialog.addEventListener("close", () => { resetMaintenanceReleaseConfirmDialog(); flushMaintenancePendingRefresh(); });
  }
}

function setMaintenanceReleaseConfirmSubmitting(submitting) {
  state.maintenanceReleaseConfirmSubmitting = Boolean(submitting);
  const dialog = $("#maintenanceReleaseConfirmDialog");
  if (!dialog) return;
  const yes = dialog.querySelector("[data-maint-release-yes]");
  const no = dialog.querySelector("[data-maint-release-no]");
  const close = dialog.querySelector("[data-close='maintenanceReleaseConfirmDialog']");
  if (yes) {
    yes.disabled = state.maintenanceReleaseConfirmSubmitting;
    yes.textContent = state.maintenanceReleaseConfirmSubmitting ? "正在上报..." : "是";
  }
  if (no) no.disabled = state.maintenanceReleaseConfirmSubmitting;
  if (close) close.disabled = state.maintenanceReleaseConfirmSubmitting;
  dialog.toggleAttribute("aria-busy", state.maintenanceReleaseConfirmSubmitting);
}

function resetMaintenanceReleaseConfirmDialog() {
  state.maintenanceReleaseConfirmAssignmentId = "";
  state.maintenanceReleaseConfirmFlightId = "";
  setMaintenanceReleaseConfirmSubmitting(false);
  const dialog = $("#maintenanceReleaseConfirmDialog");
  dialog?.querySelectorAll("button").forEach(button => button.blur());
}

function openMaintenanceReleaseConfirm(assignmentId, flightId = "") {
  ensureMaintenanceDialogs();
  const dialog = $("#maintenanceReleaseConfirmDialog");
  if (dialog.open) return;
  // A page restore or interrupted request must never carry a stale loading state
  // into a newly opened confirmation dialog.
  resetMaintenanceReleaseConfirmDialog();
  state.maintenanceReleaseConfirmAssignmentId = assignmentId;
  state.maintenanceReleaseConfirmFlightId = flightId;
  const flight = findMaintenanceFlight(flightId);
  const summary = dialog.querySelector("[data-maint-release-summary]");
  if (summary) {
    summary.textContent = flight
      ? `${flight.flightNo || "-"} · ${flight.aircraftNo || "-"} · ${flight.aircraftType || "-"} · ${flight.workKind || flight.workType || "其他"}`
      : "";
    summary.hidden = !flight;
  }
  dialog.showModal();
  dialog.querySelector(".maintenance-release-confirm-body")?.focus({ preventScroll: true });
}

function optionList(options, value = "") {
  return options.map(item => `<option value="${escapeHtml(item)}" ${item === value ? "selected" : ""}>${escapeHtml(item)}</option>`).join("");
}

function findMaintenanceFlight(id) {
  return (state.maintenanceFlights || []).find(item => item.id === id) || null;
}

function findMaintenanceSubtask(id) {
  for (const flight of state.maintenanceFlights || []) {
    const subtask = (flight.subtasks || []).find(item => item.id === id);
    if (subtask) return { flight, subtask };
  }
  return { flight: null, subtask: null };
}

function maintenanceFlightFormHtml(flight = {}) {
  return `<div class="dialog-head"><h2>${flight.id ? "修改维修机会" : "新建维修机会"}</h2><button class="icon-btn" data-close="maintenanceTaskDialog" type="button">×</button></div>
    <form id="maintenanceFlightForm" class="entry-grid">
      <input id="maintFlightId" type="hidden" value="${escapeHtml(flight.id || "")}">
      <label>日期<input id="maintDate" type="date" value="${escapeHtml(inputDateValue(flight.date || new Date()))}" required></label>
      <label>航班号<input id="maintFlightNo" value="${escapeHtml(flight.flightNo || "")}" required></label>
      <label>机号<input id="maintAircraftNo" value="${escapeHtml(flight.aircraftNo || "")}" required></label>
      <label>机型<select id="maintAircraftType">${maintenanceAircraftTypeOptions(flight.aircraftType || "A320")}</select></label>
      <label>机位<input id="maintStand" value="${escapeHtml(flight.stand || "")}"></label>
      <label>计划落地时间<input id="maintArrival" type="text" inputmode="numeric" maxlength="8" placeholder="例如 1217、0238+" value="${escapeHtml(flight.plannedArrival ?? "")}" autocomplete="off"></label>
      <label>计划起飞时间<input id="maintDeparture" type="text" inputmode="numeric" maxlength="8" placeholder="例如 1345、-" value="${escapeHtml(flight.plannedDeparture ?? "")}" autocomplete="off"></label>
      <label>维修机会<select id="maintWorkKind">${optionList(maintenanceOpportunityOptions, flight.workKind || flight.workType || "航后")}</select></label>
      <input id="maintStatus" type="hidden" value="${escapeHtml(flight.status || "未派工")}">
      <input id="maintRemark" type="hidden" value="${escapeHtml(flight.remark || "")}">
      <div class="form-actions"><button class="btn secondary" type="button" data-close="maintenanceTaskDialog">取消</button><button class="btn" type="submit">保存</button></div>
    </form>`;
}

function maintenanceSubtaskFormHtml(flight, subtask = {}) {
  return `<div class="dialog-head"><h2>${subtask.id ? "修改非例行" : "新增非例行"}</h2><button class="icon-btn" data-close="maintenanceTaskDialog" type="button">×</button></div>
    <form id="maintenanceSubtaskForm" class="entry-grid">
      <input id="maintSubtaskId" type="hidden" value="${escapeHtml(subtask.id || "")}">
      <input id="maintSubtaskFlightId" type="hidden" value="${escapeHtml(flight.id || "")}">
      <div class="status-line">继承维修机会：${escapeHtml(flight.date || "-")} · ${escapeHtml(flight.flightNo || "-")} · ${escapeHtml(flight.aircraftNo || "-")}</div>
      <input id="maintSubPriority" type="hidden" value="${escapeHtml(subtask.priority || "普通")}">
      <input id="maintSubStatus" type="hidden" value="${escapeHtml(subtask.status || "未派工")}">
      <input id="maintSubRemark" type="hidden" value="${escapeHtml(subtask.remark || "")}">
      <label>章节<input id="maintSubChapter" value="${escapeHtml(subtask.cardNo || "")}"></label>
      <label>标题<input id="maintSubTitle" value="${escapeHtml(subtask.title || "")}" required></label>
      <label>类别<select id="maintSubCategory">${optionList(subtaskCategories, subtaskCategories.includes(subtask.category) ? subtask.category : "其他")}</select></label>
      <label>工时<input id="maintSubHours" type="number" min="0" step="0.1" value="${escapeHtml(subtask.standardHours || 0)}"></label>
      <label>报工说明<textarea id="maintSubExplanation" placeholder="对本项工作进行说明（非必填）">${escapeHtml(subtask.content || "")}</textarea></label>
      <div class="form-actions"><button class="btn secondary" type="button" data-close="maintenanceTaskDialog">取消</button><button class="btn" type="submit">保存</button></div>
    </form>`;
}

function maintenanceFlightPayloadFromForm() {
  return {
    date: $("#maintDate").value,
    flightNo: $("#maintFlightNo").value.trim(),
    aircraftNo: $("#maintAircraftNo").value.trim(),
    aircraftType: $("#maintAircraftType").value,
    stand: $("#maintStand").value.trim(),
    plannedArrival: $("#maintArrival").value.trim(),
    plannedDeparture: $("#maintDeparture").value.trim(),
    workKind: $("#maintWorkKind").value,
    status: $("#maintStatus").value,
    remark: $("#maintRemark").value.trim()
  };
}

function maintenanceSubtaskPayloadFromForm() {
  return {
    chapter: $("#maintSubChapter").value.trim(),
    title: $("#maintSubTitle").value.trim(),
    category: $("#maintSubCategory").value,
    standardHours: Number($("#maintSubHours").value || 0),
    priority: $("#maintSubPriority").value,
    status: $("#maintSubStatus").value,
    reportExplanation: $("#maintSubExplanation").value.trim(),
    remark: $("#maintSubRemark").value.trim()
  };
}

function openMaintenanceFlightDialog(flight = {}) {
  ensureMaintenanceDialogs();
  $("#maintenanceTaskDialogBody").innerHTML = maintenanceFlightFormHtml(flight);
  $("#maintenanceTaskDialog").showModal();
}

function openMaintenanceSubtaskDialog(flight, subtask = {}) {
  ensureMaintenanceDialogs();
  $("#maintenanceTaskDialogBody").innerHTML = maintenanceSubtaskFormHtml(flight, subtask);
  $("#maintenanceTaskDialog").showModal();
}

function openMaintenanceDispatchDialog(ownerType, ownerId) {
  ensureMaintenanceDialogs();
  const flight = ownerType === "flight" ? findMaintenanceFlight(ownerId) : findMaintenanceSubtask(ownerId).flight;
  const item = ownerType === "flight" ? flight : findMaintenanceSubtask(ownerId).subtask;
  if (!flight || !item) return;
  const people = normalizePeople(state.settings.people || []);
  const opportunity = flight.workKind || flight.workType || "其他";
  const availableRoles = maintenanceRolesForOwner(ownerType, opportunity);
  const lockedRoles = maintenanceLockedDispatchRoles(flight, ownerType);
  const selections = new Map(availableRoles.map(role => [role, new Set()]));
  const selectionOrder = new Map(availableRoles.map(role => [role, new Map()]));
  let nextOrder = 0;
  (item.assignments || []).forEach(row => {
    const role = normalizeMaintenanceRoleForMenu(row.role, availableRoles);
    const selected = selections.get(role);
    if (!selected || selected.has(row.userId)) return;
    if (role === "放行") {
      selected.clear();
      selectionOrder.get(role).clear();
    }
    selected.add(row.userId);
    selectionOrder.get(role).set(row.userId, nextOrder++);
  });
  state.maintenanceDispatchDraft = {
    people,
    availableRoles,
    lockedRoles,
    selections,
    selectionOrder,
    nextOrder,
    activeRole: availableRoles.find(role => !lockedRoles.has(role) && selections.get(role)?.size) || availableRoles.find(role => !lockedRoles.has(role)) || availableRoles[0],
    team: "全部班组",
    search: "",
    composing: false
  };
  const teams = ["全部班组", ...Array.from(new Set(people.map(person => person.team || "未设置"))).sort((a, b) => a.localeCompare(b, "zh-CN"))];
  const context = `${flight.flightNo || "-"} · ${flight.aircraftNo || "-"} · ${ownerType === "flight" ? opportunity : (item.title || "非例行")}`;
  $("#maintenanceDispatchDialogBody").innerHTML = `<div class="dialog-head maintenance-dispatch-head"><h2>派工 <small>${escapeHtml(context)}</small></h2><button class="icon-btn" data-close="maintenanceDispatchDialog" type="button">×</button></div>
    <form id="maintenanceDispatchForm" class="entry-grid">
      <input id="maintDispatchOwnerType" type="hidden" value="${escapeHtml(ownerType)}">
      <input id="maintDispatchOwnerId" type="hidden" value="${escapeHtml(ownerId)}">
      <div id="maintenanceRoleGroups" class="maintenance-role-groups ${ownerType === "subtask" ? "subtask-role-groups" : ""}"></div>
      <div class="maintenance-picker-tools"><select id="maintDispatchTeam" aria-label="班组筛选">${teams.map(team => `<option value="${escapeHtml(team)}">${escapeHtml(team)}</option>`).join("")}</select><input id="maintDispatchSearch" class="search" placeholder="搜索姓名" autocomplete="off"><span id="maintDispatchSelectedCount" class="maintenance-selected-count">已选 0 人</span></div>
      <div id="maintenancePeoplePicker" class="maintenance-people-picker"></div>
      <div class="form-actions"><button class="btn secondary" type="button" data-close="maintenanceDispatchDialog">取消</button><button class="btn" type="submit">${lockedRoles.size ? "保存未提报派工" : "保存派工"}</button></div>
    </form>`;
  renderMaintenanceDispatchPicker();
  $("#maintenanceDispatchDialog").showModal();
}

function maintenanceDispatchPersonRow(person, selected) {
  const draft = state.maintenanceDispatchDraft;
  const role = draft?.activeRole || "";
  const inputId = `maint-person-${role}-${person.id}`;
  const department = person.department && person.department !== "未设置" ? person.department : (person.team || "未设置");
  const inputType = role === "放行" ? "radio" : "checkbox";
  const inputName = role === "放行" ? ' name="maintenance-release-person"' : "";
  const locked = draft?.lockedRoles?.has(role);
  return `<div class="maintenance-person-row ${selected ? "selected" : ""} ${locked ? "locked" : ""}"><input id="${escapeHtml(inputId)}" type="${inputType}"${inputName} data-maint-person="${escapeHtml(person.id)}" data-maint-role-category="${escapeHtml(role)}" ${selected ? "checked" : ""} ${locked ? "disabled" : ""}><label class="maintenance-person-info" for="${escapeHtml(inputId)}"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(department)}</small></label><span class="maintenance-person-role">${locked ? "已提报" : escapeHtml(role)}</span></div>`;
}

function renderMaintenanceDispatchRoleGroups() {
  const draft = state.maintenanceDispatchDraft;
  const container = $("#maintenanceRoleGroups");
  if (!draft || !container) return;
  const peopleById = new Map(draft.people.map(person => [person.id, person]));
  container.innerHTML = draft.availableRoles.map(role => {
    const selectedIds = [...(draft.selections.get(role) || [])];
    const names = selectedIds.map(id => peopleById.get(id)?.name).filter(Boolean);
    const preview = names.slice(0, 3).join("、");
    const extra = names.length > 3 ? ` +${names.length - 3}` : "";
    const locked = draft.lockedRoles?.has(role);
    return `<div class="maintenance-role-group ${draft.activeRole === role ? "active" : ""} ${locked ? "locked" : ""}"><button type="button" data-maint-role-group="${escapeHtml(role)}"><span><strong>${escapeHtml(role)}</strong><small>${locked ? "已提报 · " : ""}${selectedIds.length} 人</small></span><em>${escapeHtml(preview)}${escapeHtml(extra)}</em></button>${selectedIds.length && !locked ? `<button class="maintenance-role-clear" type="button" data-maint-clear-role="${escapeHtml(role)}">清除</button>` : ""}</div>`;
  }).join("");
}

function renderMaintenanceDispatchPicker() {
  const draft = state.maintenanceDispatchDraft;
  const picker = $("#maintenancePeoplePicker");
  if (!draft || !picker) return;
  const activeSelection = draft.selections.get(draft.activeRole) || new Set();
  const activeOrder = draft.selectionOrder.get(draft.activeRole) || new Map();
  const selected = draft.people.filter(person => activeSelection.has(person.id)).sort((a, b) => (activeOrder.get(a.id) ?? 0) - (activeOrder.get(b.id) ?? 0));
  const term = draft.search.trim().toLocaleLowerCase("zh-CN");
  const candidates = draft.people.filter(person => {
    if (activeSelection.has(person.id)) return false;
    const teamMatches = draft.team === "全部班组" || (person.team || "未设置") === draft.team;
    return teamMatches && (!term || person.name.toLocaleLowerCase("zh-CN").includes(term));
  }).sort((a, b) => (a.team || "").localeCompare(b.team || "", "zh-CN") || a.name.localeCompare(b.name, "zh-CN"));
  picker.innerHTML = [...selected.map(person => maintenanceDispatchPersonRow(person, true)), ...candidates.map(person => maintenanceDispatchPersonRow(person, false))].join("") || '<div class="status-line">没有匹配人员。</div>';
  const count = $("#maintDispatchSelectedCount");
  const total = draft.availableRoles.reduce((sum, role) => sum + (draft.selections.get(role)?.size || 0), 0);
  if (count) count.textContent = `已选 ${total} 人次`;
  renderMaintenanceDispatchRoleGroups();
}

function maintenanceAssignmentsFromForm() {
  const draft = state.maintenanceDispatchDraft;
  if (!draft) return [];
  return draft.availableRoles.flatMap(role => {
    const order = draft.selectionOrder.get(role) || new Map();
    return [...(draft.selections.get(role) || [])]
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .map(userId => ({ userId, role }));
  });
}

function maintenanceTemporaryReportContext(raw = {}, index = 0) {
  const clientId = String(raw.clientId || `draft-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`);
  return {
    key: `temporary:${clientId}`,
    clientId,
    ownerType: "subtask",
    ownerId: "",
    chapter: String(raw.chapter || raw.cardNo || ""),
    label: String(raw.title || ""),
    category: subtaskCategories.includes(raw.category) ? raw.category : "其他",
    reportExplanation: String(raw.reportExplanation || raw.content || ""),
    roles: [...maintenanceSubtaskRoleOptions],
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    standardHours: raw.standardHours ?? "",
    temporary: true
  };
}

function initializeMaintenanceWorkSelections(contexts) {
  const selections = new Map();
  const selectionOrder = new Map();
  contexts.forEach(context => context.roles.forEach(role => {
    const key = `${context.key}|${role}`;
    selections.set(key, new Set());
    selectionOrder.set(key, new Map());
  }));
  let nextOrder = 0;
  contexts.forEach(context => (context.entries || []).forEach(item => {
    const key = `${context.key}|${item.role}`;
    if (!selections.has(key)) return;
    selections.get(key).add(item.userId);
    selectionOrder.get(key).set(item.userId, nextOrder++);
  }));
  return { selections, selectionOrder, nextOrder };
}

async function openMaintenanceWorkReportDialog(flightId, reportType = "routine") {
  ensureMaintenanceDialogs();
  const { report } = await maintenanceService.getReports(flightId);
  const contexts = [];
  if (reportType === "routine" && report.routine.roles.length) {
    const releaseUserId = report.routine.draft?.releaseUserId || report.release?.userId || "";
    const releasePerson = (report.people || []).find(person => person.id === releaseUserId);
    const releaseEntry = releaseUserId ? [{
      role: "放行",
      userId: releaseUserId,
      userName: releasePerson?.name || report.release?.userName || "",
      team: releasePerson?.team || report.release?.team || ""
    }] : [];
    contexts.push({
      key: `flight:${flightId}`,
      ownerType: "flight",
      ownerId: flightId,
      label: "例行",
      roles: ["放行", ...report.routine.roles.filter(role => role !== "放行")],
      entries: [...releaseEntry, ...(report.routine.entries || []).filter(item => item.role !== "放行")],
      standardHours: 0
    });
  } else if (reportType === "finalize") {
    contexts.push({
      key: `flight:${flightId}`,
      ownerType: "flight",
      ownerId: flightId,
      label: "例行",
      roles: (report.routine.roles || []).filter(role => role !== "放行"),
      entries: (report.routine.entries || []).filter(item => item.role !== "放行"),
      standardHours: 0
    });
  }
  if (["nonroutine", "finalize"].includes(reportType)) (report.nonroutine.items || []).forEach(item => contexts.push({
    key: `subtask:${item.id}`,
    ownerType: "subtask",
    ownerId: item.id,
    chapter: item.chapter || "",
    label: item.title || "",
    category: subtaskCategories.includes(item.category) ? item.category : "其他",
    reportExplanation: item.reportExplanation || "",
    roles: maintenanceSubtaskRoleOptions,
    entries: item.entries || [],
    standardHours: Number(item.standardHours || 0) > 0 ? Number(item.standardHours) : "",
    temporary: false
  }));
  if (reportType === "nonroutine-create") {
    (report.nonroutine.draft?.items || []).forEach((item, index) => contexts.push(maintenanceTemporaryReportContext(item, index)));
    if (!contexts.length) contexts.push(maintenanceTemporaryReportContext({}, 0));
  }
  const { selections, selectionOrder, nextOrder } = initializeMaintenanceWorkSelections(contexts);
  const isCreateNonroutine = reportType === "nonroutine-create";
  state.maintenanceWorkReportDraft = {
    report,
    reportType,
    people: normalizePeople(report.people || []),
    contexts,
    selections,
    selectionOrder,
    nextOrder,
    activeContextKey: contexts[0]?.key || "",
    activeRole: contexts[0]?.roles?.[0] || "",
    team: "全部班组",
    search: "",
    feedback: reportType === "nonroutine" || isCreateNonroutine ? "" : report.routine.feedback || "",
    draftVersion: reportType === "routine" ? report.routine.draft?.version ?? 0 : report.nonroutine.draft?.version ?? 0,
    nonroutineRevision: report.nonroutine?.revision || "",
    releaseUserId: report.release?.userId || "",
    releaseEditable: reportType === "routine" && Boolean(report.releaseEditable),
    lockedRelease: report.progress?.batches?.release?.entries?.[0] || report.release || null,
    deletedSubtaskIds: new Set(),
    composing: false,
    busy: false,
    reason: "",
    message: ""
  };
  renderMaintenanceWorkReportDialog();
  $("#maintenanceWorkReportDialog").showModal();
}

function maintenanceWorkActiveContext() {
  const draft = state.maintenanceWorkReportDraft;
  return draft?.contexts.find(item => item.key === draft.activeContextKey) || null;
}

function maintenanceWorkSelectionKey(role = state.maintenanceWorkReportDraft?.activeRole || "") {
  const draft = state.maintenanceWorkReportDraft;
  return `${draft?.activeContextKey || ""}|${role}`;
}

function maintenanceWorkReportRoleGroups() {
  const draft = state.maintenanceWorkReportDraft;
  if (!draft) return "";
  const context = maintenanceWorkActiveContext();
  if (!context) return "";
  const peopleById = new Map(draft.people.map(person => [person.id, person]));
  return context.roles.map(role => {
    const ids = [...(draft.selections.get(`${context.key}|${role}`) || [])];
    const names = ids.map(id => peopleById.get(id)?.name).filter(Boolean);
    const submitted = draft.report.routine?.roleStatuses?.[role] === "已提报";
    const submittedClass = submitted ? `submitted ${role === "放行" ? "release" : "routine"}` : "";
    return `<button class="maintenance-work-role ${draft.activeRole === role ? "active" : ""} ${submittedClass}" type="button" data-maint-work-role="${escapeHtml(role)}"><span><strong>${escapeHtml(role)}</strong><small>${submitted ? "已提报" : `${ids.length} 人`}</small></span><em>${escapeHtml(names.slice(0, 3).join("、"))}${names.length > 3 ? ` +${names.length - 3}` : ""}</em></button>`;
  }).join("");
}

function maintenanceWorkRoleEditable() {
  const draft = state.maintenanceWorkReportDraft;
  if (!draft) return false;
  if (draft.reportType === "finalize" && draft.activeRole === "放行") return false;
  if (draft.reportType === "routine" && draft.activeRole === "放行") return draft.releaseEditable;
  return true;
}

function maintenanceWorkReportPersonRow(person, selected) {
  const draft = state.maintenanceWorkReportDraft;
  const role = draft?.activeRole || "";
  const contextId = String(draft?.activeContextKey || "context").replace(/[^a-zA-Z0-9_-]/g, "-");
  const id = `maint-work-person-${contextId}-${role}-${person.id}`;
  const isRelease = role === "放行";
  const editable = maintenanceWorkRoleEditable();
  return `<div class="maintenance-person-row ${selected ? "selected" : ""} ${editable ? "" : "locked"}"><input id="${escapeHtml(id)}" type="${isRelease ? "radio" : "checkbox"}" ${isRelease ? `name="maint-final-release-${escapeHtml(contextId)}"` : ""} data-maint-work-person="${escapeHtml(person.id)}" ${selected ? "checked" : ""} ${editable ? "" : "disabled"}><label class="maintenance-person-info" for="${escapeHtml(id)}"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.team || "未设置")}</small></label><span class="maintenance-person-role">${escapeHtml(role)}</span></div>`;
}

function renderMaintenanceWorkReportPicker() {
  const draft = state.maintenanceWorkReportDraft;
  if (!draft) return "";
  if (!draft.activeRole) return '<div class="status-line">当前维修机会没有非放行工种。</div>';
  const key = maintenanceWorkSelectionKey();
  const selectedIds = draft.selections.get(key) || new Set();
  const order = draft.selectionOrder.get(key) || new Map();
  const term = draft.search.trim().toLocaleLowerCase("zh-CN");
  const selected = draft.people.filter(person => selectedIds.has(person.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const candidates = draft.people.filter(person => {
    if (selectedIds.has(person.id)) return false;
    const teamMatch = draft.team === "全部班组" || (person.team || "未设置") === draft.team;
    return teamMatch && (!term || person.name.toLocaleLowerCase("zh-CN").includes(term));
  }).sort((a, b) => String(a.team || "").localeCompare(String(b.team || ""), "zh-CN") || a.name.localeCompare(b.name, "zh-CN"));
  return [...selected.map(person => maintenanceWorkReportPersonRow(person, true)), ...candidates.map(person => maintenanceWorkReportPersonRow(person, false))].join("") || '<div class="status-line">没有匹配人员。</div>';
}

function renderMaintenanceWorkReportDialog() {
  const draft = state.maintenanceWorkReportDraft;
  const body = $("#maintenanceWorkReportDialogBody");
  if (!draft || !body) return;
  const teams = ["全部班组", ...Array.from(new Set(draft.people.map(person => person.team || "未设置"))).sort((a, b) => a.localeCompare(b, "zh-CN"))];
  const context = maintenanceWorkActiveContext();
  const total = [...draft.selections.values()].reduce((sum, ids) => sum + ids.size, 0);
  const { flight } = draft.report;
  const isCreateNonroutine = draft.reportType === "nonroutine-create";
  const title = draft.reportType === "routine" ? "例行报工" : draft.reportType === "nonroutine" ? "非例行报工" : isCreateNonroutine ? "新增非例行并报工" : "报工确认";
  const showContextTabs = draft.contexts.length > 1 || isCreateNonroutine || draft.reportType === "nonroutine";
  const contextTabs = showContextTabs ? `<div class="maintenance-report-contexts">${draft.contexts.map((item, index) => {
    const createLabel = isCreateNonroutine ? `单项${index + 1}` : item.label || `单项${index + 1}`;
    const removable = (["finalize", "nonroutine"].includes(draft.reportType) && item.ownerType === "subtask") || (isCreateNonroutine && draft.contexts.length > 1);
    const deleteAttribute = isCreateNonroutine ? `data-maint-remove-temp-nonroutine="${escapeHtml(item.key)}"` : `data-maint-delete-report-subtask="${escapeHtml(item.key)}"`;
    return `<div class="maintenance-report-context-wrap"><button type="button" class="maintenance-report-context ${item.key === draft.activeContextKey ? "active" : ""}" data-maint-work-context="${escapeHtml(item.key)}"><strong>${escapeHtml(createLabel)}</strong>${!isCreateNonroutine && item.ownerType === "subtask" ? `<small>${item.standardHours ? `${escapeHtml(item.standardHours)}h` : "未填写工时"}</small>` : ""}</button>${removable ? `<button class="maintenance-report-context-delete" type="button" ${deleteAttribute} title="删除当前单项" aria-label="删除${escapeHtml(createLabel)}">×</button>` : ""}</div>`;
  }).join("")}</div>` : "";
  const activeFeedback = context?.ownerType === "subtask"
    ? `<label class="maintenance-work-feedback">非例行报工说明<textarea rows="3" data-maint-temp-field="reportExplanation" placeholder="填写本项非例行报工说明（可选）">${escapeHtml(context.reportExplanation || "")}</textarea></label>`
    : ["routine", "finalize"].includes(draft.reportType)
      ? `<label class="maintenance-work-feedback">例行报工说明<textarea id="maintWorkReportFeedback" rows="3" placeholder="填写例行反馈说明（可选）">${escapeHtml(draft.feedback)}</textarea></label>`
      : "";
  const lockedRelease = draft.reportType === "finalize" && draft.lockedRelease
    ? `<div class="maintenance-locked-release"><strong>放行（已锁定）</strong><span>${escapeHtml(draft.lockedRelease.userName || "-")} · ${escapeHtml(draft.lockedRelease.team || "未设置")}</span></div>`
    : "";
  body.innerHTML = `<div class="dialog-head maintenance-dispatch-head"><h2>${title} <small>${escapeHtml(flight.flightNo)} · ${escapeHtml(flight.aircraftNo)} · ${escapeHtml(flight.aircraftType || "-")} · ${escapeHtml(flight.opportunity)}</small></h2><button class="icon-btn" data-close="maintenanceWorkReportDialog" type="button">×</button></div>
    <form id="maintenanceWorkReportForm" class="entry-grid">
      ${contextTabs}
      ${["nonroutine", "finalize", "nonroutine-create"].includes(draft.reportType) ? `<button class="btn secondary maintenance-add-temp-report" type="button" data-maint-add-temp-nonroutine>${isCreateNonroutine ? "新增" : "增加临时非例行"}</button>` : ""}
      ${context?.ownerType === "subtask" ? `<div class="maintenance-temporary-fields">
        <label>章节<input data-maint-temp-field="chapter" value="${escapeHtml(context.chapter || "")}" placeholder="填写章节"></label>
        <label>标题<input data-maint-temp-field="title" value="${escapeHtml(context.label)}" placeholder="填写标题"></label>
        <label>类别<select data-maint-temp-field="category">${optionList(subtaskCategories, subtaskCategories.includes(context.category) ? context.category : "其他")}</select></label>
        <label>工时<input type="number" min="0.1" step="0.1" data-maint-temp-field="standardHours" value="${escapeHtml(context.standardHours ?? "")}" placeholder="小时"></label>
      </div>` : ""}
      ${lockedRelease}
      <div class="maintenance-work-role-groups">${maintenanceWorkReportRoleGroups() || '<div class="status-line">当前没有需要选择人员的工种。</div>'}</div>
      ${context ? `<div class="maintenance-picker-tools"><select id="maintWorkReportTeam">${teams.map(team => `<option value="${escapeHtml(team)}" ${team === draft.team ? "selected" : ""}>${escapeHtml(team)}</option>`).join("")}</select><input id="maintWorkReportSearch" class="search" value="${escapeHtml(draft.search)}" placeholder="搜索姓名" autocomplete="off"><span class="maintenance-selected-count">已选 ${total} 人次</span></div><div id="maintenanceWorkReportPicker" class="maintenance-people-picker">${renderMaintenanceWorkReportPicker()}</div>` : ""}
      ${activeFeedback}
      <div class="maintenance-review-message ${draft.message ? "show" : ""}">${escapeHtml(draft.message)}</div>
      <div class="form-actions maintenance-work-report-actions">${isCreateNonroutine && Number(draft.draftVersion || 0) > 0 ? `<button class="btn danger secondary" type="button" data-maint-work-delete-draft ${draft.busy ? "disabled" : ""}>删除草稿</button>` : ""}<button class="btn secondary" type="button" data-close="maintenanceWorkReportDialog">取消</button>${isCreateNonroutine ? `<button class="btn secondary" type="button" data-maint-work-save-draft ${draft.busy ? "disabled" : ""}>保存</button>` : draft.reportType === "routine" ? `<button class="btn secondary" type="button" data-maint-work-save-routine ${draft.busy ? "disabled" : ""}>保存</button>` : draft.reportType === "nonroutine" ? `<button class="btn secondary" type="button" data-maint-work-save-nonroutine ${draft.busy ? "disabled" : ""}>保存</button>` : draft.reportType === "finalize" ? `<button class="btn secondary" type="button" data-maint-work-save-confirmation ${draft.busy ? "disabled" : ""}>保存</button>` : ""}<button class="btn" type="button" data-maint-work-submit ${draft.busy ? "disabled" : ""}>${draft.reportType === "finalize" ? "确认并提交复核" : "提交并锁定"}</button></div>
    </form>`;
}

function maintenanceWorkReportEntries(context = maintenanceWorkActiveContext(), { includeRelease = false } = {}) {
  const draft = state.maintenanceWorkReportDraft;
  if (!draft || !context) return [];
  return context.roles.filter(role => includeRelease || role !== "放行").flatMap(role => [...(draft.selections.get(`${context.key}|${role}`) || [])].map(userId => ({ role, userId })));
}

function maintenanceWorkReleaseUserId() {
  const draft = state.maintenanceWorkReportDraft;
  const context = draft?.contexts.find(item => item.ownerType === "flight");
  return context ? [...(draft.selections.get(`${context.key}|放行`) || [])][0] || "" : "";
}

function maintenanceNonroutinePayload({ preserveIncomplete = false } = {}) {
  const draft = state.maintenanceWorkReportDraft;
  return draft.contexts.filter(context => context.ownerType === "subtask").map(context => ({
    id: context.temporary ? "" : context.ownerId,
    clientId: context.clientId || "",
    temporary: !!context.temporary,
    chapter: context.chapter || "",
    title: context.label,
    category: subtaskCategories.includes(context.category) ? context.category : "其他",
    standardHours: preserveIncomplete ? context.standardHours : Number(context.standardHours || 0),
    reportExplanation: context.reportExplanation || "",
    entries: maintenanceWorkReportEntries(context)
  }));
}

async function saveMaintenanceNonroutineDraft() {
  const draft = state.maintenanceWorkReportDraft;
  if (!draft || draft.reportType !== "nonroutine-create" || draft.busy) return;
  draft.busy = true;
  draft.message = "正在保存共享草稿...";
  renderMaintenanceWorkReportDialog();
  try {
    const result = await maintenanceService.saveNonroutineDraft(draft.report.flight.id, {
      items: maintenanceNonroutinePayload({ preserveIncomplete: true }),
      version: draft.draftVersion
    });
    draft.draftVersion = result.draft?.version ?? draft.draftVersion;
    closeDialog($("#maintenanceWorkReportDialog"));
    await refreshMaintenance();
  } catch (error) {
    draft.busy = false;
    draft.message = error.message;
    renderMaintenanceWorkReportDialog();
  }
}

async function deleteMaintenanceNonroutineDraft() {
  const draft = state.maintenanceWorkReportDraft;
  if (!draft || draft.reportType !== "nonroutine-create" || draft.busy || Number(draft.draftVersion || 0) <= 0) return;
  if (!confirm("确定删除整份非例行共享草稿吗？删除后其他派工人员也无法继续查看。")) return;
  draft.busy = true;
  draft.message = "正在删除共享草稿...";
  renderMaintenanceWorkReportDialog();
  try {
    await maintenanceService.deleteNonroutineDraft(draft.report.flight.id, draft.draftVersion);
    closeDialog($("#maintenanceWorkReportDialog"));
    await refreshMaintenance();
  } catch (error) {
    draft.busy = false;
    draft.message = error.message;
    renderMaintenanceWorkReportDialog();
  }
}

async function saveMaintenanceRoutineDraft() {
  const draft = state.maintenanceWorkReportDraft;
  if (!draft || draft.reportType !== "routine" || draft.busy) return;
  draft.feedback = $("#maintWorkReportFeedback")?.value ?? draft.feedback ?? "";
  draft.busy = true;
  draft.message = "正在保存派工调整...";
  renderMaintenanceWorkReportDialog();
  try {
    await maintenanceService.saveRoutineDraft(draft.report.flight.id, {
      entries: maintenanceWorkReportEntries(),
      feedback: draft.feedback,
      releaseUserId: maintenanceWorkReleaseUserId() || draft.releaseUserId,
      version: draft.draftVersion
    });
    closeDialog($("#maintenanceWorkReportDialog"));
    await refreshMaintenance();
  } catch (error) {
    draft.busy = false;
    draft.message = error.message;
    renderMaintenanceWorkReportDialog();
  }
}

async function saveMaintenanceNonroutineReport() {
  const draft = state.maintenanceWorkReportDraft;
  if (!draft || draft.reportType !== "nonroutine" || draft.busy) return;
  draft.busy = true;
  draft.message = "正在保存非例行及派工调整...";
  renderMaintenanceWorkReportDialog();
  try {
    await maintenanceService.submitReport(draft.report.flight.id, "nonroutine", {
      mode: "save",
      items: maintenanceNonroutinePayload({ preserveIncomplete: true }),
      deletedSubtaskIds: [...draft.deletedSubtaskIds],
      revision: draft.nonroutineRevision
    });
    closeDialog($("#maintenanceWorkReportDialog"));
    await refreshMaintenance();
  } catch (error) {
    draft.busy = false;
    draft.message = error.message;
    renderMaintenanceWorkReportDialog();
  }
}

async function submitMaintenanceWorkReport() {
  const draft = state.maintenanceWorkReportDraft;
  if (!draft || draft.busy) return;
  draft.feedback = $("#maintWorkReportFeedback")?.value ?? draft.feedback ?? "";
  draft.releaseUserId = maintenanceWorkReleaseUserId() || draft.releaseUserId;
  draft.busy = true;
  draft.message = draft.reportType === "finalize" ? "正在校验并提交待复核数据..." : "正在提交并锁定报工...";
  renderMaintenanceWorkReportDialog();
  try {
    if (draft.reportType === "routine") await maintenanceService.submitReport(draft.report.flight.id, "routine", {
      entries: maintenanceWorkReportEntries(),
      feedback: draft.feedback,
      releaseUserId: draft.releaseUserId,
      version: draft.report.progress?.batches?.routine?.version ?? null,
      draftVersion: draft.draftVersion
    });
    else if (["nonroutine", "nonroutine-create"].includes(draft.reportType)) await maintenanceService.submitReport(draft.report.flight.id, "nonroutine", {
      mode: "submit",
      items: maintenanceNonroutinePayload(),
      version: draft.report.progress?.batches?.nonroutine?.version ?? null,
      draftVersion: draft.reportType === "nonroutine-create" ? draft.draftVersion : null,
      revision: draft.nonroutineRevision
    });
    else await maintenanceService.finalizeReports(draft.report.flight.id, { routineEntries: draft.contexts.find(item => item.ownerType === "flight") ? maintenanceWorkReportEntries(draft.contexts.find(item => item.ownerType === "flight")) : [], nonroutineItems: maintenanceNonroutinePayload(), deletedSubtaskIds: [...draft.deletedSubtaskIds], feedback: draft.feedback });
    closeDialog($("#maintenanceWorkReportDialog"));
    await refreshMaintenance();
  } catch (error) {
    draft.busy = false;
    draft.message = error.message;
    renderMaintenanceWorkReportDialog();
  }
}

async function saveMaintenanceReportConfirmation() {
  const draft = state.maintenanceWorkReportDraft;
  if (!draft || draft.reportType !== "finalize" || draft.busy) return;
  draft.feedback = $("#maintWorkReportFeedback")?.value ?? draft.feedback ?? "";
  draft.releaseUserId = maintenanceWorkReleaseUserId() || draft.releaseUserId;
  draft.busy = true;
  draft.message = "正在保存报工确认内容...";
  renderMaintenanceWorkReportDialog();
  try {
    await maintenanceService.saveReportConfirmation(draft.report.flight.id, {
      releaseUserId: draft.releaseUserId,
      routineEntries: draft.contexts.find(item => item.ownerType === "flight") ? maintenanceWorkReportEntries(draft.contexts.find(item => item.ownerType === "flight")) : [],
      nonroutineItems: maintenanceNonroutinePayload(),
      deletedSubtaskIds: [...draft.deletedSubtaskIds],
      feedback: draft.feedback
    });
    closeDialog($("#maintenanceWorkReportDialog"));
    await refreshMaintenance();
  } catch (error) {
    draft.busy = false;
    draft.message = error.message;
    renderMaintenanceWorkReportDialog();
  }
}

function maintenanceReviewTaskKey(task) {
  return `${task.ownerType}:${task.ownerId}`;
}

function maintenanceReviewTaskDraft(task) {
  const selections = new Map(task.roles.map(item => [item.role, new Set()]));
  (task.assignments || []).forEach(item => {
    if (!selections.has(item.role)) selections.set(item.role, new Set());
    selections.get(item.role).add(item.userId);
  });
  return { ...task, selections, changed: false };
}

function maintenanceArchiveRoleTemplates(tasks = []) {
  const source = tasks.find(task => task.ownerType === "subtask")?.roles || [];
  const ratios = new Map(source.map(item => [item.role, Number(item.ratio || 0)]));
  return ["主作", "检验", "辅助"].map(role => ({
    role,
    metricType: "hours",
    ratio: ratios.get(role) || (role === "主作" ? 0.4 : 0.3)
  }));
}

function maintenanceArchivedSubtaskDraft(tasks = []) {
  const ownerId = `new-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return maintenanceReviewTaskDraft({
    ownerType: "subtask",
    ownerId,
    isNew: true,
    chapter: "",
    title: "",
    category: "工卡指令",
    standardHours: "",
    reportExplanation: "",
    baseHours: 0,
    baseHoursSource: "归档补录",
    subtitle: "新增非例行",
    status: "新增",
    editable: true,
    roles: maintenanceArchiveRoleTemplates(tasks),
    assignments: []
  });
}

async function openMaintenanceReviewDialog(flightId, focusKey = "") {
  ensureMaintenanceDialogs();
  const { review } = await maintenanceService.getReview(flightId);
  state.maintenanceReviewDraft = {
    review,
    tasks: review.tasks.map(maintenanceReviewTaskDraft),
    newSubtasks: [],
    canEdit: !review.flight.requiresChangeReason || state.user.role === "admin",
    activeTaskKey: "",
    activeRole: "",
    team: "全部班组",
    search: "",
    composing: false,
    busy: false,
    reason: "",
    message: ""
  };
  renderMaintenanceReviewDialog();
  $("#maintenanceReviewDialog").showModal();
  requestAnimationFrame(() => document.querySelector(`[data-maint-review-task="${CSS.escape(focusKey)}"]`)?.scrollIntoView({ block: "start" }));
}

function maintenanceReviewPerson(task, role, userId) {
  return (task.assignments || []).find(item => item.role === role && item.userId === userId) || null;
}

function maintenanceReviewCalculatedHours(task, role) {
  if (role === "放行") return 0;
  const count = task.selections.get(role)?.size || 0;
  const ratio = Number(task.roles.find(item => item.role === role)?.ratio || 0);
  return count ? Number(((Number(task.baseHours || 0) * ratio) / count).toFixed(2)) : 0;
}

function maintenanceReviewRoleHtml(task, roleInfo, peopleById) {
  const draft = state.maintenanceReviewDraft;
  const role = roleInfo.role;
  const selected = [...(task.selections.get(role) || [])];
  const hours = maintenanceReviewCalculatedHours(task, role);
  const isSortie = roleInfo.metricType === "sorties" || role === "放行";
  const active = draft.activeTaskKey === maintenanceReviewTaskKey(task) && draft.activeRole === role;
  const people = selected.map(userId => {
    const person = peopleById.get(userId) || { name: "未知人员", team: "未设置" };
    const saved = maintenanceReviewPerson(task, role, userId);
    const feedbackState = saved ? (saved.feedback === "后台复核调整" ? "后台复核调整" : saved.status || "-") : "后台复核调整";
    const reportTime = saved?.submittedAt ? ` · ${formatDisplayDate(saved.submittedAt)}` : "";
    const resultText = isSortie
      ? (!saved || Number(saved.reportedSorties || 0) > 0 ? "1架次" : "待上报")
      : `${escapeHtml(hours)}h`;
    return `<div class="maintenance-review-person"><span><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.team || "未设置")}</small></span><span class="maintenance-review-feedback">${escapeHtml(feedbackState)}${escapeHtml(reportTime)}</span><b>${resultText}</b></div>`;
  }).join("") || '<div class="status-line compact">暂无人员</div>';
  return `<section class="maintenance-review-role ${active ? "active" : ""}">
    <div class="maintenance-review-role-head"><div><strong>${escapeHtml(role)}</strong><span>${isSortie ? `架次 · ${selected.length} 人` : `比例 ${escapeHtml(roleInfo.ratio)} · ${selected.length} 人`}</span></div>${task.editable && draft.canEdit ? `<button class="link-btn" type="button" data-maint-review-edit-role="${escapeHtml(role)}" data-maint-review-task-key="${escapeHtml(maintenanceReviewTaskKey(task))}">${active ? "收起" : "调整人员"}</button>` : ""}</div>
    ${people}${active ? maintenanceReviewPickerHtml(task, role, peopleById) : ""}
  </section>`;
}

function maintenanceReviewPickerHtml(task, role, peopleById) {
  const draft = state.maintenanceReviewDraft;
  const selected = task.selections.get(role) || new Set();
  const term = draft.search.trim().toLocaleLowerCase("zh-CN");
  const people = [...draft.review.people].filter(person => {
    if (selected.has(person.id)) return true;
    const teamMatches = draft.team === "全部班组" || (person.team || "未设置") === draft.team;
    return teamMatches && (!term || String(person.name || "").toLocaleLowerCase("zh-CN").includes(term));
  }).sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || String(a.team || "").localeCompare(String(b.team || ""), "zh-CN") || String(a.name || "").localeCompare(String(b.name || ""), "zh-CN"));
  const teams = ["全部班组", ...Array.from(new Set(draft.review.people.map(person => person.team || "未设置"))).sort((a, b) => a.localeCompare(b, "zh-CN"))];
  const inputType = role === "放行" ? "radio" : "checkbox";
  const inputName = role === "放行" ? ` name="review-release-${escapeHtml(task.ownerId)}"` : "";
  return `<div class="maintenance-review-picker">
    <div class="maintenance-picker-tools"><select data-maint-review-team>${teams.map(team => `<option value="${escapeHtml(team)}" ${team === draft.team ? "selected" : ""}>${escapeHtml(team)}</option>`).join("")}</select><input class="search" data-maint-review-search value="${escapeHtml(draft.search)}" placeholder="搜索姓名" autocomplete="off"><span class="maintenance-selected-count">已选 ${selected.size} 人</span></div>
    <div class="maintenance-review-candidates">${people.map(person => `<label class="maintenance-person-row ${selected.has(person.id) ? "selected" : ""}"><input type="${inputType}"${inputName} data-maint-review-person="${escapeHtml(person.id)}" data-maint-review-role="${escapeHtml(role)}" data-maint-review-owner="${escapeHtml(maintenanceReviewTaskKey(task))}" ${selected.has(person.id) ? "checked" : ""}><span class="maintenance-person-info"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.team || "未设置")}</small></span><span class="maintenance-person-role">${escapeHtml(role)}</span></label>`).join("") || '<div class="status-line">没有匹配人员。</div>'}</div>
  </div>`;
}

function maintenanceArchivedNewSubtaskHtml(task, peopleById, index) {
  return `<article class="maintenance-review-task maintenance-review-new-task" data-maint-review-task="${escapeHtml(maintenanceReviewTaskKey(task))}">
    <div class="maintenance-review-task-head"><div><strong>新增非例行 ${index + 1}</strong><span>归档补录 · 保存后直接计入已确认数据</span></div><button class="icon-btn maintenance-review-remove-new" type="button" data-maint-review-remove-new="${escapeHtml(task.ownerId)}" aria-label="删除该新增项目" title="删除">×</button></div>
    <div class="maintenance-review-new-fields">
      <label>章节<input value="${escapeHtml(task.chapter || "")}" data-maint-review-new-field="chapter" data-maint-review-new-id="${escapeHtml(task.ownerId)}"></label>
      <label>标题<input value="${escapeHtml(task.title || "")}" data-maint-review-new-field="title" data-maint-review-new-id="${escapeHtml(task.ownerId)}" required></label>
      <label>类别<select data-maint-review-new-field="category" data-maint-review-new-id="${escapeHtml(task.ownerId)}">${optionList(["工卡指令", "单项工作", "其他"], task.category || "工卡指令")}</select></label>
      <label>标准工时<input type="number" min="0.1" step="0.1" value="${escapeHtml(task.standardHours || "")}" data-maint-review-new-field="standardHours" data-maint-review-new-id="${escapeHtml(task.ownerId)}" required></label>
      <label class="maintenance-review-new-explanation">报工说明<textarea rows="2" data-maint-review-new-field="reportExplanation" data-maint-review-new-id="${escapeHtml(task.ownerId)}" placeholder="对本项工作进行说明（非必填）">${escapeHtml(task.reportExplanation || "")}</textarea></label>
    </div>
    <div class="maintenance-review-roles">${task.roles.map(role => maintenanceReviewRoleHtml(task, role, peopleById)).join("")}</div>
  </article>`;
}

function renderMaintenanceReviewDialog() {
  const draft = state.maintenanceReviewDraft;
  const body = $("#maintenanceReviewDialogBody");
  if (!draft || !body) return;
  const previousScrollTop = body.querySelector(".maintenance-review-tree")?.scrollTop || 0;
  const { flight } = draft.review;
  const peopleById = new Map(draft.review.people.map(person => [person.id, person]));
  body.innerHTML = `<div class="dialog-head maintenance-review-head"><h2>任务树复核 <small>${escapeHtml(flight.flightNo)} · ${escapeHtml(flight.aircraftNo)} · ${escapeHtml(flight.opportunity)}</small></h2><button class="icon-btn" data-close="maintenanceReviewDialog" type="button">×</button></div>
    <div class="maintenance-review-summary"><span>机型 ${escapeHtml(flight.aircraftType || "-")}</span><span>机位 ${escapeHtml(flight.stand || "-")}</span><span>${escapeHtml(flight.date || "-")}</span>${flight.requiresChangeReason && draft.canEdit ? `<button class="btn secondary maintenance-review-add-new" type="button" data-maint-review-add-new>新增非例行</button>` : ""}</div>
    <div class="maintenance-review-tree">${draft.tasks.map((task, index) => `<article class="maintenance-review-task" data-maint-review-task="${escapeHtml(maintenanceReviewTaskKey(task))}">
      <div class="maintenance-review-task-head"><div><strong>${index === 0 ? "主任务 · " : "非例行 · "}${escapeHtml(task.title)}</strong><span>${escapeHtml(task.subtitle)} · ${escapeHtml(task.baseHoursSource)} · 基础 ${escapeHtml(task.baseHours)}h</span></div><div class="actions"><span class="status-badge ${task.status === "已确认" ? "ok" : task.status === "待复核" ? "warn" : task.status === "已提报" ? "submitted" : ""}">${escapeHtml(task.status)}</span>${index > 0 && draft.canEdit ? `<button class="link-btn danger-text" type="button" data-maint-review-delete-subtask="${escapeHtml(task.ownerId)}">删除</button>` : ""}</div></div>
      ${!task.editable ? `<div class="maintenance-review-blocked">当前任务尚未完成，仅展示派工与反馈数据。</div>` : ""}
      <div class="maintenance-review-roles">${task.roles.map(role => maintenanceReviewRoleHtml(task, role, peopleById)).join("")}</div>
    </article>`).join("")}${draft.newSubtasks.map((task, index) => maintenanceArchivedNewSubtaskHtml(task, peopleById, index)).join("")}</div>
    ${flight.requiresChangeReason ? `<label class="maintenance-review-reason"><strong>修改原因</strong><textarea data-maint-review-reason rows="2" placeholder="请填写本次修改原因">${escapeHtml(draft.reason || "")}</textarea><span>已确认数据修改必须填写原因</span></label>` : ""}
    <div class="maintenance-review-message ${draft.message ? "show" : ""}">${escapeHtml(draft.message)}</div>
    <div class="form-actions maintenance-review-actions ${flight.requiresChangeReason ? "archive-mode" : ""}"><button class="btn secondary" type="button" data-close="maintenanceReviewDialog">取消</button>${draft.canEdit ? `<button class="btn" type="button" data-maint-review-save ${draft.busy ? "disabled" : ""}>${flight.requiresChangeReason ? "保存归档修改" : "保存"}</button>${flight.requiresChangeReason ? "" : `<button class="btn" type="button" data-maint-review-confirm ${draft.busy ? "disabled" : ""}>确认整棵任务树</button>`}` : ""}</div>`;
  const tree = body.querySelector(".maintenance-review-tree");
  if (tree) tree.scrollTop = previousScrollTop;
}

function maintenanceReviewPayload() {
  const draft = state.maintenanceReviewDraft;
  return draft.tasks.map(task => ({
    ownerType: task.ownerType,
    ownerId: task.ownerId,
    assignments: [...task.selections.entries()].flatMap(([role, ids]) => [...ids].map(userId => ({ userId, role })))
  }));
}

function maintenanceReviewNewSubtaskPayload() {
  const draft = state.maintenanceReviewDraft;
  return draft.newSubtasks.map(task => ({
    clientId: task.ownerId,
    chapter: String(task.chapter || "").trim(),
    title: String(task.title || "").trim(),
    category: task.category || "工卡指令",
    standardHours: Number(task.standardHours || 0),
    reportExplanation: String(task.reportExplanation || "").trim(),
    assignments: [...task.selections.entries()].flatMap(([role, ids]) => [...ids].map(userId => ({ userId, role })))
  }));
}

async function submitMaintenanceReview(mode) {
  const draft = state.maintenanceReviewDraft;
  if (!draft || draft.busy) return;
  if (!draft.canEdit) return;
  if (draft.review.flight.requiresChangeReason && !String(draft.reason || "").trim()) {
    draft.message = "修改已确认数据必须填写修改原因";
    renderMaintenanceReviewDialog();
    requestAnimationFrame(() => {
      const input = $("#maintenanceReviewDialogBody")?.querySelector("[data-maint-review-reason]");
      input?.focus();
      input?.scrollIntoView({ block: "nearest" });
    });
    return;
  }
  for (let index = 0; index < draft.newSubtasks.length; index++) {
    const task = draft.newSubtasks[index];
    if (!String(task.title || "").trim() || !(Number(task.standardHours || 0) > 0) || ![...task.selections.values()].some(selected => selected.size)) {
      draft.message = `新增非例行 ${index + 1} 必须填写标题、有效标准工时，并至少选择一名人员`;
      renderMaintenanceReviewDialog();
      requestAnimationFrame(() => document.querySelector(`[data-maint-review-task="${CSS.escape(maintenanceReviewTaskKey(task))}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
      return;
    }
  }
  draft.busy = true;
  draft.message = mode === "confirm" ? "正在校验并确认整棵任务树..." : "正在保存人员和工时...";
  renderMaintenanceReviewDialog();
  try {
    const { review } = await maintenanceService.saveReview(draft.review.flight.id, mode, maintenanceReviewPayload(), draft.reason || "", maintenanceReviewNewSubtaskPayload());
    if (mode === "confirm") {
      closeDialog($("#maintenanceReviewDialog"));
      await refreshMaintenance();
      return;
    }
    if (review.flight.requiresChangeReason) {
      closeDialog($("#maintenanceReviewDialog"));
      await refreshMaintenance();
      return;
    }
    state.maintenanceReviewDraft = { ...draft, review, tasks: review.tasks.map(maintenanceReviewTaskDraft), newSubtasks: [], activeTaskKey: "", activeRole: "", team: "全部班组", search: "", reason: "", busy: false, message: "已保存，任务状态保持不变。" };
    renderMaintenanceReviewDialog();
    await refreshMaintenance();
  } catch (error) {
    draft.busy = false;
    draft.message = error.message;
    renderMaintenanceReviewDialog();
  }
}

function renderMaintenanceArchiveDeleteDialog() {
  const draft = state.maintenanceArchiveDeleteDraft;
  const body = $("#maintenanceArchiveDeleteDialogBody");
  if (!draft || !body) return;
  const status = draft.flight.status === "已确认" || draft.flight.archivedAt ? "已确认" : "待复核";
  const isSubtask = draft.targetType === "subtask";
  const objectLabel = isSubtask ? "非例行" : "维修机会";
  body.innerHTML = `<div class="dialog-head"><h2>删除${status}${objectLabel}</h2><button class="icon-btn" data-close="maintenanceArchiveDeleteDialog" type="button">×</button></div>
    <div class="maintenance-archive-delete-summary"><strong>${escapeHtml(draft.flight.flightNo || "-")} · ${escapeHtml(draft.flight.aircraftNo || "-")}</strong><span>${escapeHtml(draft.flight.date || "-")} · ${escapeHtml(draft.flight.workKind || draft.flight.workType || "其他")}</span></div>
    ${isSubtask ? `<div class="maintenance-archive-delete-summary"><strong>${escapeHtml(draft.subtask?.title || "未命名非例行")}</strong><span>${escapeHtml(draft.subtask?.category || "其他")} · ${escapeHtml(draft.subtask?.standardHours || 0)}h</span></div>` : ""}
    <p class="maintenance-archive-delete-warning">${isSubtask ? "仅该非例行及其派工、反馈和工时数据将永久移除；同一维修机会的其他内容不受影响，审计记录会保留。" : "删除后维修机会、非例行、工时及架次等关联数据将永久移除，审计记录会保留。"}</p>
    <label class="maintenance-archive-delete-reason">删除原因<textarea rows="4" data-maint-archive-delete-reason placeholder="请填写删除原因">${escapeHtml(draft.reason || "")}</textarea></label>
    <div class="maintenance-review-message ${draft.message ? "show" : ""}">${escapeHtml(draft.message)}</div>
    <div class="form-actions maintenance-archive-delete-actions"><button class="btn secondary" type="button" data-close="maintenanceArchiveDeleteDialog">取消</button><button class="btn danger" type="button" data-maint-archive-delete-submit ${draft.busy ? "disabled" : ""}>${draft.busy ? "正在删除..." : "确认删除"}</button></div>`;
}

function openMaintenanceArchiveDeleteDialog(targetType, targetId) {
  const found = targetType === "subtask" ? findMaintenanceSubtask(targetId) : null;
  const flight = targetType === "subtask" ? found?.flight : findMaintenanceFlight(targetId);
  const subtask = targetType === "subtask" ? found?.subtask : null;
  const confirmed = flight?.status === "已确认" || Boolean(flight?.archivedAt);
  if (!flight || (confirmed && state.user.role !== "admin") || !canManageMaintenance()) return;
  ensureMaintenanceDialogs();
  state.maintenanceArchiveDeleteDraft = { targetType, flight, subtask, reason: "", busy: false, message: "" };
  renderMaintenanceArchiveDeleteDialog();
  $("#maintenanceArchiveDeleteDialog").showModal();
}

async function submitMaintenanceArchiveDelete() {
  const draft = state.maintenanceArchiveDeleteDraft;
  if (!draft || draft.busy) return;
  if (!String(draft.reason || "").trim()) {
    const status = draft.flight.status === "已确认" || draft.flight.archivedAt ? "已确认" : "待复核";
    draft.message = `删除${status}数据必须填写删除原因`;
    renderMaintenanceArchiveDeleteDialog();
    requestAnimationFrame(() => $("#maintenanceArchiveDeleteDialogBody")?.querySelector("[data-maint-archive-delete-reason]")?.focus());
    return;
  }
  draft.busy = true;
  draft.message = "";
  renderMaintenanceArchiveDeleteDialog();
  try {
    if (draft.targetType === "subtask") {
      await maintenanceService.removeSubtask(draft.subtask.id, draft.reason.trim());
    } else {
      await maintenanceService.removeFlight(draft.flight.id, draft.reason.trim());
    }
    closeDialog($("#maintenanceArchiveDeleteDialog"));
    await refreshMaintenance();
  } catch (error) {
    draft.busy = false;
    draft.message = error.message;
    renderMaintenanceArchiveDeleteDialog();
  }
}

function importRecipientPeople() {
  const people = normalizePeople(state.settings.people || []);
  const byId = new Map(people.map(person => [person.id, person]));
  demoUsers.forEach(user => {
    if (!byId.has(user.id)) {
      byId.set(user.id, { id: user.id, name: user.name, department: user.department || "未设置", team: user.team || "未设置" });
    }
  });
  return Array.from(byId.values());
}

function isFullRecipientRecord(record, people) {
  const recipientIds = new Set((record.recipients || []).map(person => person.id));
  const settingPeople = normalizePeople(state.settings.people || []);
  const settingIds = settingPeople.map(person => person.id).filter(Boolean);
  if (!settingIds.length) return false;
  return settingIds.every(id => recipientIds.has(id));
}

function shouldRepairImportedRead(record, people) {
  if (record.importedRead || record.importedReadComplete || record.sourceSet === "batchImport") return true;
  const admin = demoUsers.find(user => user.role === "admin");
  return record.createdBy === admin?.id &&
    record.publisherId === admin?.id &&
    isFullRecipientRecord(record, people);
}

function repairImportedReadReceipts() {
  const people = importRecipientPeople();
  if (!people.length) return;
  const receipts = receiptService.list();
  const now = new Date().toISOString();
  let recordsChanged = false;
  let receiptsChanged = false;
  const nextRecords = state.records.map(record => {
    const shouldRepair = shouldRepairImportedRead(record, people);
    if (!shouldRepair) return record;
    const recipientMap = new Map((record.recipients || []).map(person => [person.id, person]));
    people.forEach(person => {
      if (!recipientMap.has(person.id)) {
        recipientMap.set(person.id, person);
        recordsChanged = true;
      }
      const receipt = receipts.find(item => item.recordId === record.id && item.userId === person.id);
      if (receipt) {
        if (!receipt.readAt || receipt.isOverdue) {
          receipt.readAt = receipt.readAt || now;
          receipt.isOverdue = false;
          receiptsChanged = true;
        }
      } else {
        receipts.push({ recordId: record.id, userId: person.id, readAt: now, isOverdue: false, remindCount: 0, lastRemindedAt: "" });
        receiptsChanged = true;
      }
    });
    if (!record.importedRead) recordsChanged = true;
    return { ...record, importedRead: true, sourceSet: record.sourceSet || "batchImport", recipients: Array.from(recipientMap.values()) };
  });
  if (recordsChanged) {
    state.records = nextRecords;
    recordService.saveAll(nextRecords);
  }
  if (receiptsChanged) receiptService.saveAll(receipts);
}

async function inflateBytes(bytes) {
  if (!("DecompressionStream" in window)) throw new Error("当前浏览器不支持直接解析 xlsx");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntries(buffer) {
  const data = new Uint8Array(buffer), view = new DataView(buffer);
  let eocd = -1;
  for (let index = data.length - 22; index >= 0; index--) {
    if (view.getUint32(index, true) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("未识别到 xlsx 结构");
  const total = view.getUint16(eocd + 10, true), cdOffset = view.getUint32(eocd + 16, true), decoder = new TextDecoder(), files = {};
  let offset = cdOffset;
  for (let count = 0; count < total; count++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true), size = view.getUint32(offset + 20, true), nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true), localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(data.slice(offset + 46, offset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true), localExtraLength = view.getUint16(localOffset + 28, true), start = localOffset + 30 + localNameLength + localExtraLength, raw = data.slice(start, start + size);
    files[name] = method === 0 ? raw : method === 8 ? await inflateBytes(raw) : raw;
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const builtinXlsxFormats = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  14: "m/d/yy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yy h:mm",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mmss.0",
  49: "@"
};

function parseXlsxStyles(files, decoder, parser) {
  const result = { styleFormats: [] };
  const file = files["xl/styles.xml"];
  if (!file) return result;
  const xml = parser.parseFromString(decoder.decode(file), "application/xml");
  const customFormats = {};
  Array.from(xml.getElementsByTagName("numFmt")).forEach(node => {
    const id = Number(node.getAttribute("numFmtId"));
    if (Number.isFinite(id)) customFormats[id] = node.getAttribute("formatCode") || "";
  });
  const cellXfs = xml.getElementsByTagName("cellXfs")[0];
  if (!cellXfs) return result;
  Array.from(cellXfs.getElementsByTagName("xf")).forEach(node => {
    const id = Number(node.getAttribute("numFmtId"));
    result.styleFormats.push(customFormats[id] || builtinXlsxFormats[id] || "");
  });
  return result;
}

function excelFormatSection(format) {
  return String(format || "General").split(";")[0] || "General";
}

function stripExcelFormatLiterals(format) {
  return excelFormatSection(format)
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/_.?/g, "")
    .replace(/\*.?/g, "")
    .replace(/\[[^\]]+\]/g, "")
    .toLowerCase();
}

function isExcelTextFormat(format) {
  return stripExcelFormatLiterals(format).trim() === "@";
}

function isExcelPercentFormat(format) {
  return stripExcelFormatLiterals(format).includes("%");
}

function isExcelTimeFormat(format) {
  const raw = excelFormatSection(format).toLowerCase();
  const clean = stripExcelFormatLiterals(format);
  return /\[[hms]+\]/.test(raw) || /h+/.test(clean) || /s+/.test(clean) || /m{1,2}:/.test(clean);
}

function isExcelDateFormat(format) {
  const clean = stripExcelFormatLiterals(format);
  return /y+/.test(clean) || /d+/.test(clean) || /m+[\/-]d+/.test(clean) || /d+[\/-]m+/.test(clean);
}

function excelDecimalPlaces(format) {
  const clean = stripExcelFormatLiterals(format).replace(/%/g, "");
  const match = clean.match(/\.([0#]+)/);
  return match ? match[1].length : 0;
}

function xlsxSerialToDate(serial, date1904 = false) {
  const number = Number(serial);
  if (!Number.isFinite(number)) return null;
  const whole = Math.floor(number);
  const fraction = number - whole;
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(base + whole * 86400000 + Math.round(fraction * 86400000));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatExcelDateTime(serial, format, date1904) {
  const date = xlsxSerialToDate(serial, date1904);
  if (!date) return String(serial ?? "");
  const raw = excelFormatSection(format).toLowerCase();
  const hasDate = isExcelDateFormat(format);
  const hasTime = isExcelTimeFormat(format);
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hours = pad2(date.getUTCHours());
  const minutes = pad2(date.getUTCMinutes());
  const seconds = pad2(date.getUTCSeconds());
  if (/\[h+\]/.test(raw)) {
    const totalHours = Math.floor(Number(serial) * 24);
    return raw.includes("ss") ? `${totalHours}:${minutes}:${seconds}` : `${totalHours}:${minutes}`;
  }
  if (hasDate && hasTime) return raw.includes("ss") ? `${year}-${month}-${day} ${hours}:${minutes}:${seconds}` : `${year}-${month}-${day} ${hours}:${minutes}`;
  if (hasTime && !hasDate) return raw.includes("ss") ? `${hours}:${minutes}:${seconds}` : `${hours}:${minutes}`;
  return `${year}-${month}-${day}`;
}

function formatExcelNumber(rawValue, format, date1904) {
  const raw = String(rawValue ?? "");
  const number = Number(raw);
  if (!format || stripExcelFormatLiterals(format).toLowerCase() === "general" || !Number.isFinite(number)) return raw;
  if (isExcelTextFormat(format)) return raw;
  if (isExcelDateFormat(format) || isExcelTimeFormat(format)) return formatExcelDateTime(number, format, date1904);
  if (isExcelPercentFormat(format)) return `${(number * 100).toFixed(excelDecimalPlaces(format))}%`;
  const clean = stripExcelFormatLiterals(format);
  if (/^0+$/.test(clean) && number >= 0 && Number.isInteger(number)) return String(number).padStart(clean.length, "0");
  if (/[0#]/.test(clean)) {
    const decimals = excelDecimalPlaces(format);
    return number.toLocaleString("zh-CN", {
      useGrouping: clean.includes(","),
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }
  return raw;
}

function inlineXlsxText(cell) {
  const inline = cell.getElementsByTagName("is")[0];
  return inline ? inline.textContent || "" : "";
}

function xlsxCellDisplayValue(cell, shared, styles, date1904) {
  const type = cell.getAttribute("t");
  const valueNode = cell.getElementsByTagName("v")[0];
  const rawValue = valueNode ? valueNode.textContent || "" : inlineXlsxText(cell);
  if (!rawValue && type !== "inlineStr") return "";
  if (type === "s") return shared[Number(rawValue)] || "";
  if (type === "inlineStr") return rawValue;
  if (type === "b") return rawValue === "1" ? "TRUE" : "FALSE";
  if (type === "str" || type === "e") return rawValue;
  const styleIndex = Number(cell.getAttribute("s"));
  const format = Number.isFinite(styleIndex) ? styles.styleFormats[styleIndex] || "" : "";
  return formatExcelNumber(rawValue, format, date1904);
}

function parseSheetRows(sheetFile, shared, decoder, parser, styles = { styleFormats: [] }, date1904 = false) {
  const sheet = parser.parseFromString(decoder.decode(sheetFile), "application/xml"), rows = [];
  Array.from(sheet.getElementsByTagName("row")).forEach(rowNode => {
    const row = [];
    Array.from(rowNode.getElementsByTagName("c")).forEach(cell => {
      const ref = cell.getAttribute("r") || "", column = (ref.match(/[A-Z]+/) || ["A"])[0].split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
      row[column] = xlsxCellDisplayValue(cell, shared, styles, date1904);
    });
    rows.push(row.map(value => value || ""));
  });
  return rows;
}

async function parseXlsxWorkbook(file) {
  const files = await readZipEntries(await file.arrayBuffer()), decoder = new TextDecoder(), parser = new DOMParser(), shared = [];
  const styles = parseXlsxStyles(files, decoder, parser);
  if (files["xl/sharedStrings.xml"]) {
    const sharedXml = parser.parseFromString(decoder.decode(files["xl/sharedStrings.xml"]), "application/xml");
    Array.from(sharedXml.getElementsByTagName("si")).forEach(item => shared.push(item.textContent || ""));
  }
  const workbookFile = files["xl/workbook.xml"];
  if (!workbookFile) {
    const fallback = files["xl/worksheets/sheet1.xml"];
    if (!fallback) throw new Error("未找到第一张工作表");
    return [{ name: "Sheet1", rows: parseSheetRows(fallback, shared, decoder, parser, styles, false) }];
  }
  const workbook = parser.parseFromString(decoder.decode(workbookFile), "application/xml");
  const workbookPr = workbook.getElementsByTagName("workbookPr")[0];
  const date1904 = ["1", "true"].includes(String(workbookPr?.getAttribute("date1904") || "").toLowerCase());
  const rels = relsMap(files["xl/_rels/workbook.xml.rels"] ? decoder.decode(files["xl/_rels/workbook.xml.rels"]) : "");
  const sheets = Array.from(workbook.getElementsByTagName("sheet")).map((sheet, index) => {
    const relId = sheet.getAttribute("r:id");
    const target = rels[relId] || `worksheets/sheet${index + 1}.xml`;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`.replace("xl//", "xl/");
    const sheetFile = files[path];
    return sheetFile ? { name: sheet.getAttribute("name") || `Sheet${index + 1}`, rows: parseSheetRows(sheetFile, shared, decoder, parser, styles, date1904) } : null;
  }).filter(Boolean);
  if (!sheets.length) throw new Error("未找到可预览的工作表");
  return sheets;
}

async function parseXlsx(file) {
  const sheets = await parseXlsxWorkbook(file);
  return sheets[0]?.rows || [];
}

function peopleFromRows(rows) {
  const filtered = rows.filter(row => row.some(cell => String(cell || "").trim()));
  if (filtered.length < 2) return { people: [], skipped: 0 };
  const headers = filtered[0].map(normalizeHeader);
  const indexOf = names => headers.findIndex(header => names.includes(header));
  const idIndex = indexOf(["工号", "员工号", "人员工号"]);
  const nameIndex = indexOf(["姓名", "人员", "名字"]);
  const teamIndex = indexOf(["班组", "小组", "组别"]);
  let skipped = 0;
  const people = filtered.slice(1).map(row => {
    const id = String(row[idIndex] || "").trim();
    const name = String(row[nameIndex] || "").trim();
    const team = String(row[teamIndex] || "").trim();
    if (idIndex < 0 || nameIndex < 0 || teamIndex < 0 || !/^\d{8}$/.test(id) || !name || !team) {
      skipped++;
      return null;
    }
    return { id, name, department: "未设置", team };
  }).filter(Boolean);
  return { people: normalizePeople(people), skipped };
}

function userRowsFromRows(rows) {
  const filtered = rows.map(row => row.map(cell => String(cell ?? "").trim())).filter(row => row.some(Boolean));
  if (!filtered.length) return { rows: [], skipped: 0 };
  const headers = filtered[0].map(normalizeHeader);
  const indexOf = names => headers.findIndex(header => names.includes(header));
  const usernameIndex = indexOf(["账号", "用户名", "登录账号"]);
  const nameIndex = indexOf(["姓名", "名称"]);
  const teamIndex = indexOf(["班组", "组别"]);
  const roleIndex = indexOf(["角色"]);
  const passwordIndex = indexOf(["初始密码", "密码"]);
  const tabsIndex = indexOf(["页签权限", "页签"]);
  const permsIndex = indexOf(["功能权限", "权限"]);
  const statusIndex = indexOf(["状态"]);
  const functionCategoryIndex = indexOf(["人员职能类别", "职能类别"]);
  const hasHeader = usernameIndex >= 0;
  let skipped = 0;
  const rowsOut = (hasHeader ? filtered.slice(1) : filtered).map(row => {
    const item = hasHeader ? {
      username: row[usernameIndex],
      name: row[nameIndex],
      team: row[teamIndex],
      role: row[roleIndex],
      password: row[passwordIndex],
      allowedTabs: row[tabsIndex],
      permissions: row[permsIndex],
      status: row[statusIndex],
      functionCategory: row[functionCategoryIndex]
    } : {
      username: row[0],
      name: row[1],
      team: row[2],
      role: row[3],
      password: row[4],
      allowedTabs: row[5],
      permissions: row[6],
      status: row[7],
      functionCategory: row[8]
    };
    if (!String(item.username || "").trim()) {
      skipped++;
      return null;
    }
    return item;
  }).filter(Boolean);
  return { rows: rowsOut, skipped };
}

async function userRowsFromFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls") && !name.endsWith(".xlsx")) throw new Error("xls 格式请先另存为 xlsx 或 CSV");
  if (name.endsWith(".xlsx")) return userRowsFromRows(await parseXlsx(file));
  return userRowsFromRows(parseCsv(await file.text()));
}

async function importUserFile() {
  const input = $("#userImportFile"), result = $("#userImportResult"), file = input?.files?.[0];
  if (!file) {
    result.textContent = "请选择用户 Excel 或 CSV 文件。";
    return;
  }
  try {
    const parsed = await userRowsFromFile(file);
    if (!parsed.rows.length) {
      result.textContent = "未识别到有效账号，请检查列名：账号、姓名、班组、角色、初始密码、页签权限、功能权限、状态。";
      return;
    }
    const response = await userService.importRows(parsed.rows);
    await renderAll();
    const next = $("#userImportResult");
    if (next) next.textContent = `新增 ${response.created} 个，更新 ${response.updated} 个，跳过 ${response.skipped + parsed.skipped} 行。`;
  } catch (error) {
    result.textContent = error.message;
  }
}

async function importPeopleFile() {
  const input = $("#peopleImportFile"), result = $("#peopleImportResult"), file = input?.files?.[0];
  if (!file) { result.textContent = "请选择人员 Excel 或 CSV 文件。"; return; }
  const name = file.name.toLowerCase();
  let rows = [];
  try {
    if (name.endsWith(".xlsx")) rows = await parseXlsx(file);
    else if (name.endsWith(".xls")) { result.textContent = "xls 格式请先另存为 xlsx 或 CSV。"; return; }
    else rows = parseCsv(await file.text());
  } catch (error) {
    result.textContent = `${error.message}。可将 Excel 另存为 CSV 后导入。`;
    return;
  }
  const parsed = peopleFromRows(rows);
  if (!parsed.people.length) {
    result.textContent = "未找到有效人员，请检查列名：工号、姓名、班组。";
    return;
  }
  state.settings = await settingsService.save({ ...state.settings, people: parsed.people });
  await renderAll();
  $("#peopleImportResult").textContent = `已导入 ${parsed.people.length} 人，跳过 ${parsed.skipped} 行。`;
}

async function importBatchRecords() {
  if (state.user.role !== "admin") return;
  const file = $("#settingsBatchImportFile")?.files?.[0];
  const result = $("#settingsBatchImportResult");
  if (!file) {
    result.textContent = "请选择 Excel 或 CSV 文件。";
    return;
  }
  let parsed;
  try {
    parsed = await batchRowsFromFile(file);
  } catch (error) {
    result.textContent = `${error.message}。可将文件另存为 xlsx 或 CSV 后导入。`;
    return;
  }
  const rows = parsed.rows;
  if (!rows.length) {
    result.textContent = "未识别到有效信息，请检查列名：日期、类别、标题、原文、发布者。";
    return;
  }
  const importResult = await recordService.importRows(rows);
  await renderAll();
  const nextResult = $("#settingsBatchImportResult");
  if (nextResult) nextResult.textContent = `已导入 ${importResult.created} 条，跳过 ${parsed.skipped + importResult.skipped} 行，生成已读回执 ${importResult.receiptCount} 人次。`;
}

document.addEventListener("click", async event => {
  const maintenanceDataMonthLabel = event.target.closest(".maintenance-data-month");
  if (maintenanceDataMonthLabel) {
    const input = maintenanceDataMonthLabel.querySelector("#maintenanceDataMonth");
    if (input && event.target !== input) {
      event.preventDefault();
      input.focus({ preventScroll: true });
      if (typeof input.showPicker === "function") {
        try {
          input.showPicker();
        } catch {}
      }
      return;
    }
  }
  const maintenanceDateLabel = event.target.closest(".maintenance-date-filter");
  if (maintenanceDateLabel) {
    const directInput = event.target.closest("input[type='date']");
    if (directInput) return;
    const input = maintenanceDateLabel.querySelector("#maintenanceStartDateFilter");
    if (input) {
      event.preventDefault();
      input.focus({ preventScroll: true });
      if (typeof input.showPicker === "function") {
        try {
          input.showPicker();
        } catch {
          input.click();
        }
      } else {
        input.click();
      }
      return;
    }
  }
  const opportunitySelectAll = event.target.closest("[data-maint-opportunity-all]");
  if (opportunitySelectAll) {
    state.maintenanceOpportunityFilters = new Set(maintenanceOpportunityOptions);
    renderMaintenance();
    return;
  }
  const activeStatusMenu = event.target.closest("[data-maint-status-menu]");
  document.querySelectorAll("[data-maint-status-menu][open]").forEach(menu => {
    if (menu !== activeStatusMenu) menu.open = false;
  });
  const close = event.target.closest("[data-close]");
  if (close) {
    const dialog = $("#" + close.dataset.close);
    closeDialog(dialog);
  }
  const more = event.target.closest("[data-more]");
  if (more) {
    const wrap = more.closest(".more-wrap");
    const shouldOpen = !wrap.classList.contains("open");
    closeOpenMenus(wrap);
    wrap.classList.toggle("open", shouldOpen);
    wrap.closest(".card")?.classList.toggle("menu-open", shouldOpen);
    if (shouldOpen) positionOpenMenu(wrap);
    event.stopPropagation();
  } else if (!event.target.closest(".more-wrap")) {
    closeOpenMenus();
  }
  const maintenanceTab = event.target.closest("[data-maint-tab]");
  if (maintenanceTab) {
    if (maintenanceTab.dataset.maintTab !== state.maintenanceTab) {
      clearTimeout(state.maintenanceDispatchClickTimer);
      state.maintenanceDispatchClickTimer = null;
      state.maintenanceDispatchOpenFlightId = "";
      state.maintenanceDispatchOpenNonroutineIds.clear();
      state.maintenanceExecuteOpenFlightId = "";
      state.maintenanceExecuteOpenDate = "";
      state.maintenanceFeedbackOpenId = "";
    }
    state.maintenanceTab = maintenanceTab.dataset.maintTab;
    refreshMaintenance();
    return;
  }
  const maintenanceDataView = event.target.closest("[data-maint-data-view]");
  if (maintenanceDataView) {
    state.maintenanceDataView = maintenanceDataView.dataset.maintDataView || "personal";
    renderMaintenance();
    return;
  }
  const maintenanceDataRange = event.target.closest("[data-maint-data-range]");
  if (maintenanceDataRange) {
    state.maintenanceDataRange = maintenanceDataRange.dataset.maintDataRange === "month" ? "month" : "half";
    refreshMaintenance();
    return;
  }
  const maintenanceCompositionPeriod = event.target.closest("[data-maint-composition-period]");
  if (maintenanceCompositionPeriod) {
    state.maintenanceCompositionPeriod = maintenanceCompositionPeriod.dataset.maintCompositionPeriod === "month" ? "month" : "day";
    renderMaintenance();
    return;
  }
  const maintenanceDataChart = event.target.closest("[data-maint-data-chart]");
  if (maintenanceDataChart) {
    state.maintenanceDataChartView = maintenanceDataChart.dataset.maintDataChart === "trend" ? "trend" : "composition";
    renderMaintenance();
    return;
  }
  const maintenancePersonalDetail = event.target.closest("[data-maint-personal-detail]");
  if (maintenancePersonalDetail) {
    openMaintenanceDataDetails(maintenancePersonalDetail);
    return;
  }
  const executeFlightToggle = event.target.closest("[data-maint-execute-toggle]");
  if (executeFlightToggle) {
    const flightId = executeFlightToggle.dataset.maintExecuteToggle;
    const opening = state.maintenanceExecuteOpenFlightId !== flightId;
    state.maintenanceExecuteOpenFlightId = opening ? flightId : "";
    state.maintenanceFeedbackOpenId = "";
    renderMaintenance();
    if (opening) {
      try {
        await hydrateMaintenanceFlight(flightId);
        renderMaintenance();
      } catch (error) {
        state.maintenanceExecuteOpenFlightId = "";
        renderMaintenance();
        alert(`读取维修机会失败：${error.message}`);
      }
    }
    return;
  }
  const executeDateToggle = event.target.closest("[data-maint-execute-date]");
  if (executeDateToggle) {
    const date = executeDateToggle.dataset.maintExecuteDate || "";
    state.maintenanceExecuteOpenDate = state.maintenanceExecuteOpenDate === date ? "" : date;
    state.maintenanceExecuteOpenFlightId = "";
    state.maintenanceFeedbackOpenId = "";
    renderMaintenance();
    return;
  }
  if (event.target.closest("[data-maint-execute-time-sort]")) {
    state.maintenanceExecuteTimeSort = state.maintenanceExecuteTimeSort === "asc" ? "desc" : "asc";
    renderMaintenance();
    return;
  }
  if (event.target.closest("[data-maint-import]")) {
    $("#maintenanceImportFile")?.click();
    return;
  }
  const maintenanceLoadMore = event.target.closest("[data-maint-load-more]");
  if (maintenanceLoadMore) {
    maintenanceLoadMore.disabled = true;
    try {
      await maintenanceService.loadMore();
      renderMaintenance();
    } catch (error) {
      maintenanceLoadMore.disabled = false;
      alert(`继续加载失败：${error.message}`);
    }
    return;
  }
  if (event.target.closest("[data-maint-create-flight]")) {
    openMaintenanceFlightDialog();
    return;
  }
  const addonButton = event.target.closest("[data-maint-add-subtask]");
  if (addonButton) {
    event.preventDefault();
    const flight = findMaintenanceFlight(addonButton.dataset.maintAddSubtask);
    if (flight) openMaintenanceSubtaskDialog(flight);
    return;
  }
  const nonroutineToggle = event.target.closest("[data-maint-toggle-subtasks]");
  if (nonroutineToggle) {
    event.preventDefault();
    const flightId = nonroutineToggle.dataset.maintToggleSubtasks;
    if (state.maintenanceDispatchOpenNonroutineIds.has(flightId)) {
      state.maintenanceDispatchOpenNonroutineIds.delete(flightId);
    } else {
      state.maintenanceDispatchOpenNonroutineIds.add(flightId);
    }
    renderMaintenance();
    return;
  }
  const dispatchButton = event.target.closest("[data-maint-dispatch]");
  if (dispatchButton) {
    const [ownerType, ownerId] = dispatchButton.dataset.maintDispatch.split(":");
    openMaintenanceDispatchDialog(ownerType, ownerId);
    return;
  }
  const reviewButton = event.target.closest("[data-maint-review]");
  if (reviewButton) {
    openMaintenanceReviewDialog(reviewButton.dataset.maintReview, reviewButton.dataset.maintReviewFocus || "").catch(error => alert(error.message));
    return;
  }
  const reportButton = event.target.closest("[data-maint-report]");
  if (reportButton) {
    openMaintenanceWorkReportDialog(reportButton.dataset.maintReport, reportButton.dataset.reportType || "routine").catch(error => alert(error.message));
    return;
  }
  const deleteReportSubtask = event.target.closest("[data-maint-delete-report-subtask]");
  if (deleteReportSubtask && state.maintenanceWorkReportDraft) {
    const draft = state.maintenanceWorkReportDraft;
    const key = deleteReportSubtask.dataset.maintDeleteReportSubtask;
    const index = draft.contexts.findIndex(item => item.key === key && item.ownerType === "subtask");
    if (index < 0) return;
    const context = draft.contexts[index];
    const scopeLabel = draft.reportType === "nonroutine" ? "本次非例行报工" : "本次报工确认";
    if (!confirm(`确定从${scopeLabel}中删除非例行“${context.label || "未命名"}”吗？\n点击保存或确认提交后生效。`)) return;
    if (!context.temporary && context.ownerId) draft.deletedSubtaskIds.add(context.ownerId);
    draft.contexts.splice(index, 1);
    context.roles.forEach(role => {
      draft.selections.delete(`${context.key}|${role}`);
      draft.selectionOrder.delete(`${context.key}|${role}`);
    });
    if (draft.activeContextKey === key) {
      const next = draft.contexts[Math.min(index, draft.contexts.length - 1)] || draft.contexts[0];
      draft.activeContextKey = next?.key || "";
      draft.activeRole = next?.roles?.[0] || "";
    }
    draft.message = "已标记删除，点击保存或确认提交后生效";
    renderMaintenanceWorkReportDialog();
    return;
  }
  const workContextButton = event.target.closest("[data-maint-work-context]");
  if (workContextButton && state.maintenanceWorkReportDraft) {
    const draft = state.maintenanceWorkReportDraft;
    const context = draft.contexts.find(item => item.key === workContextButton.dataset.maintWorkContext);
    if (!context) return;
    draft.activeContextKey = context.key;
    draft.activeRole = context.roles[0] || "";
    draft.team = "全部班组";
    draft.search = "";
    renderMaintenanceWorkReportDialog();
    return;
  }
  if (event.target.closest("[data-maint-add-temp-nonroutine]") && state.maintenanceWorkReportDraft) {
    const draft = state.maintenanceWorkReportDraft;
    const context = maintenanceTemporaryReportContext({
      title: draft.reportType === "nonroutine-create" ? "" : "临时非例行",
      category: "其他",
      standardHours: draft.reportType === "nonroutine-create" ? "" : 1
    }, draft.contexts.length);
    const key = context.key;
    draft.contexts.push(context);
    for (const role of context.roles) {
      draft.selections.set(`${key}|${role}`, new Set());
      draft.selectionOrder.set(`${key}|${role}`, new Map());
    }
    draft.activeContextKey = key;
    draft.activeRole = context.roles[0] || "";
    draft.team = "全部班组";
    draft.search = "";
    renderMaintenanceWorkReportDialog();
    return;
  }
  const removeTempNonroutine = event.target.closest("[data-maint-remove-temp-nonroutine]");
  if (removeTempNonroutine && state.maintenanceWorkReportDraft) {
    const draft = state.maintenanceWorkReportDraft;
    if (draft.contexts.length <= 1) {
      draft.message = "至少保留一个单项";
      renderMaintenanceWorkReportDialog();
      return;
    }
    const key = removeTempNonroutine.dataset.maintRemoveTempNonroutine;
    const index = draft.contexts.findIndex(item => item.key === key && item.temporary);
    if (index < 0) return;
    const [removed] = draft.contexts.splice(index, 1);
    removed.roles.forEach(role => {
      draft.selections.delete(`${removed.key}|${role}`);
      draft.selectionOrder.delete(`${removed.key}|${role}`);
    });
    const next = draft.contexts[Math.min(index, draft.contexts.length - 1)];
    draft.activeContextKey = next.key;
    draft.activeRole = next.roles[0] || "";
    draft.team = "全部班组";
    draft.search = "";
    renderMaintenanceWorkReportDialog();
    return;
  }
  const workRoleButton = event.target.closest("[data-maint-work-role]");
  if (workRoleButton && state.maintenanceWorkReportDraft) {
    state.maintenanceWorkReportDraft.activeRole = workRoleButton.dataset.maintWorkRole;
    renderMaintenanceWorkReportDialog();
    return;
  }
  if (event.target.closest("[data-maint-work-submit]")) {
    submitMaintenanceWorkReport();
    return;
  }
  if (event.target.closest("[data-maint-work-save-draft]")) {
    saveMaintenanceNonroutineDraft();
    return;
  }
  if (event.target.closest("[data-maint-work-delete-draft]")) {
    deleteMaintenanceNonroutineDraft();
    return;
  }
  if (event.target.closest("[data-maint-work-save-routine]")) {
    saveMaintenanceRoutineDraft();
    return;
  }
  if (event.target.closest("[data-maint-work-save-nonroutine]")) {
    saveMaintenanceNonroutineReport();
    return;
  }
  if (event.target.closest("[data-maint-work-save-confirmation]")) {
    saveMaintenanceReportConfirmation();
    return;
  }
  const reviewRoleButton = event.target.closest("[data-maint-review-edit-role]");
  if (reviewRoleButton && state.maintenanceReviewDraft) {
    const same = state.maintenanceReviewDraft.activeTaskKey === reviewRoleButton.dataset.maintReviewTaskKey && state.maintenanceReviewDraft.activeRole === reviewRoleButton.dataset.maintReviewEditRole;
    state.maintenanceReviewDraft.activeTaskKey = same ? "" : reviewRoleButton.dataset.maintReviewTaskKey;
    state.maintenanceReviewDraft.activeRole = same ? "" : reviewRoleButton.dataset.maintReviewEditRole;
    state.maintenanceReviewDraft.team = "全部班组";
    state.maintenanceReviewDraft.search = "";
    renderMaintenanceReviewDialog();
    if (!same) requestAnimationFrame(() => {
      $("#maintenanceReviewDialogBody")?.querySelector(".maintenance-review-role.active")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return;
  }
  if (event.target.closest("[data-maint-review-add-new]") && state.maintenanceReviewDraft?.canEdit) {
    const draft = state.maintenanceReviewDraft;
    const task = maintenanceArchivedSubtaskDraft(draft.tasks);
    draft.newSubtasks.push(task);
    draft.activeTaskKey = maintenanceReviewTaskKey(task);
    draft.activeRole = "主作";
    draft.team = "全部班组";
    draft.search = "";
    renderMaintenanceReviewDialog();
    requestAnimationFrame(() => document.querySelector(`[data-maint-review-task="${CSS.escape(maintenanceReviewTaskKey(task))}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
    return;
  }
  const removeReviewNew = event.target.closest("[data-maint-review-remove-new]");
  if (removeReviewNew && state.maintenanceReviewDraft?.canEdit) {
    const draft = state.maintenanceReviewDraft;
    draft.newSubtasks = draft.newSubtasks.filter(item => item.ownerId !== removeReviewNew.dataset.maintReviewRemoveNew);
    if (draft.activeTaskKey === `subtask:${removeReviewNew.dataset.maintReviewRemoveNew}`) {
      draft.activeTaskKey = "";
      draft.activeRole = "";
    }
    renderMaintenanceReviewDialog();
    return;
  }
  if (event.target.closest("[data-maint-review-save]")) {
    submitMaintenanceReview("save");
    return;
  }
  if (event.target.closest("[data-maint-review-confirm]")) {
    submitMaintenanceReview("confirm");
    return;
  }
  const reviewDeleteSubtask = event.target.closest("[data-maint-review-delete-subtask]");
  if (reviewDeleteSubtask) {
    const subtaskId = reviewDeleteSubtask.dataset.maintReviewDeleteSubtask;
    closeDialog($("#maintenanceReviewDialog"));
    openMaintenanceArchiveDeleteDialog("subtask", subtaskId);
    return;
  }
  const maintenanceRoleGroup = event.target.closest("[data-maint-role-group]");
  if (maintenanceRoleGroup && state.maintenanceDispatchDraft) {
    state.maintenanceDispatchDraft.activeRole = maintenanceRoleGroup.dataset.maintRoleGroup;
    renderMaintenanceDispatchPicker();
    return;
  }
  const clearMaintenanceRole = event.target.closest("[data-maint-clear-role]");
  if (clearMaintenanceRole && state.maintenanceDispatchDraft) {
    const role = clearMaintenanceRole.dataset.maintClearRole;
    if (state.maintenanceDispatchDraft.lockedRoles?.has(role)) return;
    state.maintenanceDispatchDraft.selections.get(role)?.clear();
    state.maintenanceDispatchDraft.selectionOrder.get(role)?.clear();
    renderMaintenanceDispatchPicker();
    return;
  }
  const deleteFlight = event.target.closest("[data-maint-delete-flight]");
  if (deleteFlight) {
    if (deleteFlight.dataset.maintDeleteProtected === "true") {
      openMaintenanceArchiveDeleteDialog("flight", deleteFlight.dataset.maintDeleteFlight);
      return;
    }
    (async () => {
      if (!confirm("确定删除该维修机会及其非例行吗？")) return;
      await maintenanceService.removeFlight(deleteFlight.dataset.maintDeleteFlight);
      await refreshMaintenance();
    })().catch(error => alert(error.message));
    return;
  }
  if (event.target.closest("[data-maint-archive-delete-submit]")) {
    submitMaintenanceArchiveDelete();
    return;
  }
  const deleteSubtask = event.target.closest("[data-maint-delete-subtask]");
  if (deleteSubtask) {
    if (deleteSubtask.dataset.maintDeleteProtected === "true") {
      openMaintenanceArchiveDeleteDialog("subtask", deleteSubtask.dataset.maintDeleteSubtask);
      return;
    }
    (async () => {
      if (!confirm("确定删除该非例行吗？")) return;
      await maintenanceService.removeSubtask(deleteSubtask.dataset.maintDeleteSubtask);
      await refreshMaintenance();
    })().catch(error => alert(error.message));
    return;
  }
  const releaseConfirm = event.target.closest("[data-maint-release-confirm]");
  if (releaseConfirm) {
    openMaintenanceReleaseConfirm(releaseConfirm.dataset.maintReleaseConfirm, releaseConfirm.dataset.maintFlightId || "");
    return;
  }
  if (event.target.closest("[data-maint-release-no]")) {
    closeDialog($("#maintenanceReleaseConfirmDialog"));
    return;
  }
  const releaseYes = event.target.closest("[data-maint-release-yes]");
  if (releaseYes) {
    (async () => {
      if (state.maintenanceReleaseConfirmSubmitting) return;
      const assignmentId = state.maintenanceReleaseConfirmAssignmentId;
      if (!assignmentId) return;
      setMaintenanceReleaseConfirmSubmitting(true);
      try {
        await maintenanceService.assignmentAction(assignmentId, "complete", { feedback: "" });
        setMaintenanceReleaseConfirmSubmitting(false);
        closeDialog($("#maintenanceReleaseConfirmDialog"));
        await refreshMaintenance();
      } catch (error) {
        setMaintenanceReleaseConfirmSubmitting(false);
        alert(error.message);
      }
    })().catch(error => {
      setMaintenanceReleaseConfirmSubmitting(false);
      alert(error.message);
    });
    return;
  }
  const toggleMaintenanceFeedback = event.target.closest("[data-maint-toggle-feedback]");
  if (toggleMaintenanceFeedback) {
    const assignmentId = toggleMaintenanceFeedback.dataset.maintToggleFeedback;
    state.maintenanceFeedbackOpenId = state.maintenanceFeedbackOpenId === assignmentId ? "" : assignmentId;
    renderMaintenance();
    return;
  }
  const cancelMaintenanceFeedback = event.target.closest("[data-maint-cancel-feedback]");
  if (cancelMaintenanceFeedback) {
    const assignmentId = cancelMaintenanceFeedback.dataset.maintCancelFeedback;
    delete state.maintenanceFeedbackDrafts[assignmentId];
    if (state.maintenanceFeedbackOpenId === assignmentId) state.maintenanceFeedbackOpenId = "";
    renderMaintenance();
    return;
  }
  const submitMaintenanceFeedback = event.target.closest("[data-maint-submit-feedback]");
  if (submitMaintenanceFeedback) {
    (async () => {
      const assignmentId = submitMaintenanceFeedback.dataset.maintSubmitFeedback;
      submitMaintenanceFeedback.disabled = true;
      submitMaintenanceFeedback.textContent = "正在提交...";
      await maintenanceService.assignmentAction(assignmentId, "complete", { feedback: state.maintenanceFeedbackDrafts[assignmentId] || "" });
      delete state.maintenanceFeedbackDrafts[assignmentId];
      if (state.maintenanceFeedbackOpenId === assignmentId) state.maintenanceFeedbackOpenId = "";
      await refreshMaintenance();
    })().catch(error => {
      submitMaintenanceFeedback.disabled = false;
      submitMaintenanceFeedback.textContent = "完成反馈";
      alert(error.message);
    });
    return;
  }
  if (event.target.closest("[data-maint-save-rules]")) {
    (async () => {
      const inputs = $$("[data-maint-rule]");
      const invalidInput = inputs.find(input => !Number.isFinite(Number(input.value)) || Number(input.value) < 0);
      if (invalidInput) {
        invalidInput.focus();
        throw new Error("工时和分配比例不能为负数。");
      }
      const routineInputs = inputs.filter(input => input.dataset.ruleType === "routineRatio");
      const invalidPrecision = routineInputs.find(input => Math.abs(Number(input.value) * 1000 - Math.round(Number(input.value) * 1000)) > 1e-8);
      if (invalidPrecision) {
        invalidPrecision.closest("details")?.setAttribute("open", "");
        invalidPrecision.focus();
        throw new Error("例行工种比例最多保留3位小数。");
      }
      for (const opportunity of maintenanceOpportunityOptions.filter(item => item !== "停场")) {
        const categoryInputs = routineInputs.filter(input => input.dataset.ruleOpportunity === opportunity);
        const total = categoryInputs.reduce((sum, input) => sum + Number(input.value || 0), 0);
        if (!categoryInputs.length || Math.abs(total - 1) > 0.0005) {
          const category = $$('[data-maint-rule-group]').find(item => item.dataset.maintRuleGroup === `routine:${opportunity}`);
          category?.setAttribute("open", "");
          category?.closest(".maintenance-rule-group")?.setAttribute("open", "");
          categoryInputs[0]?.focus();
          throw new Error(`${opportunity}例行工种比例合计必须为1，当前为${maintenanceRatioLabel(total)}。`);
        }
      }
      const rules = inputs.map(input => ({
        id: input.dataset.maintRule,
        rule_type: input.dataset.ruleType,
        name: input.dataset.ruleName,
        opportunity: input.dataset.ruleOpportunity || undefined,
        role: input.dataset.ruleRole || undefined,
        value: Number(input.value || 0)
      }));
      await maintenanceService.saveRules(rules);
      await refreshMaintenance();
      alert("规则已保存。");
    })().catch(error => alert(error.message));
    return;
  }
  const confirmHour = event.target.closest("[data-maint-confirm-hour]");
  if (confirmHour) {
    (async () => {
      await maintenanceService.confirmHour(confirmHour.dataset.maintConfirmHour);
      await refreshMaintenance();
    })().catch(error => alert(error.message));
    return;
  }
  const confirmSortie = event.target.closest("[data-maint-confirm-sortie]");
  if (confirmSortie) {
    (async () => {
      await maintenanceService.confirmSortie(confirmSortie.dataset.maintConfirmSortie);
      await refreshMaintenance();
    })().catch(error => alert(error.message));
    return;
  }
  const adjustHour = event.target.closest("[data-maint-adjust-hour]");
  if (adjustHour) {
    (async () => {
      const value = prompt("请输入调整后工时", "");
      if (value === null) return;
      await maintenanceService.adjustHour(adjustHour.dataset.maintAdjustHour, Number(value || 0));
      await refreshMaintenance();
    })().catch(error => alert(error.message));
    return;
  }
  if (event.target.closest("[data-maint-export]")) {
    window.open(maintenanceService.exportUrl(), "_blank", "noopener");
    return;
  }
  const dispatchCard = event.target.closest("[data-maint-dispatch-card]");
  if (dispatchCard && !event.target.closest("button,input,select,textarea,a,label")) {
    const flightId = dispatchCard.dataset.maintDispatchCard;
    clearTimeout(state.maintenanceDispatchClickTimer);
    state.maintenanceDispatchClickTimer = setTimeout(async () => {
      state.maintenanceDispatchClickTimer = null;
      const opening = state.maintenanceDispatchOpenFlightId !== flightId;
      state.maintenanceDispatchOpenFlightId = opening ? flightId : "";
      if (opening) state.maintenanceDispatchOpenNonroutineIds.add(flightId);
      else state.maintenanceDispatchOpenNonroutineIds.delete(flightId);
      renderMaintenance();
      if (opening) {
        try {
          await hydrateMaintenanceFlight(flightId);
          renderMaintenance();
        } catch (error) {
          state.maintenanceDispatchOpenFlightId = "";
          state.maintenanceDispatchOpenNonroutineIds.delete(flightId);
          renderMaintenance();
          alert(`读取维修机会失败：${error.message}`);
        }
      }
    }, 220);
    return;
  }
  if (!event.target.closest(".subpage-menu-wrap")) closeSubpageMenu();
});

document.addEventListener("dblclick", event => {
  if (event.target.closest("button,input,select,textarea,a,summary,label")) return;
  const card = event.target.closest("[data-maint-edit-target]");
  if (!card) return;
  clearTimeout(state.maintenanceDispatchClickTimer);
  state.maintenanceDispatchClickTimer = null;
  const [ownerType, ownerId] = card.dataset.maintEditTarget.split(":");
  if (ownerType === "flight") {
    const flight = findMaintenanceFlight(ownerId);
    if (flight) openMaintenanceFlightDialog(flight);
    return;
  }
  const { flight, subtask } = findMaintenanceSubtask(ownerId);
  if (flight && subtask) openMaintenanceSubtaskDialog(flight, subtask);
});

document.addEventListener("click", event => {
  if (event.target instanceof HTMLDialogElement) closeDialog(event.target);
});

$$(".top-tab").forEach(tab => tab.addEventListener("click", () => showPage(tab.dataset.page)));
$$(".subtab").forEach(tab => tab.addEventListener("click", () => showSubpage(tab.dataset.subpage)));
$("#homeInfoMetrics")?.addEventListener("click", event => {
  const button = event.target.closest("[data-home-info-filter]");
  if (!button) return;
  openInfoFromHome(button.dataset.homeInfoFilter);
});
$("#subpageMenuBtn").addEventListener("click", event => {
  event.stopPropagation();
  toggleSubpageMenu();
});
$("#loginBtn").addEventListener("click", () => showLoginPage());
$("#openChangePasswordBtn").addEventListener("click", openChangePasswordDialog);
$("#logoutBtn").addEventListener("click", async () => {
  sessionStorage.setItem(AUTO_LOGIN_SKIP_KEY, "1");
  stopMaintenanceSync();
  await authService.logout();
  state.user = emptyUser();
  state.loadedData = new Set();
  await navigate(ROUTES.login, { replace: true });
});
$("#openEntryBtn").addEventListener("click", () => openRecordForm());
$("#openFixedBtn").addEventListener("click", () => openFixedForm());
$("#viewerZoomOut").addEventListener("click", () => changeViewerZoom(-0.1));
$("#viewerZoomIn").addEventListener("click", () => changeViewerZoom(0.1));
$("#viewerZoomReset").addEventListener("click", resetViewerZoom);

$$(".demo-login").forEach(button => button.addEventListener("click", () => {
  const user = demoUsers.find(item => item.username === button.dataset.demoUser);
  $("#loginUser").value = user.username;
  $("#loginPass").value = user.password;
  performLogin();
}));

$("#rememberPassword").addEventListener("change", () => {
  if (!$("#rememberPassword").checked) $("#autoLogin").checked = false;
});

$("#autoLogin").addEventListener("change", () => {
  if ($("#autoLogin").checked) $("#rememberPassword").checked = true;
});

$("#loginForm").addEventListener("submit", event => {
  event.preventDefault();
  performLogin();
});

$("#changePasswordForm").addEventListener("submit", event => {
  event.preventDefault();
  submitChangePassword();
});

$("#loginForm").addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  performLogin();
});

$("#entryForm").addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = event.submitter || $("#entryForm .form-actions .btn:not(.secondary)");
  const originalText = submitButton?.textContent || "保存";
  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "正在保存...";
    }
    const id = $("#entryId").value;
    const existing = state.records.find(record => record.id === id);
    const payload = entryPayload(existing);
    const queuedFiles = collectQueuedFiles(state.recordFiles, $("#recordFiles"));
    let saved;
    if (id) saved = await recordService.update(id, payload);
    else saved = await recordService.create(payload);
    try {
      await uploadFiles("record", saved.id, queuedFiles, text => {
        if (submitButton) submitButton.textContent = text;
      });
    } catch (uploadError) {
      $("#entryDialog").close();
      resetRecordForm();
      await renderAll();
      alert(`信息已保存，附件上传失败：${uploadError.message}`);
      return;
    }
    $("#entryDialog").close();
    resetRecordForm();
    await renderAll();
  } catch (error) {
    if (isAuthExpired(error)) await handleAuthExpired("发布/保存失败：登录状态已失效。");
    else alert(`发布/保存失败：${error.message}`);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  }
});

$("#fixedForm").addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = event.submitter || $("#fixedForm .form-actions .btn:not(.secondary)");
  const originalText = submitButton?.textContent || "保存";
  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "正在保存...";
    }
    const id = $("#fixedId").value;
    const existing = state.fixedProjects.find(project => project.id === id);
    const queuedFiles = collectQueuedFiles(state.fixedFiles, $("#fixedFiles"));
    const payload = { ata: $("#fixedAta").value, title: $("#fixedTitle").value.trim(), contentHtml: sanitizeRichHtml($("#fixedContent").innerHTML), references: $("#fixedReferences").value.trim(), attachments: existing?.attachments || [] };
    const saved = id ? await fixedProjectService.update(id, payload) : await fixedProjectService.create(payload);
    await uploadFiles("fixedProject", saved.id, queuedFiles, text => {
      if (submitButton) submitButton.textContent = text;
    });
    $("#fixedDialog").close();
    resetFixedForm();
    await renderAll();
  } catch (error) {
    alert(`保存固化项目失败：${error.message}`);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  }
});

$("#monthSelect").addEventListener("change", () => {
  clearAllDeferredReclassify();
  state.activeMonth = $("#monthSelect").value;
  state.page = 1;
  renderRecords();
});
$("#categoryChips").addEventListener("click", event => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  clearAllDeferredReclassify();
  const category = button.dataset.category;
  if (category === "全部") state.selectedCategories.clear();
  else if (state.selectedCategories.has(category)) state.selectedCategories.delete(category);
  else state.selectedCategories.add(category);
  state.page = 1;
  renderRecords();
});
$("#statusChips").addEventListener("click", event => {
  const button = event.target.closest("[data-status]");
  if (!button) return;
  clearAllDeferredReclassify();
  state.statusFilter = button.dataset.status;
  if (state.statusFilter === "全部") state.activeMonth = "全部";
  state.page = 1;
  renderRecords();
});
$("#pageSizeSelect").addEventListener("change", () => { clearAllDeferredReclassify(); state.pageSize = Number($("#pageSizeSelect").value) || 15; state.page = 1; renderRecords(); });
$("#pageButtons").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  clearAllDeferredReclassify();
  if (button.dataset.page) state.page = Number(button.dataset.page);
  if (button.dataset.pageAction === "prev") state.page = Math.max(1, state.page - 1);
  if (button.dataset.pageAction === "next") state.page += 1;
  renderRecords();
});
$("#searchInput").addEventListener("input", () => { clearAllDeferredReclassify(); state.page = 1; renderRecords(); });
$("#fixedSearch").addEventListener("input", renderFixedProjects);
$("#fixedAtaFilter").addEventListener("change", renderFixedProjects);
$("#recipientSearch").addEventListener("input", () => renderRecipientPicker());
$("#recipientTeamFilter").addEventListener("change", () => renderRecipientPicker());
$("#recipientOptions").addEventListener("change", event => {
  const input = event.target.closest("input[data-recipient]");
  if (!input) return;
  if (input.checked) state.selectedRecipientIds.add(input.dataset.recipient);
  else state.selectedRecipientIds.delete(input.dataset.recipient);
});
$("#recipientSelectAll").addEventListener("click", () => {
  visibleRecipientIds().forEach(id => state.selectedRecipientIds.add(id));
  syncRecipientCheckboxes();
});
$("#recipientClearAll").addEventListener("click", () => {
  visibleRecipientIds().forEach(id => state.selectedRecipientIds.delete(id));
  syncRecipientCheckboxes();
});
$("#entryDate").closest("label").addEventListener("click", event => {
  const input = $("#entryDate");
  if (event.target === input) return;
  input.focus({ preventScroll: true });
  if (typeof input.showPicker === "function") {
    try { input.showPicker(); } catch {}
  }
});
$("#entryDate").addEventListener("change", () => {
  const input = $("#entryDate");
  input.blur();
  const body = $("#entryDialog .dialog-body");
  if (body) {
    body.setAttribute("tabindex", "-1");
    body.focus({ preventScroll: true });
  }
});

$("#cards").addEventListener("click", async event => {
  try {
    const article = event.target.closest("[data-record-id]");
    const record = article ? state.records.find(item => item.id === article.dataset.recordId) : null;
    if (!record) return;
    const panelButton = event.target.closest("[data-toggle-panel]");
    if (panelButton) {
      const box = article.querySelector(".original-panel");
      const willCollapse = !box.hidden;
      box.hidden = willCollapse;
      panelButton.textContent = box.hidden ? "展开原文" : "收起原文";
      if (willCollapse && state.deferFilterRecordIds.has(record.id)) {
        clearDeferredReclassify(record.id);
        if (state.statusFilter === "未读") {
          renderRecords();
          return;
        }
        refreshRecordCard(article, record);
      }
      const slot = article.querySelector(".attachment-slot");
      if (!box.hidden && slot) slot.innerHTML = renderAttachments(record, "record");
      if (!box.hidden && canTrackPersonalRead(record)) {
        await markRecordReadFromCard(article, record);
      }
    }
    if (event.target.closest("[data-favorite]")) { await favoriteService.toggle(record.id); renderRecords(); return; }
    if (event.target.closest("[data-edit-record]") && canEditRecord(record)) { openRecordForm(record); return; }
    if (event.target.closest("[data-void-record]") && canVoidRecord(record) && confirm("确定将这条信息标记为作废吗？作废后发布者和接收者将不可见，且不参与阅读统计。")) { await recordService.void(record.id); await renderAll(); return; }
    if (event.target.closest("[data-restore-record]") && canRestoreRecord(record) && confirm("确定恢复这条信息为已发布吗？恢复后将按新发布信息重新流转，原已读记录不再有效。")) { await recordService.restore(record.id); await renderAll(); return; }
    if (event.target.closest("[data-delete-record]") && canDeleteRecord(record) && confirm("确定删除这条信息吗？")) { await recordService.remove(record.id); await renderAll(); return; }
    if (event.target.closest("[data-feedback-record]") && canManageFeedbackRecord(record)) { openFeedback(record); return; }
    if (event.target.closest("[data-remind-record]")) {
      if (!canManageFeedbackRecord(record)) return;
      const unread = feedbackRows(record).filter(row => !row.receipt?.readAt).map(row => row.person.id);
      await receiptService.remind(record, unread);
      alert(`已记录催办 ${unread.length} 人。`);
      await renderAll();
      return;
    }
    if (event.target.closest("[data-export-record]") && canManageFeedbackRecord(record)) exportFeedback(record);
  } catch (error) {
    if (isAuthExpired(error)) await handleAuthExpired("操作失败：登录状态已失效。");
    else alert(`操作失败：${error.message}`);
  }
});

$("#fixedList").addEventListener("click", async event => {
  const article = event.target.closest("[data-fixed-id]");
  const project = article ? state.fixedProjects.find(item => item.id === article.dataset.fixedId) : null;
  if (!project) return;
  const panel = event.target.closest("[data-toggle-panel]");
  if (panel) {
    const box = article.querySelector(".fixed-panel");
    box.hidden = !box.hidden;
    panel.textContent = box.hidden ? "展开" : "收起";
  }
  if (event.target.closest("[data-edit-fixed]")) openFixedForm(project);
  if (event.target.closest("[data-delete-fixed]") && confirm("确定删除这个固化项目吗？")) { await fixedProjectService.remove(project.id); await renderAll(); }
  if (event.target.closest("[data-print-fixed]")) printFixed(project);
});

document.addEventListener("toggle", event => {
  const details = event.target.closest?.("[data-maint-rule-group]");
  if (!details) return;
  const key = details.dataset.maintRuleGroup;
  if (details.open) state.maintenanceRuleGroupsOpen.add(key);
  else state.maintenanceRuleGroupsOpen.delete(key);
  localStorage.setItem(
    MAINTENANCE_RULE_GROUPS_STORAGE_KEY,
    JSON.stringify([...state.maintenanceRuleGroupsOpen])
  );
}, true);

document.addEventListener("click", async event => {
  const feedbackRecordId = $("#feedbackDialog")?.dataset.recordId;
  const feedbackRecord = feedbackRecordId ? state.records.find(item => item.id === feedbackRecordId) : null;
  if (event.target.closest("[data-feedback-select-all]") && feedbackRecord) {
    $("#feedbackBody").querySelectorAll("input[data-feedback-user]").forEach(input => { input.checked = true; });
    return;
  }
  if (event.target.closest("[data-feedback-clear]") && feedbackRecord) {
    $("#feedbackBody").querySelectorAll("input[data-feedback-user]").forEach(input => { input.checked = false; });
    return;
  }
  if (event.target.closest("[data-feedback-bulk]") && feedbackRecord) {
    try {
      const userIds = Array.from($("#feedbackBody").querySelectorAll("input[data-feedback-user]:checked")).map(input => input.dataset.feedbackUser);
      const status = $("#feedbackBulkStatus")?.value || "已读";
      if (!userIds.length) {
        alert("请先选择需要修改的接收者。");
        return;
      }
      await receiptService.updateStatusBatch(feedbackRecord.id, userIds, status);
      renderRecords();
      renderStats();
      openFeedback(feedbackRecord);
    } catch (error) {
      alert(`修改失败：${error.message}`);
    }
    return;
  }

  const attachment = event.target.closest("[data-attachment]");
  if (attachment) {
    event.preventDefault();
    const file = findAttachment(attachment.dataset.attachment, attachment.dataset.ownerType, attachment.dataset.ownerId);
    const src = await attachmentSource(file) || attachment.getAttribute("href");
    if (!file) {
      alert("未找到附件内容。请重新上传该附件。");
      return;
    }
    $("#viewerTitle").textContent = attachment.dataset.name || "附件";
    resetViewerZoom();
    setViewerDownload(src, file.name || attachment.dataset.name || "附件");
    $("#viewerContent").innerHTML = '<div class="status-line">正在生成预览...</div>';
    $("#viewerDialog").showModal();
    const attachmentName = file?.name || attachment.dataset.name || "";
    const viewerMode = isPdfAttachment(file, attachmentName) ? "pdf-native" : isImageAttachment(file, attachmentName) ? "image-fit" : "";
    setViewerPreview(await renderAttachmentPreview(file, src), viewerMode ? { mode: viewerMode } : {});
  }
  const sheetTab = event.target.closest("[data-sheet-tab]");
  if (sheetTab) {
    const viewer = $("#viewerContent");
    const index = sheetTab.dataset.sheetTab;
    viewer.querySelectorAll(".sheet-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.sheetTab === index));
    viewer.querySelectorAll(".sheet-panel").forEach(panel => { panel.hidden = panel.dataset.sheetPanel !== index; });
  }
  const remove = event.target.closest("[data-remove-attachment]");
  if (remove && confirm("确定移除这个附件吗？")) {
    const attachmentId = remove.dataset.removeAttachment;
    const ownerType = remove.dataset.ownerType;
    const ownerId = remove.dataset.ownerId;
    await apiRequest(`/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE" });
    const owner = removeAttachmentFromState(attachmentId, ownerType, ownerId);
    if (ownerType === "record") {
      if ($("#entryId")?.value === ownerId) renderExistingRecordAttachments(owner);
      renderRecords();
    } else if (ownerType === "fixedProject") {
      renderFixedProjects();
    } else {
      await renderAll();
    }
  }
  if (event.target.id === "saveSettingsBtn") await saveSettingsFromForm();
  if (event.target.id === "settingsBatchImportBtn") importBatchRecords();
  if (event.target.id === "openUserCreateBtn") openUserDialog();
  if (event.target.id === "userImportBtn") await importUserFile();
  if (event.target.id === "openUserBatchBtn") openUserBatchDialog();
  const editUser = event.target.closest("[data-edit-user]");
  if (editUser) {
    const user = state.users.find(item => item.id === editUser.dataset.editUser);
    if (user) openUserDialog(user);
  }
  const resetUser = event.target.closest("[data-reset-user]");
  if (resetUser) {
    const user = state.users.find(item => item.id === resetUser.dataset.resetUser);
    if (!user) return;
    const password = prompt(`请输入 ${user.name || user.username} 的新密码`, "123456");
    if (!password) return;
    await userService.resetPassword(user.id, password);
    alert("密码已重置。");
  }
  const deleteUser = event.target.closest("[data-delete-user]");
  if (deleteUser) {
    const user = state.users.find(item => item.id === deleteUser.dataset.deleteUser);
    if (!user) return;
    if (!confirm(`确定删除账号 ${user.username} 吗？该人员会同步从接收对象、统计、收藏和阅读记录中移除。`)) return;
    await userService.remove(user.id);
    await renderAll();
  }
  const toggleUser = event.target.closest("[data-toggle-user]");
  if (toggleUser) {
    const user = state.users.find(item => item.id === toggleUser.dataset.toggleUser);
    if (!user) return;
    const nextStatus = user.status === "disabled" ? "active" : "disabled";
    if (!confirm(`确定${nextStatus === "disabled" ? "停用" : "启用"}账号 ${user.username} 吗？`)) return;
    await userService.update(user.id, { ...user, status: nextStatus });
    if (state.user?.id === user.id) state.user = await authService.current();
    await renderAll();
  }
  if (event.target.id === "exportStatsExcelBtn") exportStatsExcel();
  if (event.target.id === "exportStatsCsvBtn") exportStatsCsv();
  if (event.target.id === "clearStatsDatesBtn") {
    state.statsStartDate = "";
    state.statsEndDate = "";
    renderStats();
  }
});

document.addEventListener("input", event => {
  if (event.target.id === "maintWorkReportFeedback") {
    if (state.maintenanceWorkReportDraft) state.maintenanceWorkReportDraft.feedback = event.target.value;
    return;
  }
  if (event.target.matches("[data-maint-review-search]")) {
    const draft = state.maintenanceReviewDraft;
    if (!draft) return;
    draft.search = event.target.value;
    if (event.isComposing || draft.composing) return;
    renderMaintenanceReviewDialog();
    const input = $("[data-maint-review-search]");
    input?.focus();
    input?.setSelectionRange(draft.search.length, draft.search.length);
    return;
  }
  const maintenanceFeedbackInput = event.target.closest("[data-maint-feedback-input]");
  if (maintenanceFeedbackInput) {
    state.maintenanceFeedbackDrafts[maintenanceFeedbackInput.dataset.maintFeedbackInput] = maintenanceFeedbackInput.value;
    return;
  }
  if (event.target.id === "statsSearch") {
    state.statsSearch = event.target.value;
    if (event.isComposing || state.statsSearchComposing) return;
    scheduleStatsSearchRender(event.target);
  }
  if (event.target.id === "maintenanceSearch") {
    state.maintenanceSearch = event.target.value;
    refreshMaintenance();
  }
  if (event.target.id === "maintenanceFlightSearch") {
    state.maintenanceFlightSearch = event.target.value;
    if (event.isComposing || state.maintenanceFlightSearchComposing) return;
    scheduleMaintenanceFlightSearchRender(event.target);
  }
  if (event.target.id === "maintDispatchSearch") {
    const draft = state.maintenanceDispatchDraft;
    if (!draft) return;
    draft.search = event.target.value;
    if (event.isComposing || draft.composing) return;
    renderMaintenanceDispatchPicker();
    return;
  }
  if (event.target.id === "maintWorkReportSearch") {
    const draft = state.maintenanceWorkReportDraft;
    if (!draft) return;
    draft.search = event.target.value;
    if (event.isComposing || draft.composing) return;
    renderMaintenanceWorkReportDialog();
    const input = $("#maintWorkReportSearch");
    input?.focus();
    input?.setSelectionRange(draft.search.length, draft.search.length);
    return;
  }
  if (event.target.matches("[data-maint-temp-field]")) {
    const context = maintenanceWorkActiveContext();
    if (!context) return;
    const field = event.target.dataset.maintTempField;
    if (field === "chapter") context.chapter = event.target.value;
    else if (field === "title") context.label = event.target.value;
    else if (field === "category") context.category = event.target.value;
    else if (field === "standardHours") context.standardHours = event.target.value;
    else if (field === "reportExplanation") context.reportExplanation = event.target.value;
    return;
  }
  if (event.target.matches("[data-maint-review-reason]")) {
    if (state.maintenanceReviewDraft) state.maintenanceReviewDraft.reason = event.target.value;
    return;
  }
  if (event.target.matches("[data-maint-review-new-field]")) {
    const draft = state.maintenanceReviewDraft;
    const task = draft?.newSubtasks.find(item => item.ownerId === event.target.dataset.maintReviewNewId);
    if (!task) return;
    const field = event.target.dataset.maintReviewNewField;
    task[field] = event.target.value;
    if (field === "standardHours") task.baseHours = Number(event.target.value || 0);
    task.changed = true;
    return;
  }
  if (event.target.matches("[data-maint-archive-delete-reason]")) {
    if (state.maintenanceArchiveDeleteDraft) state.maintenanceArchiveDeleteDraft.reason = event.target.value;
    return;
  }
});

document.addEventListener("compositionstart", event => {
  if (event.target.matches("[data-maint-review-search]")) {
    if (state.maintenanceReviewDraft) state.maintenanceReviewDraft.composing = true;
    return;
  }
  if (event.target.id === "maintDispatchSearch") {
    if (state.maintenanceDispatchDraft) state.maintenanceDispatchDraft.composing = true;
    return;
  }
  if (event.target.id === "maintWorkReportSearch") {
    if (state.maintenanceWorkReportDraft) state.maintenanceWorkReportDraft.composing = true;
    return;
  }
  if (event.target.id === "maintenanceFlightSearch") {
    state.maintenanceFlightSearchComposing = true;
    if (state.maintenanceFlightSearchTimer) {
      clearTimeout(state.maintenanceFlightSearchTimer);
      state.maintenanceFlightSearchTimer = null;
    }
    return;
  }
  if (event.target.id !== "statsSearch") return;
  state.statsSearchComposing = true;
  if (state.statsSearchTimer) {
    clearTimeout(state.statsSearchTimer);
    state.statsSearchTimer = null;
  }
});

document.addEventListener("compositionend", event => {
  if (event.target.matches("[data-maint-review-search]")) {
    const draft = state.maintenanceReviewDraft;
    if (!draft) return;
    draft.composing = false;
    draft.search = event.target.value;
    renderMaintenanceReviewDialog();
    const input = $("[data-maint-review-search]");
    input?.focus();
    input?.setSelectionRange(draft.search.length, draft.search.length);
    return;
  }
  if (event.target.id === "maintDispatchSearch") {
    const draft = state.maintenanceDispatchDraft;
    if (!draft) return;
    draft.composing = false;
    draft.search = event.target.value;
    renderMaintenanceDispatchPicker();
    return;
  }
  if (event.target.id === "maintWorkReportSearch") {
    const draft = state.maintenanceWorkReportDraft;
    if (!draft) return;
    draft.composing = false;
    draft.search = event.target.value;
    renderMaintenanceWorkReportDialog();
    const input = $("#maintWorkReportSearch");
    input?.focus();
    input?.setSelectionRange(draft.search.length, draft.search.length);
    return;
  }
  if (event.target.id === "maintenanceFlightSearch") {
    state.maintenanceFlightSearchComposing = false;
    state.maintenanceFlightSearch = event.target.value;
    scheduleMaintenanceFlightSearchRender(event.target);
    return;
  }
  if (event.target.id !== "statsSearch") return;
  state.statsSearchComposing = false;
  state.statsSearch = event.target.value;
  scheduleStatsSearchRender(event.target);
});

document.addEventListener("submit", event => {
  if (event.target.id === "maintenanceFlightForm") {
    event.preventDefault();
    (async () => {
      const id = $("#maintFlightId").value;
      const payload = maintenanceFlightPayloadFromForm();
      if (id) await maintenanceService.updateFlight(id, payload);
      else await maintenanceService.createFlight(payload);
      $("#maintenanceTaskDialog").close();
      await refreshMaintenance();
    })().catch(error => alert(error.message));
    return;
  }
  if (event.target.id === "maintenanceSubtaskForm") {
    event.preventDefault();
    (async () => {
      const id = $("#maintSubtaskId").value;
      const flightId = $("#maintSubtaskFlightId").value;
      const payload = maintenanceSubtaskPayloadFromForm();
      if (id) await maintenanceService.updateSubtask(id, payload);
      else await maintenanceService.createSubtask(flightId, payload);
      $("#maintenanceTaskDialog").close();
      await refreshMaintenance();
    })().catch(error => alert(error.message));
    return;
  }
  if (event.target.id === "maintenanceDispatchForm") {
    event.preventDefault();
    (async () => {
      const assignments = maintenanceAssignmentsFromForm();
      if (!assignments.length) throw new Error("请至少选择一名派工人员");
      await maintenanceService.dispatch($("#maintDispatchOwnerType").value, $("#maintDispatchOwnerId").value, assignments);
      closeDialog($("#maintenanceDispatchDialog"));
      await refreshMaintenance();
    })().catch(error => alert(error.message));
    return;
  }
  if (event.target.id === "userBatchForm") {
    event.preventDefault();
    (async () => {
      try {
        const userIds = [...state.selectedUserIds];
        const updates = batchUserUpdatesFromForm();
        if (!userIds.length) throw new Error("请先选择账号");
        if (!Object.keys(updates).length) throw new Error("请至少勾选一个要应用的修改项");
        if (!confirm(`确定批量修改 ${userIds.length} 个账号吗？`)) return;
        const result = await userService.batchUpdate(userIds, updates);
        $("#userBatchDialog").close();
        state.selectedUserIds.clear();
        await renderAll();
        alert(`批量修改完成：已处理 ${result.updated || 0} 个账号${result.skippedProtected ? `，保护项跳过 ${result.skippedProtected} 项` : ""}${result.skipped ? `，不存在 ${result.skipped} 个` : ""}。`);
      } catch (error) {
        alert(error.message);
      }
    })();
    return;
  }
  if (event.target.id !== "userForm") return;
  event.preventDefault();
  (async () => {
    try {
      const id = $("#userId").value;
      const payload = userPayloadFromForm();
      if (id) await userService.update(id, payload);
      else await userService.create(payload);
      $("#userDialog").close();
      if (state.user?.id === id) state.user = await authService.current();
      await renderAll();
    } catch (error) {
      alert(error.message);
    }
  })();
});

document.addEventListener("change", async event => {
  if (event.target.matches("[data-maint-temp-field]")) {
    const context = maintenanceWorkActiveContext();
    if (!context) return;
    const field = event.target.dataset.maintTempField;
    if (field === "chapter") context.chapter = event.target.value;
    else if (field === "title") context.label = event.target.value;
    else if (field === "category") context.category = event.target.value;
    else if (field === "standardHours") context.standardHours = event.target.value;
    else if (field === "reportExplanation") context.reportExplanation = event.target.value;
    return;
  }
  if (event.target.id === "maintWorkReportTeam") {
    if (state.maintenanceWorkReportDraft) {
      state.maintenanceWorkReportDraft.team = event.target.value;
      renderMaintenanceWorkReportDialog();
    }
    return;
  }
  const workReportPerson = event.target.closest("[data-maint-work-person]");
  if (workReportPerson) {
    const draft = state.maintenanceWorkReportDraft;
    if (!draft) return;
    const key = maintenanceWorkSelectionKey();
    const selected = draft.selections.get(key);
    const order = draft.selectionOrder.get(key);
    const userId = workReportPerson.dataset.maintWorkPerson;
    if (!selected || !order) return;
    if (workReportPerson.checked) {
      if (draft.activeRole === "放行") {
        selected.clear();
        order.clear();
      }
      selected.add(userId);
      if (!order.has(userId)) order.set(userId, draft.nextOrder++);
    } else {
      selected.delete(userId);
      order.delete(userId);
    }
    renderMaintenanceWorkReportDialog();
    return;
  }
  if (event.target.matches("[data-maint-review-team]")) {
    if (state.maintenanceReviewDraft) {
      state.maintenanceReviewDraft.team = event.target.value;
      renderMaintenanceReviewDialog();
    }
    return;
  }
  const reviewPerson = event.target.closest("[data-maint-review-person]");
  if (reviewPerson) {
    const draft = state.maintenanceReviewDraft;
    const task = [...(draft?.tasks || []), ...(draft?.newSubtasks || [])].find(item => maintenanceReviewTaskKey(item) === reviewPerson.dataset.maintReviewOwner);
    const selected = task?.selections.get(reviewPerson.dataset.maintReviewRole);
    if (!task || !selected) return;
    if (reviewPerson.checked) {
      if (reviewPerson.dataset.maintReviewRole === "放行") selected.clear();
      selected.add(reviewPerson.dataset.maintReviewPerson);
    } else selected.delete(reviewPerson.dataset.maintReviewPerson);
    task.changed = true;
    renderMaintenanceReviewDialog();
    return;
  }
  if (event.target.id === "maintDispatchTeam") {
    if (state.maintenanceDispatchDraft) {
      state.maintenanceDispatchDraft.team = event.target.value;
      renderMaintenanceDispatchPicker();
    }
    return;
  }
  const maintenancePerson = event.target.closest("[data-maint-person]");
  if (maintenancePerson) {
    const draft = state.maintenanceDispatchDraft;
    if (!draft) return;
    const userId = maintenancePerson.dataset.maintPerson;
    const role = maintenancePerson.dataset.maintRoleCategory || draft.activeRole;
    if (draft.lockedRoles?.has(role)) return;
    const selectedIds = draft.selections.get(role);
    const order = draft.selectionOrder.get(role);
    if (!selectedIds || !order) return;
    if (maintenancePerson.checked) {
      if (role === "放行") {
        selectedIds.clear();
        order.clear();
      }
      selectedIds.add(userId);
      if (!order.has(userId)) order.set(userId, draft.nextOrder++);
    } else {
      selectedIds.delete(userId);
      order.delete(userId);
    }
    renderMaintenanceDispatchPicker();
    return;
  }
  if (event.target.id === "maintenanceStartDateFilter") {
    state.maintenanceStartDate = event.target.value;
    if (state.maintenanceStartDate && state.maintenanceEndDate && state.maintenanceStartDate > state.maintenanceEndDate) {
      state.maintenanceEndDate = state.maintenanceStartDate;
    }
    await refreshMaintenance();
    return;
  }
  if (event.target.id === "maintenanceEndDateFilter") {
    state.maintenanceEndDate = event.target.value;
    if (state.maintenanceStartDate && state.maintenanceEndDate && state.maintenanceEndDate < state.maintenanceStartDate) {
      state.maintenanceStartDate = state.maintenanceEndDate;
    }
    await refreshMaintenance();
    return;
  }
  const maintenanceOpportunityOption = event.target.closest("[data-maint-opportunity-option]");
  if (maintenanceOpportunityOption) {
    const selected = state.maintenanceOpportunityFilters instanceof Set
      ? state.maintenanceOpportunityFilters
      : new Set(maintenanceOpportunityOptions);
    const opportunity = maintenanceOpportunityOption.value;
    if (maintenanceOpportunityOption.checked) selected.add(opportunity);
    else if (selected.size > 1) selected.delete(opportunity);
    else maintenanceOpportunityOption.checked = true;
    state.maintenanceOpportunityFilters = selected;
    await refreshMaintenance();
    requestAnimationFrame(() => {
      const menu = document.querySelector(".maintenance-opportunity-menu");
      if (menu) menu.open = true;
    });
    return;
  }
  const maintenanceStatusOption = event.target.closest("[data-maint-status-option]");
  if (maintenanceStatusOption) {
    const side = maintenanceStatusOption.dataset.maintStatusOption;
    const selectedStatuses = side === "left" ? state.maintenanceLeftStatuses : state.maintenanceRightStatuses;
    const status = maintenanceStatusOption.value;
    if (maintenanceStatusOption.checked) selectedStatuses.add(status);
    else if (selectedStatuses.size > 1) selectedStatuses.delete(status);
    else {
      maintenanceStatusOption.checked = true;
      return;
    }
    renderMaintenance();
    requestAnimationFrame(() => {
      const menu = document.querySelector(`[data-maint-status-menu="${CSS.escape(side)}"]`);
      if (menu) menu.open = true;
    });
    return;
  }
  const maintenanceSortFilter = event.target.closest("[data-maint-sort-filter]");
  if (maintenanceSortFilter) {
    if (maintenanceSortFilter.dataset.maintSortFilter === "left") state.maintenanceLeftSort = maintenanceSortFilter.value;
    else state.maintenanceRightSort = maintenanceSortFilter.value;
    renderMaintenance();
    return;
  }
  if (event.target.id === "maintenanceImportFile") {
    (async () => {
      const file = event.target.files?.[0];
      if (!file) return;
      const parsed = await maintenanceRowsFromFile(file);
      if (!parsed.rows.length) return alert("未识别到有效航班计划，请检查列名。");
      const result = await maintenanceService.importRows(parsed.rows);
      await refreshMaintenance();
      alert(`导入完成：新增维修机会 ${result.created} 条，非例行 ${result.subCreated || 0} 条，跳过 ${result.skipped + parsed.skipped} 行。`);
      event.target.value = "";
    })().catch(error => alert(error.message));
    return;
  }
  if (event.target.id === "maintenanceMonth" || event.target.id === "maintenanceDataMonth") {
    state.maintenanceMonth = event.target.value;
    refreshMaintenance();
    return;
  }
  if (event.target.id === "userRoleFilter") {
    state.userRoleFilter = event.target.value;
    renderSettings();
    return;
  }
  if (event.target.id === "userSelectAll") {
    $$("[data-user-select]").forEach(input => {
      input.checked = event.target.checked;
      if (input.checked) state.selectedUserIds.add(input.dataset.userSelect);
      else state.selectedUserIds.delete(input.dataset.userSelect);
    });
    syncUserSelectionUi();
    return;
  }
  const userSelect = event.target.closest("[data-user-select]");
  if (userSelect) {
    if (userSelect.checked) state.selectedUserIds.add(userSelect.dataset.userSelect);
    else state.selectedUserIds.delete(userSelect.dataset.userSelect);
    syncUserSelectionUi();
    return;
  }
  if (event.target.id === "batchRole") {
    applyBatchRoleDefaults();
    return;
  }
  const feedbackStatus = event.target.closest("select[data-feedback-status]");
  if (feedbackStatus) {
    (async () => {
      try {
        const recordId = $("#feedbackDialog")?.dataset.recordId;
        const record = recordId ? state.records.find(item => item.id === recordId) : null;
        if (!record) return;
        await receiptService.updateStatus(record.id, feedbackStatus.dataset.feedbackStatus, feedbackStatus.value);
        renderRecords();
        renderStats();
        openFeedback(record);
      } catch (error) {
        alert(`修改失败：${error.message}`);
      }
    })();
    return;
  }
  if (event.target.id === "userRole") {
    applyRoleDefaults();
  }
  if (event.target.id === "statsTeamSelect") {
    state.statsTeam = event.target.value;
    renderStats();
  }
  if (event.target.id === "statsStartDate") {
    state.statsStartDate = event.target.value;
    renderStats();
  }
  if (event.target.id === "statsEndDate") {
    state.statsEndDate = event.target.value;
    renderStats();
  }
});

$$(".editor-tools [data-cmd]").forEach(button => button.addEventListener("click", () => {
  $("#fixedContent").focus();
  document.execCommand(button.dataset.cmd, false, null);
}));
$("#fontColorSelect").addEventListener("change", event => {
  if (!event.target.value) return;
  $("#fixedContent").focus();
  document.execCommand("foreColor", false, event.target.value);
  event.target.value = "";
});
$("#highlightColorSelect").addEventListener("change", event => {
  if (!event.target.value) return;
  $("#fixedContent").focus();
  const command = document.queryCommandSupported?.("hiliteColor") ? "hiliteColor" : "backColor";
  document.execCommand(command, false, event.target.value);
  event.target.value = "";
});

setupDrop($("#recordDrop"), $("#recordFiles"), state.recordFiles, $("#recordPending"));
setupDrop($("#fixedDrop"), $("#fixedFiles"), state.fixedFiles, $("#fixedPending"));
renderFixedAtaOptions();
window.addEventListener("popstate", () => {
  guardRoute().catch(error => {
    document.body.innerHTML = `<main class="wrap" style="padding:24px"><div class="data-panel"><h1>页面切换失败</h1><p class="status-line">${escapeHtml(error.message)}</p></div></main>`;
  });
});

async function init() {
  setAppMode("booting");
  if (location.protocol === "file:") {
    try {
      const response = await fetch(`${LOCAL_APP_URL}api/health`, { cache: "no-store" });
      if (response.ok) {
        location.replace(LOCAL_APP_URL);
        return;
      }
    } catch {}
    document.body.innerHTML = `<main class="wrap" style="padding:24px"><div class="data-panel"><h1>请使用本地服务地址访问</h1><p>当前是通过文件方式打开，只适合查看源码页面；登录、收藏、发布、阅读回执和附件预览请使用 <a class="link-btn" href="${LOCAL_APP_URL}">${LOCAL_APP_URL}</a>。</p><p class="status-line">如果打不开，请先启动 MUC 本地服务。</p></div></main>`;
    return;
  }
  try {
    if (!Object.values(ROUTES).includes(location.pathname)) setRoute(ROUTES.login, true);
    try {
      state.user = await authService.current();
    } catch (error) {
      if (!isAuthExpired(error)) throw error;
      const saved = savedLogin();
      const skipAutoLogin = sessionStorage.getItem(AUTO_LOGIN_SKIP_KEY) === "1";
      if (saved.autoLogin && saved.rememberPassword && saved.username && saved.password && !skipAutoLogin) {
        try {
          state.user = await authService.login(saved.username, saved.password);
        } catch (loginError) {
          clearAutoLoginPreference();
          await navigate(ROUTES.login, { replace: true, message: `自动登录失败：${loginError.message}` });
          return;
        }
      } else {
        await navigate(ROUTES.login, { replace: true });
        return;
      }
    }
    if (isLoggedIn()) await navigate(ROUTES.dashboard, { replace: true });
    else await navigate(ROUTES.login, { replace: true });
  } catch (error) {
    document.body.innerHTML = `<main class="wrap" style="padding:24px"><div class="data-panel"><h1>无法连接后端服务</h1><p>正式版前端只调用后端 API。请先启动后端服务，或配置 <code>window.MUC_API_BASE_URL</code> 指向可用接口。</p><p class="status-line">${escapeHtml(error.message)}</p></div></main>`;
  }
}

init();
