import { api, type RoomItem, type RoomSection } from "../api";

export type EditorItem = RoomItem & { file?: File; previewUrl?: string };
export type EditorSection = Omit<RoomSection, "items"> & { items: EditorItem[] };
export type EditorDraft = { theme: string; sections: EditorSection[] };
export const draftId = () => `draft-${crypto.randomUUID()}`;
export const isNew = (id: string) => id.startsWith("draft-");
export const copyDraft = (draft: EditorDraft): EditorDraft => ({
  theme: draft.theme,
  sections: draft.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) })),
});

/**
 * Called ONLY after explicit confirmation. Keep a checkpoint after each
 * successful request so a retry never duplicates an already saved addition.
 * Existing endpoints retain all ownership, upload and visibility checks.
 */
export async function persistRoomDraft(
  original: EditorDraft, desired: EditorDraft,
  progress: (saved: EditorDraft, remaining: EditorDraft) => void,
  active: () => boolean,
) {
  const saved = copyDraft(original);
  const work = copyDraft(desired);
  const checkpoint = () => progress(copyDraft(saved), copyDraft(work));
  for (const section of work.sections) {
    if (!active()) return;
    if (isNew(section.id)) {
      const result = await api.post<{ section: { id: string } }>("/room/sections", { title: section.title });
      section.id = result.section.id;
      saved.sections.push({ ...section, items: [] });
      checkpoint();
    }
    const stored = saved.sections.find((s) => s.id === section.id)!;
    for (let index = 0; index < section.items.length; index++) {
      if (!active()) return;
      let item = section.items[index];
      if (isNew(item.id)) {
        const result = item.file
          ? await api.upload<{ item: RoomItem }>("/room/items/image", item.file, { sectionId: section.id })
          : await api.post<{ item: RoomItem }>("/room/items", {
            sectionId: section.id, kind: item.kind, text: item.text,
            sharedWithGuests: !!item.sharedWithGuests,
          });
        stored.items.push({ ...result.item });
        item = { ...result.item, sharedWithGuests: !!item.sharedWithGuests };
        section.items[index] = item;
        checkpoint();
      }
      const before = stored.items.find((i) => i.id === item.id)!;
      if (!!before.sharedWithGuests !== !!item.sharedWithGuests) {
        if (!active()) return;
        await api.patch(`/room/items/${item.id}`, { sharedWithGuests: !!item.sharedWithGuests });
        before.sharedWithGuests = !!item.sharedWithGuests;
        checkpoint();
      }
    }
    for (const item of [...stored.items]) {
      if (section.items.some((i) => i.id === item.id)) continue;
      if (!active()) return;
      await api.del(`/room/items/${item.id}`);
      stored.items = stored.items.filter((i) => i.id !== item.id);
      checkpoint();
    }
  }
  for (const section of [...saved.sections]) {
    if (work.sections.some((s) => s.id === section.id)) continue;
    if (!active()) return;
    await api.del(`/room/sections/${section.id}`);
    saved.sections = saved.sections.filter((s) => s.id !== section.id);
    checkpoint();
  }
  if (saved.theme !== work.theme) {
    if (!active()) return;
    await api.patch("/rooms/mine", { theme: work.theme });
    saved.theme = work.theme;
    checkpoint();
  }
}
