import { getCurrentUser } from "@/lib/auth/current-user";

import { ReloadOnUserChange } from "./reload-on-user-change";
import { SignOutButton } from "./sign-out-button";

// The email of the signed-in user and «Выйти», on the right of the header.
// Nothing on the sign-in page: nobody is signed in there.
export async function UserMenu() {
  const user = await getCurrentUser();

  return (
    <>
      {/* On every page, the sign-in page too: a tab left open there sees a
          sign-in made in another tab */}
      <ReloadOnUserChange userId={user?.id ?? null} />
      {user && (
        <div className="ml-auto flex min-w-0 items-center gap-3">
          {/* A long address is cut with an ellipsis on a narrow screen */}
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {user.email}
          </span>
          <SignOutButton />
        </div>
      )}
    </>
  );
}
