import { describe, expect, it } from "@jest/globals";
import { isCollaborative, nonAssigneeApprovedReviews } from "../../src/helpers/checkers";

// Minimal mock IssueActivity for testing isCollaborative
function createMockActivity(overrides: {
  closedById?: number;
  creatorId?: number;
  creatorType?: string;
  events?: unknown[];
  linkedMergedPullRequests?: unknown[];
  assigneeId?: number;
  assigneeType?: string;
}) {
  const creatorId = overrides.creatorId ?? 1;
  const closedById = overrides.closedById ?? creatorId;
  return {
    self: {
      closed_by: { id: closedById, type: "User" },
      user: { id: creatorId, type: overrides.creatorType ?? "User" },
      assignee: overrides.assigneeId ? { id: overrides.assigneeId, type: overrides.assigneeType ?? "User" } : null,
    },
    events: overrides.events ?? [],
    linkedMergedPullRequests: overrides.linkedMergedPullRequests ?? [],
  } as unknown as Parameters<typeof isCollaborative>[0];
}

describe("isCollaborative", () => {
  it("returns false when no closed_by", () => {
    const activity = { self: { user: { id: 1, type: "User" } } } as Parameters<typeof isCollaborative>[0];
    expect(isCollaborative(activity)).toBe(false);
  });

  it("returns false when no user", () => {
    const activity = { self: { closed_by: { id: 1, type: "User" } } } as Parameters<typeof isCollaborative>[0];
    expect(isCollaborative(activity)).toBe(false);
  });

  it("returns true when closed by different person", () => {
    const activity = createMockActivity({ closedById: 2, creatorId: 1 });
    expect(isCollaborative(activity)).toBe(true);
  });

  it("returns false when creator closes own issue with no other human activity", () => {
    const activity = createMockActivity({ closedById: 1, creatorId: 1, events: [] });
    expect(isCollaborative(activity)).toBe(false);
  });

  it("returns true when a human (non-creator) adds pricing label", () => {
    const activity = createMockActivity({
      closedById: 1,
      creatorId: 1,
      events: [
        {
          event: "labeled",
          actor: { id: 2, type: "User" },
          label: { name: "Time: 1h" },
        },
      ],
    });
    expect(isCollaborative(activity)).toBe(true);
  });

  it("returns false when a BOT adds pricing label (bot labeler should not count)", () => {
    const activity = createMockActivity({
      closedById: 1,
      creatorId: 1,
      events: [
        {
          event: "labeled",
          actor: { id: 999, type: "Bot" },
          label: { name: "Time: 1h" },
        },
      ],
    });
    expect(isCollaborative(activity)).toBe(false);
  });

  it("returns false when only bot approves PR (no human collaborator involved)", () => {
    // Simulates: coderabbitai Bot approves PR, issue creator closes their own issue
    const botReview = {
      user: { id: 999, type: "Bot", login: "coderabbitai" },
      state: "APPROVED" as const,
    };
    const activity = {
      self: {
        closed_by: { id: 1, type: "User" },
        user: { id: 1, type: "User" },
        assignee: { id: 1, type: "User" },
      },
      events: [],
      linkedMergedPullRequests: [
        {
          self: { requested_reviewers: [] },
          reviews: [botReview],
        },
      ],
    } as unknown as Parameters<typeof isCollaborative>[0];
    expect(isCollaborative(activity)).toBe(false);
  });

  it("returns true when a human (non-assignee) approves PR", () => {
    const humanReview = {
      user: { id: 2, type: "User" as const, login: "human-reviewer" },
      state: "APPROVED" as const,
    };
    const activity = createMockActivity({
      closedById: 1,
      creatorId: 1,
      assigneeId: 1,
      linkedMergedPullRequests: [
        {
          self: { requested_reviewers: [] },
          reviews: [humanReview],
        },
      ],
    });
    expect(isCollaborative(activity)).toBe(true);
  });
});

describe("nonAssigneeApprovedReviews", () => {
  it("returns empty array when no linked merged PRs", () => {
    const activity = createMockActivity({ closedById: 1, creatorId: 1, assigneeId: 1 });
    const result = nonAssigneeApprovedReviews(activity);
    expect(result.length).toBe(0);
  });

  it("filters out bot-approved reviews", () => {
    const botReview = {
      user: { id: 999, type: "Bot", login: "dependabot" },
      state: "APPROVED" as const,
    };
    const activity = createMockActivity({
      closedById: 1,
      creatorId: 1,
      assigneeId: 1,
      linkedMergedPullRequests: [
        {
          self: { requested_reviewers: [] },
          reviews: [botReview],
        },
      ],
    });
    const result = nonAssigneeApprovedReviews(activity);
    expect(result.length).toBe(0);
  });

  it("includes human-approved reviews from non-assignee", () => {
    const humanReview = {
      user: { id: 2, type: "User" as const, login: "reviewer" },
      state: "APPROVED" as const,
    };
    const activity = createMockActivity({
      closedById: 1,
      creatorId: 1,
      assigneeId: 1,
      linkedMergedPullRequests: [
        {
          self: { requested_reviewers: [] },
          reviews: [humanReview],
        },
      ],
    });
    const result = nonAssigneeApprovedReviews(activity);
    expect(result.length).toBe(1);
  });
});
