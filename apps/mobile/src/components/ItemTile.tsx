import type { Item } from "../lib/items";

const FALLBACK_ICON: Record<Item["type"], string> = {
  PHOTO: "🖼️",
  VIDEO: "🎥",
  PDF: "📄",
  NOTE: "📝",
};

export function ItemTile({ item, onClick }: { item: Item; onClick?: () => void }) {
  return (
    <div className="item-tile" onClick={onClick}>
      {item.thumbnailUrl ? (
        <img src={item.thumbnailUrl} alt="" className="item-tile__thumb" loading="lazy" />
      ) : (
        <span className="item-tile__icon">{FALLBACK_ICON[item.type]}</span>
      )}
      <span className="item-tile__title">{item.title}</span>
    </div>
  );
}
