# Manual Cloudflare Setup (without the helper script)

Use this only if you do not want to run `FIRST_DEPLOY.ps1`.

```powershell
npm install
npx wrangler login
npx wrangler d1 create nexora-db --binding DB --update-config
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Then add these Worker secrets from Cloudflare Dashboard → Worker → Settings → Variables and Secrets:

```text
ADMIN_SETUP_KEY       = random 32+ characters
ADMIN_SESSION_SECRET  = random 48+ characters
IP_HASH_SECRET        = random 32+ characters
```

Do not add these values to `wrangler.jsonc`.

Then open:

```text
/admin/setup.html
```

After the first admin account is created, setup is locked by database state.
