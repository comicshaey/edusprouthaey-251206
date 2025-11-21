// 251121 유치원 시간제근무 기간제교원 인건비 계산기 스크립트

// ===== 공통 헬퍼 =====
function $(id) { return document.getElementById(id); }
function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 원단위 절삭 (ex: 11,111원 → 11,110원)
function floorTo10(v) {
  const n = Number(v) || 0;
  return Math.floor(n / 10) * 10;
}

// 날짜 파싱
function parseDate(str) {
  if (!str) return null;
  const d = new Date(str + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return d;
}

// 두 날짜 사이 일수(포함)
function diffDaysInclusive(s, e) {
  const ms = e - s;
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

// 금액 포맷
function formatWon(v) {
  return Number(v).toLocaleString("ko-KR") + "원";
}

// ===== 시간·비례 상수 =====
const WEEK_HOURS_SEM = 20;    // 학기중 주당 소정근로시간
const WEEK_HOURS_VAC = 40;    // 방학중 주당 소정근로시간
const WEEK_TO_MONTH = 4.345;  // 월 환산 주수

// 가족수당·식비·교직수당 상수
const FAMILY_SPOUSE = 40000;        // 배우자 가족수당(정상근무 기준)
const MEAL_8H = 140000, MEAL_4H = 70000;
const TEACH_ALLOW_8H = 250000, TEACH_ALLOW_4H = 125000;

// ===== 경력연수·수당 =====
function getCareerYearsFloat() {
  const y = toNumber($("careerYears")?.value);
  const m = toNumber($("careerMonths")?.value);
  const d = toNumber($("careerDays")?.value);
  return y + m / 12 + d / 365;
}

// 교원연구비 (정상근무 기준 월액) – 필요시 금액/구간 조정
function calcTeacherResearchFull(yrs) {
  if (!yrs || yrs < 0) return 0;
  // 예시: 5년 미만 75,000원 / 5년 이상 60,000원
  return yrs >= 5 ? 60000 : 75000;
}

// 정근수당 가산금 (정상근무 기준 월액) – 업무지침 보고 맞게 조정 가능
function calcLongevityAddonFullMonthly(yrs) {
  if (!yrs || yrs < 0) return 0;
  if (yrs >= 20) return 80000;
  if (yrs >= 15) return 60000;
  if (yrs >= 10) return 40000;
  if (yrs >= 5) return 20000;
  return 0;
}

// 가족수당 (정상근무 기준 월액)
// index.html 기준:
//  - 배우자: radio name="spouseFlag" (Y/N)
//  - 자녀:   childFirst, childSecond, childThirdPlus (각각 "부양 자녀 수")
function calcFamilyFullMonthly() {
  const spouseChecked = document.querySelector('input[name="spouseFlag"]:checked');
  const hasSpouse = spouseChecked ? spouseChecked.value === "Y" : false;

  const firstCnt  = Math.max(0, Math.floor(toNumber($("childFirst")?.value)));
  const secondCnt = Math.max(0, Math.floor(toNumber($("childSecond")?.value)));
  const thirdCnt  = Math.max(0, Math.floor(toNumber($("childThirdPlus")?.value)));

  const childCount = firstCnt + secondCnt + thirdCnt;

  let total = 0;

  // 배우자 수당
  if (hasSpouse) total += FAMILY_SPOUSE;

  // 자녀수당 총액 (정상근무 기준)
  if (childCount === 1) {
    total += 50000;
  } else if (childCount === 2) {
    total += 80000;
  } else if (childCount >= 3) {
    total += 120000;
  }

  return total;
}

// ===== 수당 자동 반영 =====
// → 1단계 버튼/입력 변경 시 호출해서 "기본값"을 채워주는 역할만 함.
// → 그 이후에는 사용자가 자유롭게 수동 수정 가능.
function applyAutoAllowances() {
  const rows = document.querySelectorAll(".allowance-row");
  const yrs = getCareerYearsFloat();

  const fullFamily    = calcFamilyFullMonthly();
  const fullResearch  = calcTeacherResearchFull(yrs);
  const fullLongevity = calcLongevityAddonFullMonthly(yrs);

  rows.forEach((row) => {
    const name = (row.querySelector(".allow-name")?.value || "").trim();
    const sem  = row.querySelector(".allow-semester");
    const vac  = row.querySelector(".allow-vacation");
    if (!sem || !vac) return;

    if (name === "정액급식비") {
      sem.value = MEAL_4H;
      vac.value = MEAL_8H;
    } else if (name === "교직수당") {
      sem.value = TEACH_ALLOW_4H;
      vac.value = TEACH_ALLOW_8H;
    } else if (name === "가족수당") {
      if (fullFamily > 0) {
        sem.value = floorTo10(fullFamily * 0.5); // 4시간 기준
        vac.value = floorTo10(fullFamily);       // 8시간 기준
      } else {
        sem.value = "";
        vac.value = "";
      }
    } else if (name === "교원연구비") {
      if (fullResearch > 0) {
        sem.value = floorTo10(fullResearch * 0.5);
        vac.value = floorTo10(fullResearch);
      } else {
        sem.value = "";
        vac.value = "";
      }
    } else if (name === "정근수당 가산금") {
      // 기본값은 자동 산정, 이후에는 사용자가 수동 수정 가능
      if (fullLongevity > 0) {
        sem.value = floorTo10(fullLongevity * 0.5);
        vac.value = floorTo10(fullLongevity);
      } else {
        sem.value = "";
        vac.value = "";
      }
    }
    // 기타 수당은 손대지 않음(완전 수동)
  });
}

// ===== 기본급 및 시간단가 계산 =====
// ※ 여기서는 더 이상 수당 자동 반영하지 않음.
//   → "지금 입력된 월별 수당 값"을 기준으로 시간당 단가 계산만 수행.
function buildBasePay() {
  const base8Input = $("basePay8");
  if (!base8Input) return null;

  const base8 = toNumber(base8Input.value);
  if (!base8) return null;

  const base4Sem = base8 / 2;
  const base8Vac = base8;

  let allowSem = 0;
  let allowVac = 0;

  document.querySelectorAll(".allowance-row").forEach((r) => {
    allowSem += toNumber(r.querySelector(".allow-semester")?.value);
    allowVac += toNumber(r.querySelector(".allow-vacation")?.value);
  });

  const semMonthHours = WEEK_HOURS_SEM * WEEK_TO_MONTH;
  const vacMonthHours = WEEK_HOURS_VAC * WEEK_TO_MONTH;

  const semHour = semMonthHours ? (base4Sem + allowSem) / semMonthHours : 0;
  const vacHour = vacMonthHours ? (base8Vac + allowVac) / vacMonthHours : 0;

  return {
    base8,
    base4Sem,
    base8Vac,
    semHour,
    vacHour,
    allowSem,
    allowVac,
  };
}

// ===== 날짜 구간 구분 =====
const DAY_SEM  = "SEM";
const DAY_VAC  = "VAC";
const DAY_NOAF = "NOAF";

function buildRanges(query, sClass, eClass) {
  const arr = [];
  document.querySelectorAll(query).forEach((r) => {
    const s = parseDate(r.querySelector("." + sClass)?.value);
    const e = parseDate(r.querySelector("." + eClass)?.value);
    if (s && e && e >= s) arr.push({ start: s, end: e });
  });
  return arr;
}

function inRange(date, ranges) {
  const t = date.getTime();
  return ranges.some((r) => t >= r.start && t <= r.end);
}

// ===== 2단계: 월별 일수 =====
function buildMonthTable() {
  const s = parseDate($("contractStart")?.value);
  const e = parseDate($("contractEnd")?.value);
  const msg  = $("monthError");
  const wrap = $("monthTableWrap");

  msg.textContent = "";
  wrap.innerHTML  = "";

  if (!s || !e || e < s) {
    msg.textContent = "근로계약 시작·종료일자를 정확히 입력하세요.";
    return;
  }

  const vac  = buildRanges("#vacationBody tr", "vac-start", "vac-end");
  const noAf = buildRanges("#noAfBody tr", "noaf-start", "noaf-end");

  const map = new Map();
  let cur = new Date(s.getTime());
  while (cur <= e) {
    const ym = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
    if (!map.has(ym)) map.set(ym, { sem: 0, vac: 0, noaf: 0 });

    if (inRange(cur, vac)) {
      map.get(ym).vac++;
    } else if (inRange(cur, noAf)) {
      map.get(ym).noaf++;
    } else {
      map.get(ym).sem++;
    }

    cur.setDate(cur.getDate() + 1);
  }

  let html = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>월</th>
            <th>학기중(4h)</th>
            <th>방학(8h)</th>
            <th>미운영(4h)</th>
          </tr>
        </thead>
        <tbody>
  `;

  [...map.keys()].sort().forEach((ym) => {
    const d = map.get(ym);
    html += `
      <tr class="month-row" data-month="${ym}">
        <td>${ym}</td>
        <td><input type="number" class="sem-days" value="${d.sem}" /></td>
        <td><input type="number" class="vac-days" value="${d.vac}" /></td>
        <td><input type="number" class="noaf-days" value="${d.noaf}" /></td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;
  wrap.innerHTML = html;
}

// ===== 정근수당(연단위) 일할계산 – 월별 학사일정 반영 =====
function autoFillAnnualLongevityBySchedule() {
  const base = toNumber($("longevityBaseAnnual")?.value);
  if (!base) return;

  const rows = document.querySelectorAll(".month-row");
  if (!rows.length) return;

  let totalDays = 0;
  rows.forEach((r) => {
    totalDays +=
      toNumber(r.querySelector(".sem-days")?.value) +
      toNumber(r.querySelector(".vac-days")?.value) +
      toNumber(r.querySelector(".noaf-days")?.value);
  });
  if (!totalDays) return;

  const prorated = floorTo10(base * (totalDays / 365)); // 1년 기준액 × 비율

  document.querySelectorAll(".annual-row").forEach((r) => {
    const name = (r.querySelector(".annual-name")?.value || "").trim();
    if (name === "정근수당") {
      const amtInput = r.querySelector(".annual-amount");
      if (amtInput) amtInput.value = prorated;
    }
  });
}

// ===== 3단계: 월별 인건비 + 4대+산재 + 퇴직금 =====
function calcMonthly() {
  const base = buildBasePay();
  const err  = $("calcError");
  const wrap = $("resultWrap");
  err.textContent = "";
  wrap.innerHTML  = "";

  if (!base) {
    err.textContent = "1단계에서 기본급과 월별 수당 금액을 먼저 설정하세요.";
    return;
  }

  const monthRows = document.querySelectorAll(".month-row");
  if (!monthRows.length) {
    err.textContent = "2단계에서 월별 학기·방학·미운영 일수를 먼저 계산하세요.";
    return;
  }

  // 정근수당 연간 기준액 입력 시 → 월별 학사일정 비율로 자동 일할계산
  autoFillAnnualLongevityBySchedule();

  // 기관부담 비율 (학교 적용값)
  const R_PEN  = 0.045;       // 국민연금
  const R_HEAL = 0.03545;     // 건강보험
  const R_LTC  = 0.1267 * R_HEAL; // 장기요양
  const R_EMP  = 0.0175;      // 고용보험(기관부담)
  const R_IND  = 0.00966;     // 산재보험(0.966%)

  // 연 단위 수당 총액
  let annualTotal = 0;
  document.querySelectorAll(".annual-row").forEach((r) => {
    annualTotal += toNumber(r.querySelector(".annual-amount")?.value);
  });

  const monthCount = monthRows.length;
  const annualPerMonth = monthCount ? floorTo10(annualTotal / monthCount) : 0;

  let totalWageAll    = 0;
  let totalAnnualAll  = 0;
  let totalOrgInsAll  = 0;
  let totalDays       = 0;

  let tbodyHtml = "";

  monthRows.forEach((r) => {
    const ym    = r.getAttribute("data-month") || "";
    const sem   = toNumber(r.querySelector(".sem-days")?.value);
    const vac   = toNumber(r.querySelector(".vac-days")?.value);
    const noaf  = toNumber(r.querySelector(".noaf-days")?.value);
    const days  = sem + vac + noaf;
    totalDays  += days;

    let wageMonth = 0;

    // 방학+미운영 0일 & 학기중만 있는 달 → 4시간 기준 전액 지급
    if (vac === 0 && noaf === 0 && sem > 0) {
      wageMonth = floorTo10(base.base4Sem + base.allowSem);
    } else {
      // 그 외는 시간당 단가 기반 일할계산
      const semHours = (sem + noaf) * 4;
      const vacHours = vac * 8;
      wageMonth = floorTo10(
        base.semHour * semHours +
        base.vacHour * vacHours
      );
    }

    const annualMonth = annualPerMonth;

    totalWageAll   += wageMonth;
    totalAnnualAll += annualMonth;

    const orgP = wageMonth * R_PEN;
    const orgH = wageMonth * R_HEAL;
    const orgL = wageMonth * R_LTC;
    const orgE = wageMonth * R_EMP;
    const orgI = wageMonth * R_IND;

    const orgSum = floorTo10(orgP + orgH + orgL + orgE + orgI);
    totalOrgInsAll += orgSum;

    tbodyHtml += `
      <tr>
        <td>${ym}</td>
        <td>${sem}</td>
        <td>${vac}</td>
        <td>${noaf}</td>
        <td>${formatWon(wageMonth)}</td>
        <td>${formatWon(annualMonth)}</td>
        <td>${formatWon(wageMonth + annualMonth)}</td>
        <td>${formatWon(orgSum)}</td>
      </tr>
    `;
  });

  const totalIncomeAll = totalWageAll + totalAnnualAll;

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>월</th>
            <th>학기중</th>
            <th>방학</th>
            <th>미운영</th>
            <th>월 임금</th>
            <th>연단위 분배</th>
            <th>총 지급</th>
            <th>기관부담(4대+산재)</th>
          </tr>
        </thead>
        <tbody>
          ${tbodyHtml}
        </tbody>
        <tfoot>
          <tr>
            <th colspan="4">합계</th>
            <th>${formatWon(totalWageAll)}</th>
            <th>${formatWon(totalAnnualAll)}</th>
            <th>${formatWon(totalIncomeAll)}</th>
            <th>${formatWon(totalOrgInsAll)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  // 퇴직금 (계약기간 1년 이상)
  const s = parseDate($("contractStart")?.value);
  const e = parseDate($("contractEnd")?.value);
  if (s && e && e >= s) {
    const diff = diffDaysInclusive(s, e);
    if (diff >= 365 && totalDays > 0) {
      const avgDaily = (totalIncomeAll) / totalDays;
      const retire   = floorTo10(avgDaily * 30);

      wrap.innerHTML += `
        <div class="card">
          <b>퇴직금(계속근로 1년 이상)</b>: ${formatWon(retire)}<br/>
          <span class="hint">계약기간 ${diff}일, 인건비 달력일수 ${totalDays}일 기준 개략치입니다.</span>
        </div>
      `;
    } else {
      wrap.innerHTML += `
        <div class="card">
          퇴직금 대상 아님 (계약기간 ${diff}일, 1년 미만)
        </div>
      `;
    }
  }
}

// ===== 행 추가 =====
function addAllowanceRow() {
  $("allowanceBody").insertAdjacentHTML(
    "beforeend",
    `
    <tr class="allowance-row">
      <td><input type="text" class="allow-name" placeholder="수당명"></td>
      <td><input type="number" class="allow-semester" placeholder="0"></td>
      <td><input type="number" class="allow-vacation" placeholder="0"></td>
    </tr>
    `
  );
}

function addAnnualRow() {
  $("annualBody").insertAdjacentHTML(
    "beforeend",
    `
    <tr class="annual-row">
      <td><input type="text" class="annual-name" placeholder="수당명"></td>
      <td><input type="number" class="annual-amount" placeholder="0"></td>
    </tr>
    `
  );
}

function addVacRow() {
  $("vacationBody").insertAdjacentHTML(
    "beforeend",
    `
    <tr class="vac-row">
      <td><input type="date" class="vac-start"></td>
      <td><input type="date" class="vac-end"></td>
      <td><input type="text" class="vac-note" placeholder="예: 여름방학"></td>
    </tr>
    `
  );
}

function addNoAfRow() {
  $("noAfBody").insertAdjacentHTML(
    "beforeend",
    `
    <tr class="noaf-row">
      <td><input type="date" class="noaf-start"></td>
      <td><input type="date" class="noaf-end"></td>
      <td><input type="text" class="noaf-note" placeholder="예: 여름방학 중 방과후 미운영기간"></td>
    </tr>
    `
  );
}

// ===== 구비서류 안내 =====
const DOC_GUIDES = {
  "time-part": [
    "교원자격증 사본",
    "행정정보공동이용 동의서",
    "가족 채용 제한 확인서",
    "성범죄·아동학대 관련 범죄경력 조회 동의서",
    "건강검진서",
    "경력증명서(해당자)"
  ],
  "retired": [
    "건강검진서",
    "경력증명서(과목 필수)",
    "성범죄·아동학대 관련 범죄경력 조회 동의서",
    "마약류 중독 여부 검사 결과",
    "가족 채용 제한 확인서"
  ]
};

function renderDocGuide() {
  const select = $("docTypeSelect");
  const box    = $("docGuide");
  if (!select || !box) return;

  const key   = select.value || "time-part";
  const items = DOC_GUIDES[key] || [];

  if (!items.length) {
    box.innerHTML = `<p class="hint">구비서류 안내 데이터가 없습니다.</p>`;
    return;
  }

  box.innerHTML = `<ul>${items.map((t) => `<li>${t}</li>`).join("")}</ul>`;
}

// ===== DOM 로딩 후 바인딩 =====
document.addEventListener("DOMContentLoaded", () => {
  const base8Input = $("basePay8");
  const stepSelect = $("stepSelect");

  // 호봉 선택 → TeacherStepCore 기준 기본급(8h) 세팅
  if (stepSelect) {
    stepSelect.addEventListener("change", () => {
      const step = stepSelect.value;
      if (step && typeof TeacherStepCore !== "undefined") {
        const pay = TeacherStepCore.getMonthlyBasePay8h(step);
        if (pay) base8Input.value = pay;
      }
      const b = buildBasePay();
      if (b) {
        $("basePay4Sem").value = Math.round(b.base4Sem);
        $("basePay8Vac").value = Math.round(b.base8Vac);
      } else {
        $("basePay4Sem").value = "";
        $("basePay8Vac").value = "";
      }
    });
  }

  // 기본급 직접 수정 시에도 시간단가 재계산
  if (base8Input) {
    base8Input.addEventListener("input", () => {
      const b = buildBasePay();
      if (b) {
        $("basePay4Sem").value = Math.round(b.base4Sem);
        $("basePay8Vac").value = Math.round(b.base8Vac);
      } else {
        $("basePay4Sem").value = "";
        $("basePay8Vac").value = "";
      }
    });
  }

  // 1단계: 호봉·경력·가족수당·연구비·정근수당 가산금 자동 반영
  const stepBaseBtn = $("stepBaseBtn");
  if (stepBaseBtn) {
    stepBaseBtn.addEventListener("click", () => {
      // 호봉 선택되어 있으면 TeacherStepCore로 8시간 기준 봉급 자동 반영
      if (stepSelect && typeof TeacherStepCore !== "undefined") {
        const step = stepSelect.value;
        if (step) {
          const pay = TeacherStepCore.getMonthlyBasePay8h(step);
          if (pay) base8Input.value = pay;
        }
      }

      // 배우자·자녀·경력 정보를 이용해 월별 수당 기본값 자동 계산
      applyAutoAllowances();

      // 현재 금액 기준으로 시간단가/4h·8h 기본급 필드 업데이트
      const b = buildBasePay();
      if (b) {
        $("basePay4Sem").value = Math.round(b.base4Sem);
        $("basePay8Vac").value = Math.round(b.base8Vac);
      } else {
        $("basePay4Sem").value = "";
        $("basePay8Vac").value = "";
      }
    });
  }

  // 월별 수당 행/연 단위 수당 행/방학·미운영 행 추가
  $("addAllowBtn")?.addEventListener("click", addAllowanceRow);
  $("addAnnualBtn")?.addEventListener("click", addAnnualRow);
  $("addVacBtn")?.addEventListener("click", addVacRow);
  $("addNoAfBtn")?.addEventListener("click", addNoAfRow);

  // 2단계 / 3단계
  $("buildMonthBtn")?.addEventListener("click", buildMonthTable);
  $("calcBtn")?.addEventListener("click", calcMonthly);

  // 배우자·자녀·경력 입력 바뀔 때마다 "기본값"은 자동 갱신되게 하고 싶으면 이 부분 유지
  // (수동으로 월별 수당 금액을 바꾼 뒤에는 1단계를 다시 누르지 않으면 그대로 유지됨)
  const autoTriggerIds = [
    "careerYears",
    "careerMonths",
    "careerDays",
    "childFirst",
    "childSecond",
    "childThirdPlus"
  ];
  autoTriggerIds.forEach((id) => {
    const el = $(id);
    if (el) {
      el.addEventListener("input", () => {
        applyAutoAllowances();
        const b = buildBasePay();
        if (b) {
          $("basePay4Sem").value = Math.round(b.base4Sem);
          $("basePay8Vac").value = Math.round(b.base8Vac);
        }
      });
    }
  });

  document.querySelectorAll('input[name="spouseFlag"]').forEach((el) => {
    el.addEventListener("change", () => {
      applyAutoAllowances();
      const b = buildBasePay();
      if (b) {
        $("basePay4Sem").value = Math.round(b.base4Sem);
        $("basePay8Vac").value = Math.round(b.base8Vac);
      }
    });
  });

  // 구비서류 안내
  $("docTypeSelect")?.addEventListener("change", renderDocGuide);
  renderDocGuide();
});
