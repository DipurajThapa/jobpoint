# Keys, two-step sign-in and hosting: what you need to do

## 1. The "shared secret", in plain words

The site holds two secret values that only the server knows:

| Setting | What it does | What breaks if it changes |
|---|---|---|
| `PORTAL_SECRET` | Makes each candidate's reference code for each client (for example `c_bmkhciamy9bx`) and the trace code stamped on CV downloads. The same person gets a different code at every client, so two clients cannot compare notes. | Every reference code already stored would stop matching. Clients would lose their link to candidates in their pipeline. **Do not change this once the site has data.** |
| `PLATFORM_SECRET_KEY` | Encrypts stored passwords for outside services (integration tokens) and, now, two-step sign-in secrets. | Stored integration tokens and two-step secrets become unreadable (they would have to be entered again). |

The problem the audit found: if `PORTAL_SECRET` is not set, the code quietly
uses `PLATFORM_SECRET_KEY` for both jobs. One leaked value would then expose
both, and you could never rotate the encryption key without breaking every
candidate reference.

### What I changed

A third setting, `INTEGRATION_SECRET_KEY`. When it is set, stored credentials
are encrypted with it. Values written before stay readable, and one button
moves them to the new key. Candidate references are untouched.

### What you do (once, about 10 minutes, in the hosting settings)

1. Look at your current settings. **If `PORTAL_SECRET` is empty**, create it
   with exactly the same value as `PLATFORM_SECRET_KEY`. This freezes the value
   the reference codes already use. If it is already set, leave it.
2. Create `INTEGRATION_SECRET_KEY` with a new random value of 43 characters.
   Any password manager can make one, or run:
   ```bash
   openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
   ```
3. Publish. Then sign in as administrator and open Working Platform → Admin →
   Operations, and run "re-encrypt stored credentials" (action
   `secrets.rewrap`). It reports how many values moved.
4. Only after step 3: you may replace `PLATFORM_SECRET_KEY` with a new value,
   provided step 1 gave `PORTAL_SECRET` its own copy.

Also confirm `NODE_ENV=production` is set. Without it the portal now refuses to
start instead of falling back to a built-in secret.

## 2. Two-step sign-in (built, optional, off for everyone)

- Staff: Working Platform → My account → Two-step sign-in. Enter the password,
  add the key to an authenticator app, confirm one code, save the ten recovery
  codes. Nothing changes for an account until its owner does this.
- At sign-in the code box appears only for people who turned it on.
- A used code cannot be used again. A recovery code works once.
- An administrator can reset a colleague who lost their phone. Nobody can reset
  their own without a code.
- **Single staff sign-in:** once *your* administrator account has two-step
  sign-in on, that one sign-in also opens the owner console (`/admin`). Until
  then the owner console keeps using Sign in with ChatGPT only. A team manager
  or team member can never open it.
- Not built yet: two-step sign-in for clients and candidates, and a switch that
  makes it compulsory for staff. Both are small now that the core exists.

## 3. Staff roles as built

| | Administrator (you) | Team manager | Team member |
|---|---|---|---|
| Clients and jobs seen | All | Own team's | Own team's; jobs unassigned or assigned to them |
| Candidates seen per job | Full ranked list with scores | Three at a time, no scores | Three at a time, no scores |
| Phone and email | Yes | One candidate at a time, 50 different people a day, each view logged | One at a time, 25 a day, each view logged |
| Download a CV file | Yes (owner console, logged) | No | No |
| Export or bulk list | Yes | No | No |
| Assign jobs, invite to team | Yes | Own team | No |
| Owner console, approvals, deletions | Yes | No | No |

## 4. Installer scripts and package name (to check with your hosting workflow)

Left unchanged because the hosting service ("Sites") may call them.

1. In the hosting project's build settings, note the exact **install command**
   and **build command**.
2. If the install command is `npm run install:ci` (or mentions
   `scripts/install-ci.mjs`): keep `scripts/install-ci.mjs` and
   `scripts/install-ci.sh`. If it is plain `npm ci` or `npm install`, all of
   `scripts/install-ci.*`, `scripts/npm-install.mjs`, `scripts/pnpm-install.mjs`
   and `scripts/install-pnpm.sh` can be deleted.
3. If nothing mentions pnpm, `scripts/pnpm-install.mjs` and
   `scripts/install-pnpm.sh` can go in any case.
4. Ask the host (or check its docs) whether it reads the `name` field in
   `package.json`. If not, rename `site-creator-vinext-starter` to `jobboard300`
   in `package.json` and at the top of `package-lock.json` (two places).
5. Tell me the two commands and I will make the change and confirm the build.
