import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/client/api";
import { copyDraft, persistRoomDraft, type EditorDraft } from "../src/client/lib/room-editor-draft";

const initial = (): EditorDraft => ({
  theme: "orah", sections: [{ id: "section", kind: "about", title: "O meni", items: [
    { id: "item", kind: "text", text: "Sačuvano", mediaId: null, sharedWithGuests: false },
  ] }],
});
afterEach(() => vi.restoreAllMocks());
describe("Explicit confirmation of room/profile drafts", () => {
  it("does not write when an unchanged draft is confirmed", async () => {
    const post = vi.spyOn(api, "post");
    const patch = vi.spyOn(api, "patch");
    const del = vi.spyOn(api, "del");
    await persistRoomDraft(initial(), initial(), vi.fn(), () => true);
    expect(post).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
  it("stages theme and visibility without mutating saved data, then uses existing owner endpoints", async () => {
    const original = initial();
    const desired = copyDraft(original);
    desired.theme = "petrol";
    desired.sections[0].items[0].sharedWithGuests = true;
    const patch = vi.spyOn(api, "patch").mockResolvedValue({ ok: true });
    expect(patch).not.toHaveBeenCalled();
    expect(original).toEqual(initial());
    const progress = vi.fn();
    await persistRoomDraft(original, desired, progress, () => true);
    expect(patch.mock.calls).toEqual([
      ["/room/items/item", { sharedWithGuests: true }],
      ["/rooms/mine", { theme: "petrol" }],
    ]);
    expect(progress.mock.lastCall?.[0]).toEqual(desired);
    expect(original).toEqual(initial());
  });
  it("only deletes items/sections after confirmation", async () => {
    const original = initial();
    original.sections.push({ id: "custom", title: "Stara cjelina", kind: "custom", items: [] });
    const desired = copyDraft(original);
    desired.sections = [desired.sections[0]];
    desired.sections[0].items = [];
    const del = vi.spyOn(api, "del").mockResolvedValue({ ok: true });
    expect(del).not.toHaveBeenCalled();
    await persistRoomDraft(original, desired, vi.fn(), () => true);
    expect(del.mock.calls).toEqual([["/room/items/item"], ["/room/sections/custom"]]);
  });
  it("retains progress after failure so retry does not duplicate a new section", async () => {
    let saved = initial();
    let desired = copyDraft(saved);
    desired.sections.push({ id: "draft-new-section", kind: "custom", title: "Nova", items: [
      { id: "draft-text", kind: "text", text: "Novi tekst", mediaId: null, sharedWithGuests: false },
    ] });
    const post = vi.spyOn(api, "post")
      .mockResolvedValueOnce({ section: { id: "new-section" } })
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ item: { id: "new-item", kind: "text", text: "Novi tekst", mediaId: null, sharedWithGuests: false } });
    const progress = (baseline: EditorDraft, remaining: EditorDraft) => { saved = baseline; desired = remaining; };
    await expect(persistRoomDraft(saved, desired, progress, () => true)).rejects.toThrow("temporary failure");
    await persistRoomDraft(saved, desired, progress, () => true);
    expect(post.mock.calls.filter(([path]) => path === "/room/sections")).toHaveLength(1);
    expect(desired.sections[1].items[0].id).toBe("new-item");
    expect(saved).toEqual(desired);
  });
  it("uploads a staged photo only on confirmation and preserves its selected visibility", async () => {
    const original = initial();
    const desired = copyDraft(original);
    const file = new File(["synthetic"], "photo.png", { type: "image/png" });
    desired.sections[0].items.push({ id: "draft-image", kind: "image", text: null, mediaId: null, sharedWithGuests: true, file });
    const upload = vi.spyOn(api, "upload").mockResolvedValue({ item: { id: "image", kind: "image", text: null, mediaId: "media", sharedWithGuests: false } });
    const patch = vi.spyOn(api, "patch").mockResolvedValue({ ok: true });
    expect(upload).not.toHaveBeenCalled();
    await persistRoomDraft(original, desired, vi.fn(), () => true);
    expect(upload).toHaveBeenCalledWith("/room/items/image", file, { sectionId: "section" });
    expect(patch).toHaveBeenCalledWith("/room/items/image", { sharedWithGuests: true });
  });
  it("stops further writes if the editor is closed during a confirmed save", async () => {
    const desired = initial();
    desired.sections[0].items.push(
      { id: "draft-one", kind: "text", text: "One", mediaId: null },
      { id: "draft-two", kind: "text", text: "Two", mediaId: null },
    );
    let active = true;
    const post = vi.spyOn(api, "post").mockImplementation(async () => {
      active = false;
      return { item: { id: "first", kind: "text", text: "One", mediaId: null } } as never;
    });
    await persistRoomDraft(initial(), desired, vi.fn(), () => active);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
