import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Страница не найдена
      </h1>
      <p className="text-muted-foreground">
        Такого контакта нет, или в адресе опечатка.
      </p>
      <Link href="/" className={buttonVariants({ className: "mt-3" })}>
        К списку контактов
      </Link>
    </div>
  );
}
