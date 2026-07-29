import type { PageBlock } from "../../shared/types";

// Stage 2 of the "Wegoinn DB" rebuild: real page-tree structure and body
// content, ported from the team's actual Notion database. Any value that
// would be personal/contact/account/contract data (phone numbers, vehicle
// plates, external-site logins, customer names, reservation numbers) is
// intentionally NOT filled in here — it's replaced with SECURE_PLACEHOLDER
// so nothing sensitive ever lands in source control or seed data. Those
// fields only get real values through an actual Notion export import
// (a later stage), stored in a permission-gated place, never here.
export const SECURE_PLACEHOLDER = "[보안 데이터: Notion 가져오기 필요]";

function fileNeeded(name: string): string {
  return `📎 ${name} — 파일 가져오기 필요`;
}

let counter = 0;
function id(): string {
  counter += 1;
  return `seed-${counter}-${Date.now().toString(36)}`;
}

function p(text: string): PageBlock {
  return { id: id(), type: "paragraph", text };
}
function h2(text: string): PageBlock {
  return { id: id(), type: "heading2", text };
}
function h3(text: string): PageBlock {
  return { id: id(), type: "heading3", text };
}
function li(text: string): PageBlock {
  return { id: id(), type: "bulleted_list_item", text };
}
function num(text: string): PageBlock {
  return { id: id(), type: "numbered_list_item", text };
}
function toggle(text: string, body: string, expanded = false): PageBlock {
  return { id: id(), type: "toggle", text, body, expanded };
}
function table(rows: string[][]): PageBlock {
  return { id: id(), type: "table", rows };
}
function callout(text: string): PageBlock {
  return { id: id(), type: "callout", text };
}
function quote(text: string): PageBlock {
  return { id: id(), type: "quote", text };
}
function file(name: string): PageBlock {
  return { id: id(), type: "paragraph", text: fileNeeded(name) };
}
function secure(label: string): PageBlock {
  return { id: id(), type: "secret", label };
}

export interface ContentSeedNode {
  /** Must exactly match an existing page title (top-level title from Stage 1, or a sibling in `children`). */
  title: string;
  blocks?: PageBlock[];
  children?: ContentSeedNode[];
}

export const WEGOINN_DB_CONTENT: ContentSeedNode[] = [
  // ---------------------------------------------------------------- Cleaning
  {
    title: "더티스컹크 단가표",
    blocks: [p("더티스컹크 세탁 서비스 단가표입니다. 최신 Excel 원본은 하위 페이지를 확인해주세요.")],
    children: [
      {
        title: "더티스컹크 단가표 파일",
        blocks: [file("더티스컹크 단가표.xlsx"), p("단가표 이미지 미리보기는 원본 파일을 가져온 뒤 추가됩니다.")],
      },
    ],
  },
  {
    title: "린넨 견적서",
    blocks: [file("린넨 견적서.xlsx")],
  },
  {
    title: "건조기 청소",
    blocks: [
      h2("필터청소"),
      p("필터 2개를 번갈아 가면서 청소한다."),
      file("필터 청소 안내 이미지 1"),
      p("하부 필터 먼지를 주기적으로 확인한다."),
      file("하부 필터 안내 이미지"),
      p("작업 단계별 이미지는 원본을 가져온 뒤 순서대로 추가됩니다."),
    ],
  },
  {
    title: "린넨스토리",
    blocks: [
      h3("업체 연락처"),
      table([
        ["구분", "담당자", "연락처"],
        ["CS 대표전화", SECURE_PLACEHOLDER, SECURE_PLACEHOLDER],
        ["세탁품질 문의", SECURE_PLACEHOLDER, SECURE_PLACEHOLDER],
        ["입출고·재고 문의", SECURE_PLACEHOLDER, SECURE_PLACEHOLDER],
        ["배송 문의", SECURE_PLACEHOLDER, SECURE_PLACEHOLDER],
      ]),
      h3("관리 사이트"),
      p("린넨스토리 관리 사이트 링크와 계정 정보는 Notion 가져오기 이후 권한이 있는 사용자만 확인할 수 있습니다."),
      secure("계정 ID / 비밀번호"),
      h3("첨부파일"),
      file("린넨 구독 서비스 시작 및 전환 안내.pdf"),
      file("린넨 구독 서비스 이용 안내.pdf"),
      file("프로모션 안내.pdf"),
      toggle(
        "이용 주의점",
        [
          "수거·배송 시간: 22:00~05:00, 수요일 휴무",
          "포대 색상별 품목 구분 — 회색: 이불커버·베개커버 / 청록색: 발매트 / 갈색: 위고인 라벨 린넨",
          "배송 즉시 수량 검수, 문제 발생 시 2일 이내 문의게시판 접수",
          "오염·훼손 발견 시 품목·수량·사진과 함께 접수",
          "호텔 자체 비닐 사용 시 정산 차감",
          "시트와 커버를 뒤집어서 수거하지 않음",
          "14일 경과 시 미회수 목록 공개, 30일 경과 시 분실 확정",
          "분실 시 구독료 기준으로 배상",
        ].join("\n"),
      ),
      toggle("초도물량", "", false),
    ],
  },
  { title: "서울구수", blocks: [] },

  // --------------------------------------------------------------- Reception
  {
    title: "인보이스(고객용)",
    blocks: [
      p("고객용 Invoice Excel 템플릿입니다. 아래 항목을 수정해서 사용하세요:"),
      li("Billed To"),
      li("Issue Date"),
      li("Room Type"),
      li("Number of Rooms"),
      li("Rates"),
      li("Nights"),
      file("인보이스 템플릿.xlsx"),
      callout("⚠️ 원본 템플릿은 직접 수정하지 말고 복사본을 만들어 사용해주세요."),
    ],
  },
  { title: "구수 서울 조식", blocks: [callout("⚠️ 첨부파일을 찾을 수 없습니다. 관리자에게 재업로드를 요청해주세요.")] },
  {
    title: "출력물",
    blocks: [
      file("Luggage Storage Notice.docx"),
      file("스토리지 관리.xlsx"),
      file("셀프체크인 네임택.pdf"),
      file("Taxi Service Form.docx"),
    ],
  },
  {
    title: "리셉션 메뉴얼",
    blocks: [
      h3("미성년자 숙박 동의서"),
      file("미성년자 숙박 동의서(국문).docx"),
      file("미성년자 숙박 동의서(국문).pdf"),
      file("미성년자 숙박 동의서(영문).docx"),
      file("미성년자 숙박 동의서(영문).pdf"),
      h3("Reception 메뉴얼"),
      file("리셉션 OMC 매뉴얼"),
      file("리셉션 전체 매뉴얼"),
      file("단체예약 체크인 요령"),
      file("Room Cleaning Service"),
      file("카카오택시 호출 방법"),
    ],
  },
  {
    title: "단체예약 명단",
    blocks: [
      callout("⚠️ 고객 이름이 포함된 자료입니다 — Reception·Admin만 접근 가능, 다운로드 시 감사 로그에 기록됩니다."),
      file("에잇버즈 금액표 이미지"),
      file("월별 단체예약 명단.xlsx"),
      file("주차별 단체예약 안내.docx"),
      file("6월 자료"),
      file("7월 자료"),
    ],
  },
  {
    title: "리셉션 연락망",
    blocks: [
      toggle(
        "Reception Staff 연락망",
        "실제 연락처는 Notion 가져오기 이후 권한이 있는 사용자만 확인할 수 있습니다.",
        false,
      ),
      table([
        ["이름", "연락처"],
        [SECURE_PLACEHOLDER, SECURE_PLACEHOLDER],
      ]),
    ],
  },

  // ------------------------------------------------------------ 운영(기타)
  {
    title: "사업자등록증",
    blocks: [
      callout("⚠️ Admin 또는 별도 허용된 사용자만 접근할 수 있습니다."),
      file("종된사업장 관련.pdf"),
      file("관광사업등록증.pdf"),
      file("사업자등록증.pdf"),
    ],
  },
  {
    title: "보고서",
    children: [
      {
        title: "아고다 성과보고서",
        blocks: [p("숙박일 기준과 예약일 기준 성과보고서를 날짜별로 묶어서 관리합니다."), file("숙박일 기준 성과보고서.pdf"), file("예약일 기준 성과보고서.pdf")],
      },
      { title: "서울 마켓 보고서", blocks: [file("서울 마켓 업데이트.pdf")] },
      {
        title: "객실 OCC / ADR",
        blocks: [p("월별로 구분해서 관리합니다."), h3("3월"), file("3월 OCC·ADR 이미지"), p("추후 월별 자료가 추가됩니다.")],
      },
    ],
  },
  {
    title: "단체 계약 내용",
    blocks: [file("객실 수량 파악.xlsx")],
    children: [
      { title: "Georgia Tech", blocks: [p("연도별 Invoice, 견적서, Wire Transfer Form을 연도별로 묶어서 관리합니다."), file("견적서.xlsx"), file("Wire Transfer Form"), file("Invoice")] },
      {
        title: "에잇버즈 계약",
        blocks: [
          file("단체예약 계약서.pdf"),
          file("견적서.pdf"),
          file("계약 관련.xlsx"),
          p("연도·상반기·하반기별로 자료를 구분합니다."),
          callout("💳 카드키 분실 비용 관련 메모: 세부 금액은 계약서 원본 확인 필요"),
          callout("📝 차기 계약서 수정 예정 항목 있음 — 계약 갱신 전 확인 필요"),
        ],
      },
      {
        title: "O School Singapore",
        blocks: [
          h3("일정"),
          p("2026년 10월 17일 ~ 10월 25일 (8박)"),
          h3("요청 내용"),
          li("총 19개 침대 요청"),
          li("객실 공유 여부보다 1인당 침대 1개가 중요"),
          li("최대한 가까운 객실로 배치 요청"),
          li("공용주방·공용시설 요청이 있었으나 제공되지 않는다고 안내함"),
          h3("첨부"),
          file("영문 객실 가격표.xlsx"),
          file("영문 단체계약서.docx"),
        ],
      },
      {
        title: "이화여대 리더십개발원",
        blocks: [file("관련 캡처 이미지"), file("객실 계약 내역.xlsx"), file("계약서.pdf")],
      },
    ],
  },
  {
    title: "위고인 규정",
    children: [
      {
        title: "위고인호스텔 규정",
        blocks: [
          h3("객실 변경 비용"),
          p("고객이 객실을 사용한 후 방을 변경하면 청소·시트 교체 비용 20,000원을 받는다."),
          h3("환불 규정"),
          table([
            ["구분", "환불"],
            ["입실 당일 취소", "환불 없음"],
            ["입실 1일 전 취소", "환불 없음"],
            ["입실 2일 전 취소", "50% 환불"],
            ["입실 3일 전 취소", "100% 환불"],
          ]),
          p("현장예약과 전화예약은 환불이 어렵다는 점을 안내한다."),
          h3("당일 예약 취소 예외"),
          li("다른 객실을 잘못 예약한 경우, 정확한 객실을 다시 예약한 사실을 확인한 후 잘못된 예약 취소를 검토한다."),
          li("예약 직후 짧은 시간 안에 실수를 신고한 경우만 제한적으로 검토한다."),
          li("일반적인 당일 취소는 천재지변 등을 포함하여 원칙적으로 불가하다."),
          li("예외 처리 시 관리자 승인과 기록이 필요하다."),
          h3("객실 추가 침구"),
          p("기본 제공량 외 베개·이불 추가 제공은 제한된다. 제공 가능 여부와 비용은 관리자가 수정할 수 있는 정책 데이터로 관리한다."),
          h3("미성년자 숙박 및 혼숙"),
          li("미성년자는 동반 성인 보호자가 가족인 경우에만 같은 객실에서 숙박할 수 있다."),
          li("가족이 아닌 성인과 미성년자의 혼숙은 불가하다."),
          li("부모 동의서와 가족관계 확인 서류가 필요하며, 외국인에게도 동일하게 적용한다."),
          li("서류가 없으면 가족과 통화로 확인한 뒤, 이메일로 동의서와 가족관계 서류를 받아 출력·제출한다."),
          h3("단체 미성년자"),
          p("학교 명의 공문 또는 확인서를 권장한다: 학생 명단, 인솔교사 이름, 숙박 일정, 학교 직인."),
          h3("유아 인원 계산"),
          li("36개월 이하 유아는 추가 인원으로 계산하지 않는다. (성인 2명 + 36개월 이하 유아 1명 = 기준 인원 2명)"),
          li("37개월 이상 아동은 인원에 포함한다."),
          h3("짐 보관 규정"),
          li("체크아웃 이후 일정 기간 보관 가능하며, 다음 예약 일정이 있는 경우 최대 3일까지 보관 가능하다."),
          li("장시간 또는 리셉션 운영시간 이후 수령은 사전 문의가 필요하다."),
          li("별도 보관 동의와 서명이 필요할 수 있다."),
          li("기간 경과 후 분실·폐기·파손에 대한 책임은 제한된다."),
          p("시간 관련 문구는 관리자가 쉽게 수정할 수 있게 정책 데이터로 분리한다."),
          h3("아고다 인보이스·숙박확인서"),
          p("아고다 예약 고객이 체크인 전 숙박확인서 또는 인보이스를 요청하는 경우 호스텔에서 사전 발급할 수 없으며, 아고다 고객센터로 요청하도록 안내한다."),
          quote("아고다를 통해 예약하신 건은 체크인 전 위고인호스텔에서 숙박확인서 및 인보이스를 발급해드릴 수 없습니다. 필요한 경우 아고다 고객센터로 요청해주시기 바랍니다."),
        ],
      },
    ],
  },
  {
    title: "Application/app",
    blocks: [
      p("외부 업무 앱 링크 모음입니다. 실제 URL은 Notion 가져오기 이후 채워집니다."),
      table([
        ["앱 이름", "설명", "사용 대상"],
        ["Self Check-in", "셀프 체크인 시스템", "Reception"],
        ["Vacation Schedule", "휴가 일정 관리", "전체 직원"],
        ["Cleaning Staff Login", "청소 직원 로그인", "Cleaning"],
        ["Check-out List", "체크아웃 목록 확인", "Reception"],
        ["Staff Salary Check", "급여 확인", "전체 직원"],
      ]),
    ],
  },
  {
    title: "주차 등록차량",
    blocks: [
      callout("⚠️ 실제 차량번호는 기본적으로 마스킹되며, 권한 있는 사용자만 전체 번호를 확인할 수 있습니다."),
      table([
        ["차량번호", "소유자/담당자", "설명"],
        [SECURE_PLACEHOLDER, SECURE_PLACEHOLDER, ""],
      ]),
    ],
  },
  {
    title: "객실 수리",
    blocks: [
      file("객실 수리 목록.xlsx"),
      p("추후 구조화된 수리 관리 기능(객실번호/수리내용/사진/우선순위/상태/담당자/요청일/완료일/메모)으로 확장 예정입니다."),
      table([
        ["객실번호", "수리 내용", "우선순위", "상태", "담당자", "요청일", "완료일"],
      ]),
    ],
  },
  {
    title: "Wegoinn Issue",
    children: [
      {
        title: "오버부킹 사례",
        blocks: [
          p("OTA 예약 기간과 PMS 예약 기간이 달랐던 사례로 오버부킹이 발생했습니다. 고객에게 취소를 요청했고, 패널티 발생 여부를 확인했습니다."),
          h3("발생일"),
          p(""),
          h3("채널"),
          p(""),
          h3("PMS 정보"),
          p(""),
          h3("문제 요약"),
          p(""),
          h3("처리 과정"),
          p(""),
          h3("결과"),
          p(""),
          h3("비용·패널티"),
          p(""),
          h3("첨부 이미지"),
          file("관련 캡처 이미지"),
          h3("재발 방지 방안"),
          p(""),
          secure("고객 예약번호"),
        ],
      },
    ],
  },
  {
    title: "비상시 매뉴얼",
    blocks: [callout("🔎 빠른 찾기 — 아래 하위 페이지에서 원하는 상황을 선택하세요.")],
    children: [
      {
        title: "비상연락처",
        blocks: [p("아래 하위 페이지에서 분야별 연락처를 확인하세요. 실제 연락처는 Notion 가져오기 이후 채워집니다.")],
        children: [
          {
            title: "시설 관련 연락처",
            blocks: [
              table([
                ["문제", "업체·담당자", "연락처"],
                ["엘리베이터", SECURE_PLACEHOLDER, SECURE_PLACEHOLDER],
                ["전기", SECURE_PLACEHOLDER, SECURE_PLACEHOLDER],
                ["객실 설비 (카드키/컨트롤러 박스/카드 삽입 박스/도어락)", SECURE_PLACEHOLDER, SECURE_PLACEHOLDER],
                ["CCTV", SECURE_PLACEHOLDER, SECURE_PLACEHOLDER],
                ["리모컨 통합제어", SECURE_PLACEHOLDER, SECURE_PLACEHOLDER],
              ]),
            ],
          },
          {
            title: "운영 관련 연락처",
            blocks: [
              table([
                ["구분", "연락처"],
                ["주차 시스템", SECURE_PLACEHOLDER],
                ["에잇버즈", SECURE_PLACEHOLDER],
                ["린넨스토리", SECURE_PLACEHOLDER],
                ["린넨스토리 중요 문제", SECURE_PLACEHOLDER],
              ]),
            ],
          },
          {
            title: "층별 세입자 연락처",
            blocks: [
              table([
                ["층", "업체", "담당자", "연락처"],
                [SECURE_PLACEHOLDER, SECURE_PLACEHOLDER, SECURE_PLACEHOLDER, SECURE_PLACEHOLDER],
              ]),
            ],
          },
        ],
      },
      {
        title: "주차 운영 방법",
        blocks: [
          h3("주차 가능 시간·관리 사이트"),
          li("체크인 차량 등록 시간 안내"),
          li("체크아웃 차량 출차 시간 안내"),
          secure("주차 관리 사이트 계정"),
          h3("주차 문제 발생 시 처리 순서"),
          num("주차현황에서 입출차현황으로 이동"),
          num("차량 날짜와 번호로 검색"),
          num("동일 차량이 여러 건이면 입·출차 시간 비교"),
          num("차량 상세 화면의 정산내역 수정"),
          num("취소금액과 결제취소 사유 작성"),
          num("결제취소 실행"),
          num("결제금액·미수금액·결제상태 확인"),
          p("사유 예시: 고객 차량 등록 오류 / 무료 주차 대상 차량 / 차량번호 오등록"),
          h3("직접 처리 불가 또는 시스템 오류"),
          li("고객센터에 연락한다."),
          li("차량번호·처리 일시·취소금액·사유를 인수인계에 기록한다."),
          li("처리 담당자와 결과를 기록한다."),
          h3("세입자 주차 할인권 판매"),
          li("건물 세입자에게 정상가의 50%로 판매한다."),
          li("요청자가 세입자인지 확인한다."),
          li("포스기 결제는 부가세 포함, 현금 결제는 부가세 제외."),
          p("정상가 1시간 4,000원 예시 — 포스기 2,200원 / 현금 2,000원"),
          li("결제 후 주차권을 전달한다."),
          li("전달 전 또는 즉시 팀장에게 보고한다."),
          secure("주차권 보관 위치"),
        ],
      },
      {
        title: "예약·OTA",
        blocks: [
          h3("당일 오버부킹 처리"),
          num("상위 객실 또는 다른 객실 타입 수용 가능 여부를 확인한다."),
          num("Extra Room 811호 Family Room을 확인한다."),
          num("모든 객실이 불가능하면 고객에게 상황을 설명하고 취소를 요청한다."),
          num("해결되지 않으면 OTA에 수용 불가를 통보한다."),
          num("Relocation Fee 발생 가능성을 확인한다."),
          num("OTA 연락 전 가급적 팀장급 승인을 받는다."),
          num("긴급 처리한 경우 즉시 사후보고한다."),
          h3("미래 예약 오버부킹"),
          li("예약 숙박기간과 객실 타입을 비교해 객실 테트리스를 진행한다."),
          li("숙박일수가 짧은 예약부터 상위 객실로 업그레이드한다 (Extra Room 811호 포함)."),
          li("최대한 예약 취소 없이 수용하고, PMS와 예약 명단에 변경사항을 반영한다."),
          li("고객에게 체크인 시 업그레이드를 안내한다."),
          quote("예시: 장기 예약과 1박 예약이 겹치면 1박 예약을 상위 객실로 이동하고, 남은 객실에 장기 예약을 배치한다."),
        ],
      },
      { title: "고객 컴플레인", blocks: [callout("🚧 새로운 내용 추가 예정")] },
      { title: "시설·고장", blocks: [callout("🚧 새로운 내용 추가 예정")] },
      { title: "청소·린넨", blocks: [callout("🚧 새로운 내용 추가 예정")] },
      {
        title: "단체예약·거래처",
        blocks: [
          h3("단체예약 당일 변경 요청"),
          li("모든 단체예약은 당일 예약·객실 변경이 불가능하다."),
          li("고객 또는 담당자에게 정중하게 안내한다."),
          li("급한 경우 예약자 명단을 전달하고, 단체 담당자가 직접 명단과 객실 배정을 조정하게 한다."),
          li("호스텔 시스템에 등록된 기존 예약은 변경하지 않는다."),
          quote("죄송하지만 단체예약은 당일 객실 변경이 어렵습니다. 예약자 명단을 전달드릴 테니 담당자분께서 직접 배정을 조정해주시면 감사하겠습니다."),
        ],
      },
    ],
  },

  // -------------------------------------------------------------- Wegoinn 2.0
  {
    title: "Pinterest",
    blocks: [p("위고인 2.0 관련 이미지와 아이디어를 함께 저장하는 Pinterest 아이디어 보드입니다."), callout("🔗 Pinterest 보드 링크 필요 — Notion 가져오기 이후 추가됩니다.")],
  },
  {
    title: "창천동 도면",
    blocks: [file("건물 개요.pdf"), file("1층 도면.pdf"), file("2~6층 도면.pdf"), file("7층 도면.pdf")],
  },
  {
    title: "신규호스텔 사진",
    blocks: [p("신규 호스텔 관련 사진과 메모입니다."), file("신규 호스텔 사진"), callout("📝 싱글룸 크기 및 화장실 포함 여부 메모 — Notion 가져오기 이후 추가됩니다.")],
  },
  {
    title: "예상 공유 숫자놀이",
    blocks: [
      h2("2025.05.27 전체회의 주제 - 지하 1층의 매출과 비용은?"),
      toggle(
        "타깃층",
        [
          "자연 유동인구는 주요 타깃이 되기 어려움",
          "외국인 여행객",
          "20~30대 고객",
          "장시간 체류 고객",
          "SNS 감성 소비층",
        ].join("\n"),
      ),
      toggle(
        "입지 분석",
        [
          "[단점] 골목 위치 / 메인 상권이 아님 / 유동인구가 적음 / 자연 유입이 약함 / 먹자·패션 중심 상권이 아님",
          "[장점] 조용함 / 숨겨진 공간 느낌 / 로컬 분위기 / 사진 촬영에 적합 / 체류형 공간 / 골목 상권의 특성",
          "[결론] 우연히 들어오는 고객보다 SNS 마케팅과 공간 자체의 재방문 유도가 필요. 회전형 저가 커피 매장과는 맞지 않음.",
        ].join("\n\n"),
      ),
      toggle(
        "지하·1층 구조",
        [
          "지하 1층: 316.08㎡ (약 95.61평) / 1층: 316.08㎡ (약 95.61평)",
          "전체 면적을 고객 좌석으로 사용할 수 없음 — 주방·창고·기계실·전기실·물탱크실·계단·엘리베이터홀·화장실·복도 등 제외 필요",
          "기존 구수 좌석 약 37석, 신규 공간 예상 좌석 약 70석",
        ].join("\n"),
      ),
      toggle(
        "객단가 및 매출",
        [
          "예상 객단가: 15,000~20,000원 (맥주 판매 포함 가정)",
          "70석, 테이블당 2명 기준 약 140명",
          "객단가 15,000원 기준 하루 약 2,100,000원",
          "1회전 월매출 약 60,000,000원 / 2회전 월매출 약 120,000,000원",
          "[결론] 카페 단독 순이익만 보는 것보다 호스텔 객실 가격, F&B 서비스, 리뷰, 브랜드 경험과의 시너지를 중요하게 평가해야 함",
        ].join("\n"),
      ),
      file("계산 이미지"),
      file("카페 창업 계산.xlsx"),
      callout("🧮 좌석 수 / 회전 수 / 평균 객단가 / 영업일수를 입력하면 예상 매출을 계산하는 계산기는 다음 단계에서 추가됩니다."),
    ],
  },

  // -------------------------------------------------------------- Marketing
  {
    title: "설렌타인 이벤트",
    blocks: [
      p("행사 기간: 2026년 2월 14일 ~ 2월 18일"),
      file("이벤트 제안서.pptx"),
      file("고객용 QR.pptx"),
      file("고객용.pdf"),
      toggle(
        "결과보고",
        ["인기 순서: 모나카 > 약과 > 유과", "포장과 실물 준비에 반나절 미만 소요"].join("\n"),
      ),
      file("정산 이미지"),
      file("결과 이미지"),
    ],
  },
];
