import { useNavigate } from "react-router-dom";
import type { Item } from "../lib/items";
import { STAMP_META } from "../lib/stamps";

const FALLBACK_ICON: Record<Item["type"], string> = {
  PHOTO: "🖼️",
  VIDEO: "🎥",
  PDF: "📄",
  NOTE: "📝",
};

export function ItemTile({ item, onClick }: { item: Item; onClick?: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="item-tile" onClick={onClick ?? (() => navigate(`/items/${item.id}`))}>
      {item.thumbnailUrl ? (
        <img src={item.thumbnailUrl} alt="" className="item-tile__thumb" loading="lazy" />
      ) : (
        <span className="item-tile__icon">{FALLBACK_ICON[item.type]}</span>
      )}
      {item.stamps.length > 0 && (
        <span className="item-tile__stamps">
          {item.stamps.map((stamp) => (
            <span key={stamp} title={STAMP_META[stamp].label}>
              {STAMP_META[stamp].emoji}
            </span>
          ))}
        </span>
      )}
      <span className="item-tile__title">{item.title}</span>
    </div>
  );
}
