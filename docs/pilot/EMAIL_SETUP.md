# Email delivery, free (Brevo)

Brevo's free plan sends 300 emails a day, and one verified sender address is enough to start. You do not need a domain.

1. Create a free account at brevo.com.
2. Go to **Senders, domains & dedicated IPs → Senders → Add a sender**, then verify the address you will send from (click the link in the email Brevo sends you).
3. Go to **SMTP & API → API keys → Generate a new API key**, and copy it.
4. In the site's hosting settings (environment variables / secrets), set:
   - `MAIL_PROVIDER` = `brevo`
   - `MAIL_API_KEY` = the key (keep it secret)
   - `MAIL_FROM` = the sender address you verified
5. Republish. In the owner console, go to **Pilot and investor → Email delivery → Send test**, using your own address. The log shows `sent` or the provider's reason for refusing.

For better delivery later, verify a domain you own in Brevo (adds SPF and DKIM records), then use an address on that domain. A Gmail sender address works for a start, but some inboxes file it as spam.

What is sent: acknowledgements for CVs and enquiries, sign-in and reset links, and every hiring update (put forward, shortlisted, interview times and changes, offer, commitment link, not selected) to the candidate and to the client's team. Each attempt is in the email log, with the address masked.

Alternative: Resend (free, 3,000 a month). Set `MAIL_PROVIDER=resend`. It needs a verified domain to send to anyone other than yourself.
