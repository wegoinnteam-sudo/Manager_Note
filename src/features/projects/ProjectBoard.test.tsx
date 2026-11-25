import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Project, ProjectTask } from "@shared/projects";
import { api } from "@/lib/api";
import { ProjectBoard } from "./ProjectBoard";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

const listLinks = () => within(screen.getByRole("region", { name: /프로젝트$/ })).getAllByRole("link");

it("shows one card per active project and opens its details from a card", async () => {
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
  await screen.findByRole("heading", { name: "진행 중인 프로젝트" });
  expect(listLinks()).toHaveLength(3);
  expect(screen.queryByText("업무 체크리스트")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "전체 프로젝트 보기" }));
  expect(listLinks()).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "진행 중만 보기" }));
  fireEvent.click(listLinks()[0]);
  expect(await screen.findByRole("heading", { name: "업무 체크리스트" })).toBeInTheDocument();
  expect(getProject).toHaveBeenCalledWith(projects[0].id);
  expect(window.location.search).toBe(`?id=${projects[0].id}`);
  fireEvent.click(screen.getByRole("button", { name: /프로젝트 목록/ }));
  await screen.findByRole("heading", { name: "진행 중인 프로젝트" });
  expect(listLinks()).toHaveLength(3);
});

it("shows the owner the full schedule and an assignee only their own tasks in the 내 할 일 box", async () => {
  const project: Project = {
    id: "00000000-0000-4000-8000-000000000009", title: "717 도미토리", owner: "Daniel", dueDate: "2026-12-24",
    goal: "", expected: "", handover: "", verification: "", outcome: "", status: "active", version: 1,
  };
  const task = (title: string, assignee: string, dueDate: string) => ({
    id: crypto.randomUUID(), title, assignee, dueDate, priority: "normal" as const, status: "todo" as const,
    handover: "", verification: "", subtasks: [], version: 1, completedBy: null, completedAt: null,
  });
  const tasks = [task("침구 발주", "Jane", "2026-12-01"), task("사진 촬영", "Mike", "2026-12-10")];
  vi.spyOn(api, "listProjects").mockResolvedValue([project]);
  vi.spyOn(api, "listHandoverAckRoster").mockResolvedValue({ names: [] });
  vi.spyOn(api, "getProject").mockResolvedValue({ project, tasks, updates: [] });

  window.history.replaceState({}, "", `/project?id=${project.id}`);
  const owner = render(<ProjectBoard canEdit author="Daniel" members={[]} />);
  const ownerBox = await screen.findByRole("complementary");
  await waitFor(() => expect(ownerBox).toHaveTextContent("전체 일정"));
  expect(ownerBox).toHaveTextContent("침구 발주");
  expect(ownerBox).toHaveTextContent("사진 촬영");
  owner.unmount();

  render(<ProjectBoard canEdit author="Jane" members={[]} />);
  const janeBox = await screen.findByRole("complementary");
  await waitFor(() => expect(janeBox).toHaveTextContent("침구 발주"));
  expect(janeBox).not.toHaveTextContent("전체 일정");
  expect(janeBox).toHaveTextContent("침구 발주");
  expect(janeBox).not.toHaveTextContent("사진 촬영");
  expect(within(janeBox).getByRole("checkbox", { name: /침구 발주/ })).toBeInTheDocument();

  fireEvent.click(within(janeBox).getByRole("button", { name: "내 할 일 접기" }));
  expect(janeBox).not.toHaveTextContent("침구 발주");
  fireEvent.click(within(janeBox).getByRole("button", { name: "내 할 일 펼치기" }));
  expect(janeBox).toHaveTextContent("침구 발주");
});

it("lists my work across active projects on the project list page", async () => {
  window.history.replaceState({}, "", "/project");
  const make = (index: number, owner: string): Project => ({
    id: `00000000-0000-4000-8000-00000000001${index}`, title: `프로젝트 ${index}`, owner, dueDate: "",
    goal: "", expected: "", handover: "", verification: "", outcome: "", status: "active", version: 1,
  });
  const projects = [make(1, "Daniel"), make(2, "Mike"), make(3, "Mike")];
  vi.spyOn(api, "listProjects").mockResolvedValue(projects);
  vi.spyOn(api, "listHandoverAckRoster").mockResolvedValue({ names: [] });
  vi.spyOn(api, "getProject").mockImplementation(async (id) => {
    const project = projects.find((item) => item.id === id)!;
    const tasks = project.title === "프로젝트 2" ? [{
      id: crypto.randomUUID(), title: "현장 점검", assignee: "Daniel", dueDate: "", priority: "normal" as const,
      status: "todo" as const, handover: "", verification: "", subtasks: [], version: 1, completedBy: null, completedAt: null,
    }] : [];
    return { project, tasks, updates: [] };
  });

  render(<ProjectBoard canEdit author="Daniel" members={[]} />);
  const box = await screen.findByRole("complementary");
  await waitFor(() => expect(box).toHaveTextContent("현장 점검"));
  expect(within(box).getByRole("link", { name: "프로젝트 1" })).toBeInTheDocument();
  expect(within(box).getByRole("link", { name: "프로젝트 2" })).toBeInTheDocument();
  expect(within(box).queryByRole("link", { name: "프로젝트 3" })).toBeNull();
});

it("includes partial checklist completion in project progress and moves checked work down", async () => {
  const project: Project = {
    id: crypto.randomUUID(), title: "객실 준비", owner: "Daniel", dueDate: "",
    goal: "", expected: "", handover: "", verification: "", outcome: "", status: "active", version: 1,
  };
  const task: ProjectTask = {
    id: crypto.randomUUID(), title: "침구 준비", assignee: "Mike", dueDate: "", priority: "normal" as const,
    status: "doing", handover: "", verification: "", version: 1,
    completedBy: null, completedAt: null,
    subtasks: [
      { id: crypto.randomUUID(), title: "이불 확인", done: true },
      { id: crypto.randomUUID(), title: "베개 확인", done: false },
    ],
  };
  const other = { ...task, id: crypto.randomUUID(), title: "객실 청소", status: "todo" as const, subtasks: [] };
  const previous = { ...other, id: crypto.randomUUID(), title: "재고 확인", status: "done" as const };
  vi.spyOn(api, "listProjects").mockResolvedValue([project]);
  vi.spyOn(api, "listHandoverAckRoster").mockResolvedValue({ names: [] });
  vi.spyOn(api, "getProject").mockImplementation(async () => ({ project, tasks: [previous, task, other], updates: [] }));
  vi.spyOn(api, "updateProjectTask").mockImplementation(async (_projectId, _taskId, input) => {
    task.subtasks = input.subtasks;
    task.status = "done";
  });

  window.history.replaceState({}, "", `/project?id=${project.id}`);
  render(<ProjectBoard canEdit author="Daniel" members={[]} />);
  await screen.findByText("하위 업무 · 완료 50% · 남은 50%");
  const progress = screen.getByRole("progressbar", { name: "업무 진행률" });
  expect(progress).toHaveAttribute("value", "50");
  const card = screen.getByRole("heading", { name: task.title }).closest("article")!;
  expect(within(card).getAllByRole("checkbox").map((checkbox) => (checkbox as HTMLInputElement).checked))
    .toEqual([false, false, true]);
  const taskTitles = () => screen.getAllByRole("article").map((article) => within(article).getByRole("heading").textContent);
  expect(taskTitles()).toEqual([task.title, other.title, previous.title]);

  fireEvent.click(within(card).getByRole("checkbox", { name: "베개 확인" }));
  await screen.findByText("하위 업무 · 완료 100% · 남은 0%");
  expect(progress).toHaveAttribute("value", "67");
  expect(taskTitles()).toEqual([other.title, previous.title, task.title]);
});
