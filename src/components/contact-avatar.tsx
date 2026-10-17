import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/format";

// Full class names are listed so Tailwind can find them in the source
const colors = [
  "bg-avatar-1",
  "bg-avatar-2",
  "bg-avatar-3",
  "bg-avatar-4",
  "bg-avatar-5",
  "bg-avatar-6",
];

const sizes = {
  md: "size-10 text-xl",
  lg: "size-14 text-3xl",
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
        // Handwritten initials, like the step numbers on the landing
        "flex shrink-0 items-center justify-center rounded-full font-script leading-none text-ink-2 select-none",
        sizes[size],
        colors[id % colors.length],
      )}
    >
      {getInitials(name)}
    </span>
  );
}
