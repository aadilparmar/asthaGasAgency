# Move from Supabase (PostgreSQL) to cPanel MySQL

Follow these steps in order. **Don't skip steps.** Anything in `code formatting` is a value you must replace or a command you must run.

---

## Step 1 — Create the MySQL database in cPanel

1. Log in to your cPanel.
2. Find and click **MySQL® Databases** (under the "Databases" section).
3. Under **Create New Database**:
   - Type a name, e.g. `astha`
   - cPanel will automatically prefix it, so the real name becomes something like `youruser_astha`
   - Click **Create Database**.
4. **Write down the full database name** that cPanel shows. Example: `kakisotech_astha`.

---

## Step 2 — Create a MySQL user in cPanel

Still in the **MySQL® Databases** page:

1. Scroll down to **MySQL Users → Add New User**:
   - Username: e.g. `astha`  → real name becomes something like `youruser_astha`
   - Password: click **Password Generator**, copy the password somewhere safe, tick the confirmation box, and click **Use Password**.
   - Click **Create User**.
2. **Write down**:
   - Full username (e.g. `kakisotech_astha`)
   - Password

---

## Step 3 — Connect the user to the database

Still in the **MySQL® Databases** page:

1. Scroll to **Add User To Database**:
   - User: the one you just made
   - Database: the one you just made
   - Click **Add**.
2. On the next screen, tick **ALL PRIVILEGES** and click **Make Changes**.

---

## Step 4 — Allow your computer to connect (Remote MySQL)

This is the step everyone forgets. By default cPanel blocks outside connections.

1. Go back to cPanel home → click **Remote MySQL®** (under "Databases").
2. In the **Host** box:
   - To allow only your current internet IP: open https://whatismyip.com in another tab, copy your IP, paste it here.
   - To allow from anywhere (less secure but easier): type `%` (a single percent sign).
3. Click **Add Host**.

> If you skip this step, you'll get errors like `connection refused` or `host not allowed`.

---

## Step 5 — Find your cPanel database hostname

The hostname is the server address. Two ways to find it:

- Check the welcome email cPanel sent when you bought hosting — there's usually a line like `Database Host: server123.yourhost.com`.
- Or from cPanel home, look at the **General Information** sidebar on the right. The line **Shared IP Address** works as a fallback, but a real hostname is better.

Common patterns: `your-cpanel-domain.com`, `server.your-host.com`, or an IP like `123.45.67.89`.

---

## Step 6 — Fill in the `.env` file on your computer

Open `F:\AsthaGasAutomation\.env` in any text editor. Replace the placeholder line with your real values:

```
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DATABASE"
```

Real example (yours will differ):

```
DATABASE_URL="mysql://kakisotech_astha:MyStrongPass123@server45.myhost.com:3306/kakisotech_astha"
```

**Watch out for special characters in the password.** If your password contains `@`, `#`, `/`, `:`, `?`, `&`, or spaces, you must URL-encode them. Easiest fix: regenerate the password using only letters and numbers.

Save the file.

---

## Step 7 — Push the database schema and seed it

Open a terminal in the project folder (`F:\AsthaGasAutomation`) and run:

```bash
npm install
npx prisma generate
npx prisma db push
npm run db:seed
```

What each command does:
- `npm install` — installs all dependencies (one-time).
- `prisma generate` — regenerates the Prisma client for MySQL.
- `prisma db push` — creates all the tables in your cPanel MySQL database. **No data is moved yet** — empty tables only.
- `npm run db:seed` — creates the default admin user (`admin` / `astha@2025`), default employees, and cylinder types.

If `prisma db push` fails:
- **`Can't reach database server`** → Step 4 isn't done, or your IP changed. Re-add the current IP under Remote MySQL.
- **`Access denied for user`** → Step 3 not done (user not attached to DB), or wrong password in `.env`.
- **`Unknown database`** → Database name in `.env` doesn't match what cPanel shows (don't forget the `youruser_` prefix).

---

## Step 8 — Run the app

```bash
npm run dev
```

Open http://localhost:3000 and log in with **admin / astha@2025**.

You should see the dashboard with the default employees seeded. The database is now empty of historical data — just the seeded defaults.

---

## Step 9 (optional) — Move your old data from Supabase to MySQL

The cleanest way is to dump data from Supabase as CSV per table, then import via phpMyAdmin.

For each important table in this order (parents before children):
1. `User`
2. `Employee`
3. `CylinderType`, `ConnectionType`, `ExpenseHead`, `CommercialCustomer`, `AppSetting`
4. `Consumer`
5. `DailyOperation`
6. `LoanTransaction`, `MonthlyDeduction`
7. `CylinderSale`, `ConnectionSale`, `DailyExpense`, `CashDenomination`, `OtherIncome`, `OtherExpense`, `CommercialTransaction`, `ConsumerRefill`, `CylinderStockTransaction`

**To export from Supabase:**
- Open Supabase dashboard → Table Editor → pick a table → click the "..." menu → **Export CSV**.

**To import into MySQL via phpMyAdmin:**
1. cPanel → **phpMyAdmin**.
2. Click your database in the left sidebar.
3. Click the table name → **Import** tab.
4. Choose the CSV file.
5. Format: **CSV using LOAD DATA** (or just `CSV`).
6. Format-specific options: tick **The first line of the file contains the table column names**.
7. Click **Import**.

If you'd rather not migrate the historical data, just start fresh — the seed script gives you all the master data you need (employees, cylinder types, OTP bonus setting). You can re-enter recent months from your Excel workbook (`SALARY 2024-25 (4).xlsx`) using the app.

If you want me to write a Python/Node script that pulls data from Supabase and inserts it into MySQL automatically, just say "write the data migration script" and I'll build it.

---

## Step 10 — Deploying the app to cPanel (only if you want to host it there too)

Next.js needs Node.js, which cPanel supports via **Setup Node.js App** (only on hosting plans that allow it):

1. cPanel → **Setup Node.js App** → **Create Application**.
2. Node.js version: 20 or higher.
3. Application mode: Production.
4. Application root: pick a folder like `astha-app`.
5. Application URL: pick your domain or subdomain.
6. Application startup file: `node_modules/next/dist/bin/next` with passenger arg `start`.
   - If that doesn't work, easiest alternative is to set up a custom startup script.
7. After creating, click **Run NPM Install**, then in the env-vars section add `DATABASE_URL` and `JWT_SECRET` (same as your local `.env`).
8. SSH into the server (or use cPanel's terminal), `cd` to the app folder, and run `npm run build`.
9. Restart the app from the cPanel Node.js page.

If your hosting plan does **not** allow Node.js, you cannot run Next.js on it directly — but the MySQL database will still work. You can run the app locally and just point it at the cPanel MySQL, which is what most small businesses do.

---

## Summary of what changed in the code

- `prisma/schema.prisma` — provider switched to `mysql`, removed `directUrl`, added `@db.Text` to long fields (notes, addresses, app setting values).
- `prisma/migrations/` — deleted (the old SQL was PostgreSQL-only). We now use `prisma db push` instead.
- `.env` — switched to a MySQL connection string template. **You must fill in the real values.**
- `.env.example` — added as a clean template.
- `package.json` — build script now uses `prisma db push` instead of `prisma migrate deploy`.

Nothing in `src/` needed changes — all Prisma queries are MySQL-compatible.
