// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { defaultForm } from "@/lib/checkin/logic";
import { formToRow } from "@/lib/checkin/save";
import { CheckinScreen } from "./CheckinScreen";

const saveCheckin = vi.fn();
vi.mock("./actions", () => ({ saveCheckin: (...args: unknown[]) => saveCheckin(...args) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 29, 9, 0)); // 29 Sep 2026, local time
  window.scrollTo = vi.fn();
  saveCheckin.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const chip = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`, "i") });

describe("check-in screen", () => {
  test("starts on a green day with the profile's session length", () => {
    render(<CheckinScreen sessionMinutes={45} recent={[]} />);
    expect(screen.getByText("Green day")).toBeTruthy();
    expect(screen.getByText("Tue 29 Sep")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "45", checked: true })).toBeTruthy();
  });

  test("tapping a muscle cycles its soreness and the readiness card follows", () => {
    render(<CheckinScreen sessionMinutes={60} recent={[]} />);
    const quads = () => chip("Quads");

    fireEvent.click(quads());
    expect(quads().textContent).toContain("2");
    expect(screen.getByText("Green day")).toBeTruthy();

    fireEvent.click(quads());
    expect(quads().textContent).toContain("3");
    expect(screen.getByText("Yellow day")).toBeTruthy();
    expect(screen.getByText("sore quads")).toBeTruthy();

    fireEvent.click(quads()); // 4
    fireEvent.click(quads()); // 5
    expect(quads().textContent).toContain("5");

    fireEvent.click(quads()); // back to none
    expect(quads().textContent).not.toMatch(/\d/);
    expect(screen.getByText("Green day")).toBeTruthy();
  });

  test("less sleep turns the card yellow and lists the hours as a reason", () => {
    render(<CheckinScreen sessionMinutes={60} recent={[]} />);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Half an hour less" }));
    expect(screen.getByText("5.5")).toBeTruthy();
    expect(screen.getByText("Yellow day")).toBeTruthy();
    expect(screen.getByText("5.5h sleep")).toBeTruthy();
  });

  test("pain: Yes shows the areas and the doctor message; No hides them", () => {
    render(<CheckinScreen sessionMinutes={60} recent={[]} />);
    expect(screen.queryByText(/get it checked by a medic\/doctor/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(screen.getByRole("button", { name: "Lower back" })).toBeTruthy();
    expect(screen.getByText(/get it checked by a medic\/doctor/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    expect(screen.queryByRole("button", { name: "Lower back" })).toBeNull();
  });

  test("Build my session is visible but disabled", () => {
    render(<CheckinScreen sessionMinutes={60} recent={[]} />);
    const build = screen.getByRole("button", { name: /Build my session/ }) as HTMLButtonElement;
    expect(build.disabled).toBe(true);
    expect(build.textContent).toMatch(/coming soon/i);
  });

  test("saving sends today's local date and then shows the saved result", async () => {
    saveCheckin.mockImplementation(async ({ date, form }) => ({
      saved: { date, form, readiness: { level: "green", tags: [] } },
    }));
    render(<CheckinScreen sessionMinutes={60} recent={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Save check-in" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Edit check-in" })).toBeTruthy());
    expect(saveCheckin).toHaveBeenCalledWith({ date: "2026-09-29", form: defaultForm(60) });
  });

  test("shows an error if saving fails and stays on the form", async () => {
    saveCheckin.mockResolvedValue({ error: "boom" });
    render(<CheckinScreen sessionMinutes={60} recent={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Save check-in" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("boom"));
    // The error shows while the button still says "Saving…"; wait for it to settle.
    await waitFor(() => expect(screen.getByRole("button", { name: "Save check-in" })).toBeTruthy());
  });

  test("coming back the same day shows the saved check-in and its snapshot, with an edit option", () => {
    const row = { ...formToRow("2026-09-29", { ...defaultForm(60), sleepHours: 5.5, soreness: { quads: 3 } }), readiness_reasons: ["saved reason"] };
    render(<CheckinScreen sessionMinutes={60} recent={[row]} />);
    expect(screen.getByText("Yellow day")).toBeTruthy();
    expect(screen.getByText("saved reason")).toBeTruthy();
    expect(screen.getByText("Quads 3")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save check-in" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit check-in" }));
    expect(screen.getByRole("button", { name: "Update check-in" })).toBeTruthy();
    expect(chip("Quads").textContent).toContain("3");
  });

  test("a check-in from another day doesn't count as today's", () => {
    const row = formToRow("2026-09-28", defaultForm(60));
    render(<CheckinScreen sessionMinutes={60} recent={[row]} />);
    expect(screen.getByRole("button", { name: "Save check-in" })).toBeTruthy();
  });
});
