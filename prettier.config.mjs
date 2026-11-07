// Prettier defaults, with one exception: on Windows git checks files out
// with CRLF line endings, on Linux (CI) with LF. "auto" keeps whatever a
// file already has, so the check passes on both.

/** @type {import("prettier").Config} */
const config = {
  endOfLine: "auto",
};

export default config;
