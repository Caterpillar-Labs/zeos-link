import ZSession from "zeos-link";

const app = document.getElementById("app")!;
const session = new ZSession();

app.innerHTML = `
  <h1>zeos-link Vite example</h1>
  <button id="login">Login</button>
  <pre id="out"></pre>
`;

const out = document.getElementById("out")!;

const chain = {
  chain_id: "REPLACE_WITH_CHAIN_ID",
  protocol_contract: "REPLACE_WITH_PROTOCOL_CONTRACT",
  vault_contract: "REPLACE_WITH_VAULT_CONTRACT",
  alias_authority: "REPLACE_WITH_ALIAS_AUTHORITY",
};

document.getElementById("login")!.addEventListener("click", async () => {
  try {
    const result = await session.login(chain);
    out.textContent = result ? JSON.stringify(result, null, 2) : "Login declined";
  } catch (err) {
    out.textContent = err instanceof Error ? err.message : String(err);
  }
});
