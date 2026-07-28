import type { PageBlock } from "@shared/types";

export type TemplateKey = "meeting_notes" | "handoff_note";

export const TEMPLATES: { key: TemplateKey; label: string; description: string }[] = [
  { key: "meeting_notes", label: "회의록", description: "날짜/참석자 표, 논의 내용, 결정 사항, 다음 액션" },
  { key: "handoff_note", label: "인수인계 노트", description: "현재 진행 상황, 주의사항, 미완료 작업 체크리스트" },
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
