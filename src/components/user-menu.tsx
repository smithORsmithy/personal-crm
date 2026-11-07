import { getCurrentUser } from "@/lib/auth/current-user";

import { SignOutButton } from "./sign-out-button";

// The email of the signed-in user and «Выйти», on the right of the header.
// Nothing on the sign-in page: nobody is signed in there.
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  return (
    <div className="ml-auto flex min-w-0 items-center gap-3">
      {/* A long address is cut with an ellipsis on a narrow screen */}
      <span className="min-w-0 truncate text-sm text-muted-foreground">
        {user.email}
      </span>
      <SignOutButton />
    </div>
  );
}
