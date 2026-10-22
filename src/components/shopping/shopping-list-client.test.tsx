import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Next = (snapshot: unknown) => void;
interface Listener {
  path: string;
  next: Next;
}

const h = vi.hoisted(() => ({
  listeners: [] as Listener[],
  setChecked: vi.fn(),
  addItem: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  query: (ref: { path: string }) => ref,
  orderBy: () => null,
  limit: () => null,
  // onSnapshot(ref, [options,] next, fail)
  onSnapshot: (ref: { path: string }, ...rest: unknown[]) => {
    const next = (typeof rest[0] === "function" ? rest[0] : rest[1]) as Next;
    h.listeners.push({ path: ref.path, next });
    return () => {};
  },
}));
vi.mock("@/lib/firebase/client", () => ({ db: {}, auth: {} }));
vi.mock("@/lib/firebase/use-current-user", () => ({ useCurrentUser: () => ({ uid: "lea" }) }));
vi.mock("@/lib/actions/shopping", () => ({
  setShoppingItemChecked: h.setChecked,
  addShoppingItem: h.addItem,
  clearCheckedShoppingItems: vi.fn(),
  deleteShoppingItem: vi.fn(),
  deleteShoppingList: vi.fn(),
  createShoppingList: vi.fn(),
  updateShoppingList: vi.fn(),
  updateShoppingItem: vi.fn(),
}));

import { LocaleProvider } from "@/components/locale-provider";
import { clearPendingChecks } from "@/lib/shopping/pending-checks";
import { ShoppingListClient } from "./shopping-list-client";

const GROUP = {
  name: "Wir zwei",
  memberUids: ["lea", "max"],
  members: {
    lea: { displayName: "Lea", role: "owner", isPlaceholder: false },
    max: { displayName: "Max", role: "member", isPlaceholder: false },
  },
};
const LIST = { name: "Rewe", icon: "🛒", openCount: 2, createdAt: "t", updatedAt: "t" };
const ITEMS = [
  {
    id: "item-milch-000000001",
    name: "Milch",
    quantity: "2 l",
    forUid: null,
    createdAt: "2026-10-22T10:00:00.000Z",
    checked: false,
    checkedBy: null,
    checkedChangedAt: null,
    product: { family: "dairy", kind: "Milch" },
  },
  {
    id: "item-shampoo-0000001",
    name: "Shampoo",
    quantity: null,
    forUid: "max",
    createdAt: "2026-10-22T10:01:00.000Z",
    checked: false,
    checkedBy: null,
    checkedChangedAt: null,
  },
  {
    id: "item-brot-0000000001",
    name: "Brot",
    quantity: null,
    forUid: null,
    createdAt: "2026-10-22T09:00:00.000Z",
    checked: true,
    checkedBy: "max",
    checkedChangedAt: "2026-10-22T10:05:00.000Z",
    product: { family: "bakery", kind: "Brot" },
  },
];

let online = true;

function listener(path: string) {
  const found = h.listeners.filter((entry) => entry.path === path).at(-1);
  if (!found) throw new Error(`no listener on ${path}`);
  return found;
}

function deliverDoc(path: string, data: object | null, fromCache = false) {
  act(() =>
    listener(path).next({
      id: path.split("/").at(-1),
      exists: () => data !== null,
      data: () => data,
      metadata: { fromCache },
    }),
  );
}

function deliverItems(items: object[], fromCache = false) {
  act(() =>
    listener("groups/g1/shoppingLists/l1/items").next({
      docs: items.map(({ id, ...data }: { id?: string }) => ({ id, data: () => data })),
      metadata: { fromCache },
    }),
  );
}

function renderList() {
  render(
    <LocaleProvider initialLocale="de">
      <ShoppingListClient groupId="g1" listId="l1" />
    </LocaleProvider>,
  );
}

function loadEverything(fromCache = false) {
  deliverDoc("groups/g1", GROUP, fromCache);
  deliverDoc("groups/g1/shoppingLists/l1", LIST, fromCache);
  deliverItems(ITEMS, fromCache);
}

describe("ShoppingListClient", () => {
  beforeEach(() => {
    h.listeners.length = 0;
    h.setChecked.mockReset();
    h.addItem.mockReset();
    online = true;
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
    localStorage.clear();
    clearPendingChecks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sorts open items by aisle and puts the checked ones in the cart", () => {
    renderList();
    loadEverything();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((el) => el.textContent);
    expect(headings[0]).toContain("Milch");
    expect(headings[1]).toContain("Noch nicht eingeordnet");
    expect(headings).toContain("Im Wagen (1)");
    expect(
      within(screen.getByRole("checkbox", { name: "Shampoo abhaken" })).getByText("für Max"),
    ).toBeInTheDocument();
    expect(screen.getByText("von Max")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Brot wieder auf die Liste" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("offline: a tick still counts, waits on the device and goes out once back online", async () => {
    localStorage.setItem("split:synced:lea:shopping:g1:l1", String(Date.now()));
    online = false;
    renderList();
    loadEverything(true);

    expect(screen.getByRole("textbox", { name: "Was fehlt?" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Milch abhaken" }));

    expect(screen.getByRole("checkbox", { name: "Milch wieder auf die Liste" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 Haken noch nicht gesendet");
    expect(h.setChecked).not.toHaveBeenCalled();

    h.setChecked.mockResolvedValue({ ok: true, data: { applied: true } });
    online = true;
    const { flushPendingChecks } = await import("@/lib/shopping/pending-checks");
    await act(async () => {
      await flushPendingChecks("lea");
    });
    expect(h.setChecked).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "g1",
        listId: "l1",
        itemId: "item-milch-000000001",
        checked: true,
      }),
    );
    // Sent, and confirmed by the listener: the tick stays, nothing is pending any more.
    deliverItems(ITEMS.map((item) => (item.name === "Milch" ? { ...item, checked: true } : item)));
    expect(screen.queryByText(/noch nicht gesendet/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Milch wieder auf die Liste" }),
    ).toBeInTheDocument();
  });

  it("offline without a copy on this device says so instead of an empty list", () => {
    online = false;
    renderList();
    deliverDoc("groups/g1", GROUP, true);
    deliverDoc("groups/g1/shoppingLists/l1", null, true);
    deliverItems([], true);
    expect(screen.getByText("Dafür brauchst du Internet")).toBeInTheDocument();
  });

  it("adds what's typed, with amount and person, and shows it until the listener has it", async () => {
    let resolve: (value: unknown) => void = () => {};
    h.addItem.mockReturnValue(new Promise((done) => (resolve = done)));
    renderList();
    loadEverything();

    fireEvent.change(screen.getByRole("textbox", { name: "Was fehlt?" }), {
      target: { value: "Hafermilch" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Menge" }), { target: { value: "3" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Für" }), { target: { value: "max" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    expect(h.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "g1",
        listId: "l1",
        name: "Hafermilch",
        quantity: "3",
        forUid: "max",
      }),
    );
    const pending = screen.getByText("Wird hinzugefügt …").closest("li")!;
    expect(within(pending).getByText("Hafermilch")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Was fehlt?" })).toHaveValue("");

    const itemId = h.addItem.mock.calls[0][0].itemId as string;
    await act(async () => resolve({ ok: true, data: { itemId } }));
    deliverItems([
      ...ITEMS,
      {
        id: itemId,
        name: "Hafermilch",
        quantity: "3",
        forUid: "max",
        createdAt: "2026-10-22T11:00:00.000Z",
        checked: false,
        checkedBy: null,
        checkedChangedAt: null,
      },
    ]);
    await waitFor(() => expect(screen.queryByText("Wird hinzugefügt …")).not.toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "Hafermilch abhaken" })).toBeInTheDocument();
  });

  it("a failed add stays on screen with retry, never looking like it's still sending", async () => {
    h.addItem.mockRejectedValue(new Error("offline"));
    renderList();
    loadEverything();
    fireEvent.change(screen.getByRole("textbox", { name: "Was fehlt?" }), {
      target: { value: "Eier" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    expect(await screen.findByText(/nichts gespeichert/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut" })).toBeInTheDocument();
  });
});
