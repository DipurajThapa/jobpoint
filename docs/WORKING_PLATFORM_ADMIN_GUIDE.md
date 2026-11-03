# Working Platform — administrator guide

Working Platform is the internal team area of the Job Point website. Team
members open **`/platform`** (for example
`https://job-point-consultancy.dippurajthapa.chatgpt.site/platform`), sign in,
and see only the tools an administrator has given them. The first tool is
**Email Kit** (formerly Usha).

Knowing the address gives no access. Every page and every data request checks
the person's session and their permission on the server.

## 1. First-time setup (site owner, once)

1. Publish the site from Sites (this applies database migration
   `0002_working_platform.sql`).
2. Open **`/platform/owner`**. It asks you to sign in with ChatGPT as the site
   owner (`dipuraj.thapa@gmail.com`, the same account as `/admin`). Anyone
   else gets "not found".
3. Under **Create the first administrator**, enter a name, a work email and a
   password (at least 12 characters, not containing the email name).
4. Go to **`/platform/sign-in`** and sign in with that email and password.

This form only works while no active administrator exists. Afterwards the
owner page offers only administrator recovery (section 6).

## 2. Invite a team member

1. Signed in as an administrator, open **Team access**.
2. Under **Invite a team member** enter their work email (name optional),
   choose **Team member** or **Administrator**, and set **Email Kit** to
   *No access*, *View*, *Edit* or *Manage*.
3. Choose **Create invitation link**. A one-time link appears **once**. Copy it
   and send it to that person directly (no email is sent automatically,
   because the site has no email service).
4. They open the link within **72 hours**, enter their name and a password, and
   arrive at their dashboard.

If the link expires, use **New invitation link** on their row. A new link
cancels the old one.

### Email Kit access levels

| Level | Can do |
|---|---|
| View | Read client records, history and drafts. Cannot change anything. |
| Edit | Daily outreach: draft, mark as sent, record replies and opt-outs, meetings, notes, attachments, import contacts, delete a contact or conversation. |
| Manage | Everything in Edit, plus agency profile, follow-up rules, restoring backups and recovery points, and deleting all client records. |

Administrators always have Manage access to every tool and can open Team access.

## 3. Change or remove access

On Team access, each person has controls that take effect on their **next
request**. No sign-out is needed.

- **Tool level**: change the Email Kit select (choose *No access* to remove it).
- **Role**: Team member or Administrator.
- **Disable**: blocks sign-in and ends all their sessions at once. Use this
  when someone leaves. **Enable** restores the account.
- **Delete**: removes the account. Email Kit history they recorded stays, so
  the record of who did what remains.

Two safeguards: you cannot disable, demote or delete yourself, and the last
active administrator cannot be removed.

## 4. Forgotten passwords

1. The person opens **Forgot password?** on the sign-in page, which tells them to
   contact an administrator. It never reveals whether an account exists.
2. On Team access choose **Create reset link** for them. Send the one-time link
   directly (it is valid for 24 hours).
3. They choose a new password. All their other sessions end.

People can change their own password under **My account**. That also signs
them out on other devices.

## 5. Recent activity

Team access lists the latest 100 platform events: sign-ins, failed sign-ins,
invitations, permission changes, resets, restriction lifts, restores and bulk
deletions, each with the acting person.

## 6. If no administrator can sign in

The site owner opens **`/platform/owner`** (Sign in with ChatGPT). Under
**Recover an administrator**, they enter the administrator's email, get a
24-hour one-time link, and pass it on.

## 7. Moving existing Usha records into Email Kit

Follow the cut-over steps in [tools/email-kit/README.md](../tools/email-kit/README.md#moving-records-from-usha).
In short:

1. Stop using the old app.
2. Save a protected backup from each browser that used it.
3. In Email Kit, with Manage access, enter the same agency name under Agency setup.
4. Restore each backup and check the per-record table it shows.
5. Keep the backups for 90 days.

## Security notes for administrators

- Send invitation and reset links one-to-one (direct message or phone), never
  in a group chat. Anyone holding an unused link can claim that account.
- Disable accounts promptly when people leave.
- Sessions expire after 12 hours of inactivity and always within 7 days.
- Sign-in is limited to 10 attempts per 15 minutes per network and 20 per
  account.
- The database stores passwords and links only as one-way hashes.
- Email Kit sends nothing. Consultants send from their own mailbox and record
  the send in Email Kit.
