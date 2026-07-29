import type { PageBlock } from "@shared/types";

export type TemplateKey =
  | "meeting_notes"
  | "handoff_note"
  | "emergency_manual"
  | "group_contract"
  | "room_repair"
  | "event_report";

export const TEMPLATES: { key: TemplateKey; label: string; description: string }[] = [
  { key: "meeting_notes", label: "회의록", description: "날짜/참석자 표, 논의 내용, 결정 사항, 다음 액션" },
  { key: "handoff_note", label: "인수인계 노트", description: "현재 진행 상황, 주의사항, 미완료 작업 체크리스트" },
  { key: "emergency_manual", label: "비상 매뉴얼", description: "비상 연락망, 즉시 조치, 보고 및 후속 점검" },
  { key: "group_contract", label: "단체 계약", description: "단체 정보, 일정, 금액, 특약 및 확인 체크리스트" },
  { key: "room_repair", label: "객실 수리 요청", description: "객실번호, 고장 내용, 긴급도, 처리 상태" },
  { key: "event_report", label: "행사 결과보고", description: "행사 개요, 결과, 비용, 개선점과 후속 작업" },
];

function id() {
  return crypto.randomUUID();
}

export function buildTemplateBlocks(key: TemplateKey): PageBlock[] {
  if (key === "meeting_notes") {
    return [
      { id: id(), type: "heading2", text: "회의록" },
      { id: id(), type: "table", rows: [["날짜", "참석자"], ["", ""]] },
      { id: id(), type: "heading3", text: "논의 내용" },
      { id: id(), type: "paragraph", text: "" },
      { id: id(), type: "heading3", text: "결정 사항" },
      { id: id(), type: "checklist_item", text: "", checked: false },
      { id: id(), type: "heading3", text: "다음 액션" },
      { id: id(), type: "checklist_item", text: "", checked: false },
    ];
  }

  if (key === "handoff_note") {
    return [
      { id: id(), type: "heading2", text: "인수인계 노트" },
      { id: id(), type: "callout", text: "인수인계 시 반드시 확인해야 할 내용을 아래에 정리하세요." },
      { id: id(), type: "heading3", text: "현재 진행 상황" },
      { id: id(), type: "paragraph", text: "" },
      { id: id(), type: "heading3", text: "주의사항" },
      { id: id(), type: "callout", text: "" },
      { id: id(), type: "heading3", text: "미완료 작업" },
      { id: id(), type: "checklist_item", text: "", checked: false },
      { id: id(), type: "checklist_item", text: "", checked: false },
    ];
  }

  if (key === "emergency_manual") {
    return [
      { id: id(), type: "heading2", text: "비상 매뉴얼" },
      { id: id(), type: "callout", text: "위험이 있으면 직원과 고객의 안전 확보를 가장 먼저 진행합니다." },
      { id: id(), type: "heading3", text: "비상 연락망" },
      { id: id(), type: "table", rows: [["구분", "연락처"], ["경찰", "112"], ["소방·구급", "119"], ["책임자", ""]] },
      { id: id(), type: "heading3", text: "즉시 조치" },
      { id: id(), type: "numbered_list_item", text: "" },
      { id: id(), type: "heading3", text: "보고 및 후속 점검" },
      { id: id(), type: "checklist_item", text: "책임자에게 보고", checked: false },
      { id: id(), type: "checklist_item", text: "사고 기록 작성", checked: false },
    ];
  }

  if (key === "group_contract") {
    return [
      { id: id(), type: "heading2", text: "단체 계약" },
      { id: id(), type: "table", rows: [["단체명", ""], ["담당자·연락처", ""], ["숙박 기간", ""], ["인원", ""], ["계약 금액", ""]] },
      { id: id(), type: "heading3", text: "특약 및 요청사항" },
      { id: id(), type: "paragraph", text: "" },
      { id: id(), type: "heading3", text: "확인 사항" },
      { id: id(), type: "checklist_item", text: "계약금 확인", checked: false },
      { id: id(), type: "checklist_item", text: "객실 배정 확인", checked: false },
      { id: id(), type: "checklist_item", text: "최종 인원 확인", checked: false },
    ];
  }

  if (key === "room_repair") {
    return [
      { id: id(), type: "heading2", text: "객실 수리 요청" },
      { id: id(), type: "table", rows: [["객실번호", ""], ["요청일", ""], ["긴급도", "보통"], ["담당자", ""]] },
      { id: id(), type: "heading3", text: "고장 내용" },
      { id: id(), type: "paragraph", text: "" },
      { id: id(), type: "heading3", text: "처리 체크" },
      { id: id(), type: "checklist_item", text: "현장 확인", checked: false },
      { id: id(), type: "checklist_item", text: "수리 완료", checked: false },
      { id: id(), type: "checklist_item", text: "요청자에게 결과 공유", checked: false },
    ];
  }

  return [
    { id: id(), type: "heading2", text: "행사 결과보고" },
    { id: id(), type: "table", rows: [["행사명", ""], ["일시", ""], ["참여 인원", ""], ["총 비용", ""]] },
    { id: id(), type: "heading3", text: "주요 결과" },
    { id: id(), type: "paragraph", text: "" },
    { id: id(), type: "heading3", text: "잘된 점과 개선점" },
    { id: id(), type: "columns", columns: ["잘된 점", "개선점"] },
    { id: id(), type: "heading3", text: "후속 작업" },
    { id: id(), type: "checklist_item", text: "", checked: false },
  ];
}
