import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Ссылка устарела",
};

// A link from an email that was used, ran out (15 minutes) or was replaced
// by a newer one: all three look the same. The reason is not shown.
export default function LinkExpiredPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-title">Ссылка устарела, запросите новую</h1>
      <Link href="/login" className={buttonVariants({ className: "mt-3" })}>
        На страницу входа
      </Link>
    </div>
  );
}
