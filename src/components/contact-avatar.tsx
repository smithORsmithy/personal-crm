import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/format";

// Full class names are listed so Tailwind can find them in the source
const colors = [
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-teal-100 text-teal-800",
  "bg-orange-100 text-orange-800",
  "bg-indigo-100 text-indigo-800",
];

const sizes = {
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
};

export function ContactAvatar({
  id,
  name,
  size = "md",
}: {
  id: number;
  name: string;
  size?: keyof typeof sizes;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-medium select-none",
        sizes[size],
        colors[id % colors.length],
      )}
    >
      {getInitials(name)}
    </span>
  );
}
