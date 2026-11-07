// Reads the emails the app sent to Mailpit (the fake mailbox that runs in
// Docker next to the database) through its API. Tests use a different email
// address each, so a search by recipient finds only their own emails.

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";

export type Email = {
  id: string;
  from: { name: string; address: string };
  to: string[];
  subject: string;
  html: string;
  text: string;
  // The address behind the «Войти» button
  link: string;
};

type MessageSummary = { ID: string; Created: string };

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Mailpit answered ${response.status} for ${path}`);
  }
  return (await response.json()) as T;
}

// Emails to one address, the oldest first
async function summariesTo(address: string): Promise<MessageSummary[]> {
  const query = encodeURIComponent(`to:"${address}"`);
  const { messages } = await getJson<{ messages: MessageSummary[] }>(
    `/api/v1/search?query=${query}`,
  );
  return [...messages].sort((a, b) => a.Created.localeCompare(b.Created));
}

export async function countEmailsTo(address: string): Promise<number> {
  return (await summariesTo(address)).length;
}

// Waits until the address has received more than `already` emails and gives
// the newest one. A test that asks for a second link passes the count it
// saw before asking.
export async function waitForEmail(
  address: string,
  already = 0,
  timeoutMs = 15_000,
): Promise<Email> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await summariesTo(address);
    if (found.length > already) {
      return readEmail(found[found.length - 1].ID);
    }
    if (Date.now() > deadline) {
      throw new Error(`No email to ${address} in ${timeoutMs / 1000} seconds`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function readEmail(id: string): Promise<Email> {
  const message = await getJson<{
    ID: string;
    From: { Name: string; Address: string };
    To: { Address: string }[];
    Subject: string;
    HTML: string;
    Text: string;
  }>(`/api/v1/message/${id}`);

  // The link in the button: <a href="…">Войти</a>
  const button = message.HTML.match(
    /<a [^>]*href="([^"]+)"[^>]*>\s*Войти\s*<\/a>/,
  );
  if (!button) {
    throw new Error("No «Войти» button in the email");
  }
  return {
    id: message.ID,
    from: { name: message.From.Name, address: message.From.Address },
    to: message.To.map((recipient) => recipient.Address),
    subject: message.Subject,
    html: message.HTML,
    text: message.Text,
    link: button[1].replaceAll("&amp;", "&"),
  };
}
