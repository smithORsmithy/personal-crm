"use client";

import { useEffect } from "react";

// Tabs of one browser share the sign-in. Every page notes here for whom it
// was shown; a tab left open while another tab signed out, or in as someone
// else, sees on return that the note is not its own.
const LAST_USER_KEY = "personal-crm:user";

// A tab opened before a sign-out or a change of user in another tab of the
// same browser still shows the old email and the old data. On return to it
// the tab reloads and shows whoever is signed in now. This is about what the
// page shows only: every page and action asks the server for the user anyway.
export function ReloadOnUserChange({ userId }: { userId: string | null }) {
  useEffect(() => {
    const shownFor = userId ?? "";
    writeLastUser(shownFor);

    function onReturn() {
      if (document.visibilityState !== "visible") {
        return;
      }
      const last = readLastUser();
      if (last !== null && last !== shownFor) {
        window.location.reload();
      }
    }

    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [userId]);

  return null;
}

// The browser may refuse its storage (strict privacy settings): then the
// tab simply does not reload by itself
function readLastUser(): string | null {
  try {
    return window.localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}

function writeLastUser(userId: string): void {
  try {
    window.localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    // See readLastUser
  }
}
