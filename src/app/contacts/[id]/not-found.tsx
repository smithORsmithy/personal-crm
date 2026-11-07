import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

// A card (or its "Изменить" page) that cannot be opened: the contact was
// deleted, the address has a typo, or the contact is someone else's. All
// three look the same, so nobody can tell whether a contact exists.
export default function ContactNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-title">Контакт не найден</h1>
      <p className="text-muted-foreground">
        Возможно, его удалили, или в адресе опечатка.
      </p>
      <Link href="/" className={buttonVariants({ className: "mt-3" })}>
        К списку контактов
      </Link>
    </div>
  );
}
