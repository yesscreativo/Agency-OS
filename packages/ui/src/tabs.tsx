import type { ReactNode } from "react";

export interface TabItem {
  key: string;
  label: ReactNode;
  href?: string;
}

interface TabsProps {
  items: TabItem[];
  activeKey: string;
  onSelect?: (key: string) => void;
  className?: string;
}

function TabEl({
  item,
  className,
  onSelect,
}: {
  item: TabItem;
  className: string;
  onSelect?: (key: string) => void;
}) {
  if (item.href) {
    return (
      <a href={item.href} className={className}>
        {item.label}
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={onSelect && (() => onSelect(item.key))}>
      {item.label}
    </button>
  );
}

/** Tabs segmentadas en píldora (filtros de vista). */
export function SegmentedTabs({ items, activeKey, onSelect, className = "" }: TabsProps) {
  return (
    <div className={`inline-flex gap-0.5 rounded-pill bg-surface-2 p-1 ${className}`}>
      {items.map((item) => (
        <TabEl
          key={item.key}
          item={item}
          onSelect={onSelect}
          className={`cursor-pointer rounded-pill px-[18px] py-2 font-sans text-[13px] transition ${
            item.key === activeKey
              ? "bg-green font-semibold text-green-ink"
              : "font-medium text-muted hover:text-ink"
          }`}
        />
      ))}
    </div>
  );
}

/** Tabs con subrayado verde (secciones de detalle). */
export function UnderlineTabs({ items, activeKey, onSelect, className = "" }: TabsProps) {
  return (
    <div className={`flex gap-6 border-b border-line px-1 ${className}`}>
      {items.map((item) => (
        <TabEl
          key={item.key}
          item={item}
          onSelect={onSelect}
          className={`cursor-pointer border-b-2 pb-3 font-sans text-sm transition ${
            item.key === activeKey
              ? "border-green font-semibold text-ink"
              : "border-transparent font-medium text-muted hover:text-ink"
          }`}
        />
      ))}
    </div>
  );
}
