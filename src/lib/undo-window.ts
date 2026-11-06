// How long a deleted contact or group can be brought back. Shared by the server and
// the browser, so it lives outside the "use server" actions file, which
// may export only async functions.

// The "Отменить" button is shown for this long
export const UNDO_SECONDS = 5;

// Extra time the server still accepts "Отменить" for: a click at the last
// second may reach the server a bit later on a slow network.
// The contact (or group) is erased for good only after UNDO_SECONDS + this.
export const RESTORE_GRACE_SECONDS = 2;

export const KEEP_DELETED_SECONDS = UNDO_SECONDS + RESTORE_GRACE_SECONDS;
