import Link from "next/link";
import { TagsIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FilterGroup = { id: number; name: string };

type Mode =
  | {
      // The home page: the choice is made in the browser, no reload
      mode: "buttons";
      onSelect: (groupId: number | null) => void;
      // "Настроить группы" at the end of the row
      showSettingsLink?: boolean;
    }
  | {
      // The "Пора связаться" page: every button is a link, the server
      // builds the list
      mode: "links";
      hrefFor: (groupId: number | null) => string;
      showSettingsLink?: false;
    };

// A row of buttons: "Все" and one for every group. The chosen one is
// filled, the others are outlined. The row wraps onto more lines when
// there are many groups.
export function GroupFilter({
  groups,
  selectedId,
  ...props
}: {
  groups: FilterGroup[];
  selectedId: number | null;
} & Mode) {
  const settingsLink = props.showSettingsLink && (
    <Link
      href="/groups"
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "text-muted-foreground",
      )}
    >
      <TagsIcon />
      Настроить группы
    </Link>
  );

  // No groups: no buttons, only the way to create them
  if (groups.length === 0) {
    return settingsLink ? <div className="flex">{settingsLink}</div> : null;
  }

  const items: { id: number | null; name: string }[] = [
    { id: null, name: "Все" },
    ...groups,
  ];

  return (
    <nav aria-label="Группы" className="flex flex-wrap items-center gap-2">
      {items.map((item) => {
        const selected = item.id === selectedId;
        const className = cn(
          buttonVariants({
            variant: selected ? "default" : "outline",
            size: "sm",
          }),
          // A long name wraps inside the button instead of widening the row
          "h-auto min-h-8 max-w-full py-1 break-words whitespace-normal",
        );
        return props.mode === "buttons" ? (
          <button
            key={item.id ?? "all"}
            type="button"
            aria-pressed={selected}
            onClick={() => props.onSelect(item.id)}
            className={className}
          >
            {item.name}
          </button>
        ) : (
          <Link
            key={item.id ?? "all"}
            href={props.hrefFor(item.id)}
            replace
            aria-current={selected ? "true" : undefined}
            className={className}
          >
            {item.name}
          </Link>
        );
      })}
      {settingsLink}
    </nav>
  );
}
