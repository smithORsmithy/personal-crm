import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex w-fit items-center gap-1.5 text-sm font-bold text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
    >
      <ArrowLeftIcon className="size-4" aria-hidden />
      {children}
    </Link>
  );
}
