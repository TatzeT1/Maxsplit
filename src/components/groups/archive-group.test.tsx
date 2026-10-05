import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

// The Server Actions pull in firebase-admin, and the settings tab's other
// panels are not what's under test here.
const actions = vi.hoisted(() => ({
  setGroupArchived: vi.fn(),
  deleteGroup: vi.fn(),
  leaveGroup: vi.fn(),
}));
vi.mock("@/lib/actions/groups", () => actions);
vi.mock("@/components/groups/members-panel", () => ({ MembersPanel: () => null }));
vi.mock("@/components/groups/recurring-panel", () => ({ RecurringPanel: () => null }));
vi.mock("@/components/groups/edit-group-dialog", () => ({ EditGroupDialog: () => null }));
vi.mock("@/components/groups/invite-share-button", () => ({ InviteShareButton: () => null }));

import { LocaleProvider } from "@/components/locale-provider";
import type { Group, GroupMember, GroupRole } from "@/lib/types";
import { ArchiveGroupRow, ArchivedBanner } from "./archive-group";
import { GroupSettingsTab } from "./group-settings-tab";

// Archiving is a manager's call that moves the group for everyone; the way back
// sits right in the banner of the archived group.

function member(displayName: string, role: GroupRole): GroupMember {
  return {
    displayName,
    photoURL: "",
    joinedAt: "2026-01-01T00:00:00.000Z",
    role,
    isPlaceholder: false,
  };
}

function groupOf(extra: Partial<Group> = {}): Group {
  return {
    id: "g1",
    name: "WG",
    currency: "EUR",
    createdBy: "max",
    createdAt: "2026-01-01T00:00:00.000Z",
    archived: false,
    memberUids: ["max", "ada", "lea"],
    members: {
      max: member("Max", "owner"),
      ada: member("Ada", "admin"),
      lea: member("Lea", "member"),
    },
    inviteCode: "CODE",
    ...extra,
  };
}

function inLocale(node: React.ReactNode) {
  return <LocaleProvider initialLocale="de">{node}</LocaleProvider>;
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: online });
}

beforeEach(() => {
  setOnline(true);
  for (const action of Object.values(actions)) action.mockReset();
  actions.setGroupArchived.mockResolvedValue({ ok: true, data: null });
});

/** Opens the confirmation and presses its "archive" button, as a thumb would. */
async function archiveThroughDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Gruppe archivieren" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Gruppe archivieren" }));
}

describe("ArchiveGroupRow", () => {
  it("asks first, spelling out that it reaches everyone — then archives", async () => {
    const user = userEvent.setup();
    render(inLocale(<ArchiveGroupRow group={groupOf()} />));

    await user.click(screen.getByRole("button", { name: "Gruppe archivieren" }));
    const dialog = await screen.findByRole("alertdialog");

    expect(within(dialog).getByText(/Für alle in der Gruppe/)).toBeInTheDocument();
    expect(actions.setGroupArchived).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Gruppe archivieren" }));

    await waitFor(() =>
      expect(actions.setGroupArchived).toHaveBeenCalledWith({ groupId: "g1", archived: true }),
    );
  });

  it("explains a refusal because of a running recurring rule", async () => {
    actions.setGroupArchived.mockResolvedValue({ ok: false, error: "has-active-recurring" });
    const user = userEvent.setup();
    render(inLocale(<ArchiveGroupRow group={groupOf()} />));

    await archiveThroughDialog(user);

    expect(
      await screen.findByText(/Pausiere erst die wiederkehrenden Ausgaben/),
    ).toBeInTheDocument();
  });

  it("shows a request that never arrived as not-saved, not as nothing happening", async () => {
    actions.setGroupArchived.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(inLocale(<ArchiveGroupRow group={groupOf()} />));

    await archiveThroughDialog(user);

    expect(await screen.findByText(/nichts gespeichert/)).toBeInTheDocument();
  });

  it("is disabled offline — archiving is a Server Action with nothing to queue it", () => {
    setOnline(false);
    render(inLocale(<ArchiveGroupRow group={groupOf()} />));

    expect(screen.getByRole("button", { name: "Gruppe archivieren" })).toBeDisabled();
  });
});

describe("ArchivedBanner", () => {
  it("lets a manager bring the group back with one tap", async () => {
    const user = userEvent.setup();
    render(inLocale(<ArchivedBanner group={groupOf({ archived: true })} canManage />));

    expect(screen.getByText("Diese Gruppe ist archiviert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Zurückholen" }));

    expect(actions.setGroupArchived).toHaveBeenCalledWith({ groupId: "g1", archived: false });
  });

  it("tells a plain member who can bring it back, and offers them no button", () => {
    render(inLocale(<ArchivedBanner group={groupOf({ archived: true })} canManage={false} />));

    expect(screen.getByText(/Ein Admin kann sie zurückholen/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zurückholen" })).not.toBeInTheDocument();
  });

  it("says why a failed bring-back failed", async () => {
    actions.setGroupArchived.mockResolvedValue({ ok: false, error: "forbidden" });
    const user = userEvent.setup();
    render(inLocale(<ArchivedBanner group={groupOf({ archived: true })} canManage />));

    await user.click(screen.getByRole("button", { name: "Zurückholen" }));

    expect(await screen.findByText("Gruppe konnte nicht zurückgeholt werden.")).toBeInTheDocument();
  });
});

describe("GroupSettingsTab — the archive row", () => {
  function settings(currentUid: string, group: Group) {
    return render(
      inLocale(
        <GroupSettingsTab
          group={group}
          recurringRules={[]}
          hasBookings={false}
          currentUid={currentUid}
        />,
      ),
    );
  }

  it("is there for the owner", () => {
    settings("max", groupOf());
    expect(screen.getByRole("button", { name: "Gruppe archivieren" })).toBeInTheDocument();
  });

  it("is there for admins", () => {
    settings("ada", groupOf());
    expect(screen.getByRole("button", { name: "Gruppe archivieren" })).toBeInTheDocument();
  });

  it("is not there for plain members", () => {
    settings("lea", groupOf());
    expect(screen.queryByRole("button", { name: "Gruppe archivieren" })).not.toBeInTheDocument();
  });

  it("is not there once the group is archived — the banner is the way back", () => {
    settings("max", groupOf({ archived: true }));
    expect(screen.queryByRole("button", { name: "Gruppe archivieren" })).not.toBeInTheDocument();
  });
});
