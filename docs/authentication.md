# Hà Thành Vị authentication

The authentication API uses the database `users.role` for customer, staff, and admin permissions. No password or OTP is stored in the browser. Passwords use salted scrypt. Session and remembered-device cookies hold random opaque tokens with only digests in MongoDB.

## HTTP contracts

All public authentication POST requests require `X-Requested-With: XMLHttpRequest`; browser origins must match the configured frontend origin.

| Endpoint under `/api/auth` | Request                                     | Success                                                                                                                        |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `register`                 | `name,email,phone,password,confirmPassword` | 201 `{verificationRequired:true,email,message}`; no session                                                                    |
| `verify-email`             | `email,code,rememberDevice?`                | 200 `{user}` plus session; optional remembered device                                                                          |
| `resend-verification`      | `email`                                     | Generic 202 `{message}`                                                                                                        |
| `login`                    | `email,password,rememberDevice?`            | 200 `{otpRequired:true,challengeId,email,message}` for a new device; otherwise `{user}` plus session after password validation |
| `verify-login`             | `challengeId,code`                          | 200 `{user}` plus session; remembered-device choice is frozen at password stage                                                |
| `resend-login-otp`         | `challengeId`                               | Generic 202 `{message}`                                                                                                        |
| `forgot-password`          | `email`                                     | Generic 202 `{message}`, identical for unknown accounts and delivery failures                                                  |
| `reset-password`           | `token,password,confirmPassword`            | 200 `{message}`; no automatic login                                                                                            |

Passwords must be 10–128 characters; confirmation must match. OTP codes are six digits, expire after 10 minutes, allow at most five atomic attempts, and can be consumed once. Successful email delivery starts a 60-second resend cooldown. New-device login emails also have an atomic per-account delivery lease and cooldown. IP and identity limits apply across public auth endpoints. An unverified user with the correct password receives 403 `{verificationRequired:true,email,message}` without another automatic email.

`htv_session` is HttpOnly, SameSite=Lax, Secure in production, and scoped to `/api`. Without remembering, it is a browser session cookie with a 24-hour server expiry. Remembering sets a 30-day cookie and server expiry. `htv_trusted_device` is a separate HttpOnly cookie with a 30-day server record bound to its owner and authentication version. A recognized device still requires the correct password for a fresh login. Trust does not cross accounts.

## Delivery and injection

`createCustomerModule` accepts `auth?: AuthOptions`, exported from `services/customerAuthService.ts`: `{mailer,publicWebUrl,challengeSecret,resetSecret}`. `AuthMailer.send({to,subject,text,html})` is exported from `services/authMail.ts`. Tests inject an in-memory mailbox. Missing configuration fails closed when email authentication is needed.

`createSmtpAuthMailer({host,port,user,password,from,secure})` constructs the transport lazily. The default submission port is 587 with STARTTLS required and certificate validation enabled; connection, greeting, and socket timeouts are bounded. Provider failures become a generic 503 without exposing provider messages. User text is HTML escaped. Code/token/password/provider errors are never logged.

OTP challenges become active only after successful delivery. A reservation serializes delivery; a failed provider call releases it immediately and retains any previously active code. An initial failed registration may be retried with the same password, without replacing identity or password. Account identity cannot be overwritten by a registration retry. An email owner can recover an unverified account through the password-reset link even if another person pre-registered the address; reset revokes the prior password and all challenges, while email OTP verification remains required.

Reset links use the configured public web origin at `/dat-lai-mat-khau?token=...`. Forgot-password and verification-resend acknowledgments return independently of database lookup and SMTP latency to avoid timing-based recipient enumeration. Background delivery failures permit another request and do not claim delivery success. Tokens contain 256 random bits, are HMAC-digested with a separate key, expire in 20 minutes, and are consumed by one atomic conditional password update. Reset increments `authVersion`, immediately invalidating all older sessions, trusted devices, and OTP challenges even if record cleanup is delayed. It clears the current browser cookies and requires a fresh password-and-OTP login.

Use independent, high-entropy keys of at least 32 characters for OTP and reset HMAC domains. Deployment may derive purpose-specific keys from the existing strong server secret. Never reuse an SMTP password as a challenge secret.

## Existing accounts

For backward compatibility, accounts created before this feature have no `emailVerification` marker and are treated as verified. `initializeCustomerIndexes` explicitly migrates missing authentication versions to zero. New self-registrations always have `emailVerification:'required'` and `verifiedAt:null`; they cannot receive a session until verified. Existing staff/admin accounts still require a login OTP on new devices. Administrators create staff through the role-checked staff endpoint.

## Verification

`auth-security.test.ts` uses isolated MongoMemoryServer databases and fake email delivery. It covers password confirmation, role injection, unverified session denial, safe registration retries, failed provider retry, device-owner binding, password checks on trusted devices, code attempts and expiry, reset expiry and concurrent one-use consumption, total authentication revocation, legacy roles, CSRF, and concurrent login delivery reservations. `customer-api.test.ts` completes registration/login OTP flows before exercising account, staff, order, voucher, and CMS constraints. Tests must set `DOTENV_CONFIG_PATH` to a controlled empty test file; they do not make SMTP or Gemini requests.
