import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Project } from "@shared/projects";
import { api } from "@/lib/api";
import { ProjectBoard } from "./ProjectBoard";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

it("shows one card per active project and loads details only after opening a card", async () => {
  window.history.replaceState({}, "", "/project");
  const projects: Project[] = ["717호 객실 오픈", "로비 정비", "예약 안내 개편", "완료된 프로젝트"].map((title, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index}`,
    title, owner: "Jane", dueDate: "", goal: "준비 완료", expected: "", handover: "", verification: "", outcome: "",
    status: index === 3 ? "finished" : "active",
    version: 1,
  }));
  vi.spyOn(api, "listProjects").mockResolvedValue(projects);
  vi.spyOn(api, "listHandoverAckRoster").mockResolvedValue({ names: [] });
  const getProject = vi.spyOn(api, "getProject").mockResolvedValue({ project: projects[0], tasks: [], updates: [] });

  render(<ProjectBoard canEdit author="Jane" members={[]} />);
  expect(await screen.findAllByRole("link")).toHaveLength(3);
  expect(screen.queryByText("업무 체크리스트")).toBeNull();
  expect(getProject).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "전체 프로젝트 보기" }));
  expect(screen.getAllByRole("link")).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "진행 중만 보기" }));
  fireEvent.click(screen.getByRole("link", { name: /717호 객실 오픈/ }));
  expect(await screen.findByRole("heading", { name: "업무 체크리스트" })).toBeInTheDocument();
  expect(getProject).toHaveBeenCalledWith(projects[0].id);
  expect(window.location.search).toBe(`?id=${projects[0].id}`);
  fireEvent.click(screen.getByRole("button", { name: /프로젝트 목록/ }));
  expect(await screen.findAllByRole("link")).toHaveLength(3);
});
