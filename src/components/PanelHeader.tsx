import { Icon } from "./Icon";

/** Round close button ("Knop · Rond zacht" with Icoon/x). */
export function CloseButton({ onClick, label = "Sluiten" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-oppervlak text-tekst hover:bg-rand"
    >
      <Icon name="x" size={22} />
    </button>
  );
}

/** Title row of a panel in the sheet: big title, close button on the right. */
export function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-kop-xl">{title}</h2>
      <CloseButton onClick={onClose} />
    </div>
  );
}
